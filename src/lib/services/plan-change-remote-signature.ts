import { addHours } from "date-fns";
import type { SignatureLinkStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  generateIdentityFileId,
  generateSignatureToken,
  hashSignatureToken,
} from "@/lib/plan-change-signature-token";
import {
  validateIdentitySelfie,
  validateSelfieBuffer,
  bufferToSelfieDataUrl,
} from "@/lib/plan-change-selfie";
import { signPlanChange, getTariffConfig } from "@/lib/services/plan-changes";
import { audit } from "@/lib/audit";

export const DEFAULT_WHATSAPP_SIGNATURE_MESSAGE =
  "Hola [NOMBRE].\n\n" +
  "Infinity Internet ha preparado el documento correspondiente a su cambio de plan.\n\n" +
  "Para revisar las condiciones, realizar la verificación de identidad y firmar el documento, ingrese al siguiente enlace:\n\n" +
  "[LINK]\n\n" +
  "Este enlace es temporal y tiene una vigencia limitada.\n\n" +
  "Gracias por confiar en Infinity Internet.";

export type TokenResolveError =
  | "INVALID"
  | "EXPIRED"
  | "COMPLETED"
  | "CANCELLED"
  | "INVALID_STATE";

async function expireTokenIfNeeded(tokenId: string, expiresAt: Date, status: SignatureLinkStatus) {
  if (new Date() > expiresAt && !["COMPLETADO", "FIRMADO", "CANCELADO", "EXPIRADO"].includes(status)) {
    await prisma.planChangeSignatureToken.update({
      where: { id: tokenId },
      data: { status: "EXPIRADO", isActive: false },
    });
    return true;
  }
  return status === "EXPIRADO";
}

export async function resolveSignatureToken(rawToken: string) {
  const tokenHash = hashSignatureToken(rawToken.trim());
  const record = await prisma.planChangeSignatureToken.findUnique({
    where: { tokenHash },
    include: {
      planChange: { include: { customer: true } },
    },
  });

  if (!record || !record.isActive) {
    return { error: "INVALID" as const };
  }

  if (["COMPLETADO", "FIRMADO"].includes(record.status)) {
    return { error: "COMPLETED" as const, record };
  }
  if (record.status === "CANCELADO") {
    return { error: "CANCELLED" as const, record };
  }
  if (record.planChange.status !== "PENDIENTE_DE_FIRMA") {
    return { error: "INVALID_STATE" as const, record };
  }

  const expired = await expireTokenIfNeeded(record.id, record.expiresAt, record.status);
  if (expired) {
    return { error: "EXPIRED" as const, record };
  }

  return { record };
}

export async function generateSignatureLink(planChangeId: string, userId: string, baseUrl?: string) {
  const pc = await prisma.planChange.findUnique({
    where: { id: planChangeId },
    include: { customer: true },
  });
  if (!pc) throw new Error("Cambio de plan no encontrado.");
  if (pc.status !== "PENDIENTE_DE_FIRMA") {
    throw new Error("Solo se puede generar enlace para cambios pendientes de firma.");
  }

  const config = await getTariffConfig();
  const hours = config.signatureLinkExpiryHours ?? 24;
  const { token, hash } = generateSignatureToken();
  const expiresAt = addHours(new Date(), hours);
  const appBase = baseUrl ?? getAppBaseUrl();

  await prisma.$transaction(async (tx) => {
    await tx.planChangeSignatureToken.updateMany({
      where: { planChangeId, isActive: true },
      data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
    });
    await tx.planChangeSignatureToken.create({
      data: {
        planChangeId,
        tokenHash: hash,
        expiresAt,
        generatedById: userId,
        status: "GENERADO",
      },
    });
    await tx.planChange.update({
      where: { id: planChangeId },
      data: { signatureMode: "REMOTA" },
    });
  });

  const url = `${appBase}/firma/${token}`;
  return { url, token, expiresAt };
}

export async function markLinkSent(planChangeId: string, userId: string) {
  const token = await prisma.planChangeSignatureToken.findFirst({
    where: { planChangeId, isActive: true },
    orderBy: { generatedAt: "desc" },
  });
  if (!token) throw new Error("No hay enlace activo.");
  return prisma.planChangeSignatureToken.update({
    where: { id: token.id },
    data: { status: "ENVIADO", sentAt: new Date() },
  });
}

export async function getActiveSignatureToken(planChangeId: string) {
  return prisma.planChangeSignatureToken.findFirst({
    where: { planChangeId, isActive: true },
    orderBy: { generatedAt: "desc" },
    include: { generatedBy: { select: { name: true } } },
  });
}

export function buildWhatsappMessage(params: {
  customerName: string;
  link: string;
  template?: string | null;
}) {
  const template = params.template?.trim() || DEFAULT_WHATSAPP_SIGNATURE_MESSAGE;
  return template.replace(/\[NOMBRE\]/g, params.customerName).replace(/\[LINK\]/g, params.link);
}

export function buildWhatsappUrl(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("593") ? digits : digits ? `593${digits.replace(/^0/, "")}` : "";
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export async function getPublicSignatureSession(rawToken: string) {
  const resolved = await resolveSignatureToken(rawToken);
  if ("error" in resolved && !resolved.record) {
    return { error: resolved.error };
  }

  const { record, error } = resolved as {
    error?: TokenResolveError;
    record: NonNullable<(typeof resolved)["record"]>;
  };

  if (error === "COMPLETED") {
    return {
      error: "COMPLETED" as const,
      completedAt: record.completedAt ?? record.signedAt,
      customerName: record.planChange.customer.name,
      planName: record.planChange.newPlanName,
      monthlyUsd: Number(record.planChange.newMonthlyUsd),
      permanenceMonths: record.planChange.permanenceMonths,
      permanenceStart: record.planChange.newPermanenceStart,
      permanenceEnd: record.planChange.newPermanenceEnd,
      addendumNumber: record.planChange.addendumNumber,
    };
  }
  if (error === "EXPIRED") {
    return { error: "EXPIRED" as const };
  }
  if (error === "CANCELLED") {
    return { error: "CANCELLED" as const };
  }
  if (error) {
    return { error };
  }

  const pc = record.planChange;
  const customer = pc.customer;

  if (!record.openedAt) {
    await prisma.planChangeSignatureToken.update({
      where: { id: record.id },
      data: { status: "ABIERTO", openedAt: new Date() },
    });
  }

  return {
    error: null,
    tokenStatus: record.status,
    expiresAt: record.expiresAt.toISOString(),
    customer: {
      name: customer.name,
      cedula: customer.cedula,
    },
    planChange: {
      id: pc.id,
      operationType: pc.operationType,
      addendumNumber: pc.addendumNumber,
      previousPlanName: pc.previousPlanName,
      previousSpeedMbps: pc.previousSpeedMbps,
      previousMonthlyUsd: Number(pc.previousMonthlyUsd),
      newPlanName: pc.newPlanName,
      newSpeedMbps: pc.newSpeedMbps,
      newMonthlyUsd: Number(pc.newMonthlyUsd),
      permanenceMonths: pc.permanenceMonths,
      dataConfirmedAt: pc.dataConfirmedAt,
      adendumAcceptedAt: pc.adendumAcceptedAt,
      identitySelfieAt: pc.identitySelfieAt,
      signatureImageData: pc.signatureImageData ? true : false,
    },
    steps: {
      dataConfirmed: !!pc.dataConfirmedAt,
      adendumAccepted: !!pc.adendumAcceptedAt,
      selfieUploaded: !!pc.identitySelfieAt,
      signatureSaved: !!pc.signatureImageData,
    },
  };
}

export async function processRemoteSignatureAction(
  rawToken: string,
  action: string,
  body: Record<string, unknown>,
  meta?: { ip?: string; userAgent?: string }
) {
  const resolved = await resolveSignatureToken(rawToken);
  if ("error" in resolved && resolved.error !== undefined) {
    if (resolved.error === "COMPLETED") throw new Error("SOLICITUD_COMPLETADA");
    if (resolved.error === "EXPIRED") throw new Error("ENLACE_EXPIRADO");
    if (resolved.error === "CANCELLED") throw new Error("ENLACE_CANCELADO");
    throw new Error("Enlace no válido.");
  }

  const { record } = resolved;
  const pcId = record.planChangeId;

  if (action === "confirm_data") {
    if (!body.confirmed) throw new Error("Debe confirmar los datos del cambio.");
    await prisma.$transaction([
      prisma.planChange.update({
        where: { id: pcId },
        data: { dataConfirmedAt: new Date() },
      }),
      prisma.planChangeSignatureToken.update({
        where: { id: record.id },
        data: { status: "EN_PROCESO", processStartedAt: record.processStartedAt ?? new Date() },
      }),
    ]);
    return { ok: true };
  }

  if (action === "accept_adendum") {
    if (!body.accepted) throw new Error("Debe aceptar el adendum.");
    const pc = await prisma.planChange.findUnique({ where: { id: pcId } });
    if (!pc?.dataConfirmedAt) throw new Error("Confirme los datos primero.");
    await prisma.planChange.update({
      where: { id: pcId },
      data: { adendumAcceptedAt: new Date() },
    });
    return { ok: true };
  }

  if (action === "upload_selfie") {
    return saveRemoteIdentitySelfie({
      pcId,
      recordId: record.id,
      selfieData: body.selfieData as string,
      meta,
    });
  }

  if (action === "save_signature") {
    const image = body.signatureImageData as string;
    if (!image?.startsWith("data:image")) throw new Error("Firma inválida.");
    const pc = await prisma.planChange.findUnique({ where: { id: pcId } });
    if (!pc?.identitySelfieAt) throw new Error("Debe cargar la selfie primero.");
    await prisma.planChange.update({
      where: { id: pcId },
      data: { signatureImageData: image },
    });
    return { ok: true };
  }

  if (action === "complete") {
    const pc = await prisma.planChange.findUnique({
      where: { id: pcId },
      include: { customer: true },
    });
    if (!pc) throw new Error("Solicitud no encontrada.");
    if (!pc.dataConfirmedAt) throw new Error("Confirme los datos.");
    if (!pc.adendumAcceptedAt) throw new Error("Debe aceptar el adendum.");
    if (!pc.identitySelfieAt || !pc.identitySelfieData) throw new Error("Selfie requerida.");
    if (!pc.signatureImageData) throw new Error("Firma requerida.");
    if (!body.finalConfirm) throw new Error("Confirme el proceso final.");

    const activated = await signPlanChange({
      id: pcId,
      signatureName: pc.customer.name,
      signatureCedula: pc.customer.cedula,
      signatureImageData: pc.signatureImageData,
      signatureConsent: true,
      signatureIp: meta?.ip,
      signatureUserAgent: meta?.userAgent,
      processedByName: "Firma remota · Cliente",
      signatureMode: "REMOTA",
      signedDigitally: true,
    });

    await prisma.planChangeSignatureToken.update({
      where: { id: record.id },
      data: {
        status: "COMPLETADO",
        signedAt: activated.signedAt,
        completedAt: new Date(),
        signIp: meta?.ip ?? null,
        signUserAgent: meta?.userAgent ?? null,
        isActive: false,
      },
    });

    await audit({
      action: "REMOTE_SIGNATURE_COMPLETE",
      entity: "PlanChange",
      entityId: pcId,
      detail: `Firma remota completada · ${activated.addendumNumber}`,
      ipAddress: meta?.ip,
    });

    return {
      ok: true,
      addendumNumber: activated.addendumNumber,
      signedAt: activated.signedAt,
      newPlanName: activated.newPlanName,
      newMonthlyUsd: Number(activated.newMonthlyUsd),
      permanenceStart: activated.newPermanenceStart,
      permanenceEnd: activated.newPermanenceEnd,
    };
  }

  throw new Error("Acción no válida.");
}

async function saveRemoteIdentitySelfie(params: {
  pcId: string;
  recordId: string;
  selfieData: string;
  meta?: { ip?: string; userAgent?: string };
}) {
  const err = validateIdentitySelfie(params.selfieData);
  if (err) throw new Error(err);

  const pc = await prisma.planChange.findUnique({ where: { id: params.pcId } });
  if (!pc?.adendumAcceptedAt) throw new Error("Debe aceptar el adendum primero.");

  const fileId = pc.identitySelfieId ?? generateIdentityFileId();
  await prisma.planChange.update({
    where: { id: params.pcId },
    data: {
      identitySelfieData: params.selfieData.trim(),
      identitySelfieId: fileId,
      identitySelfieAt: new Date(),
    },
  });

  await audit({
    action: "SELFIE_RECEIVED",
    entity: "PlanChange",
    entityId: params.pcId,
    detail: `Selfie identidad · ${fileId}`,
    ipAddress: params.meta?.ip,
  });

  return {
    ok: true,
    steps: {
      dataConfirmed: !!pc.dataConfirmedAt,
      adendumAccepted: true,
      selfieUploaded: true,
      signatureSaved: !!pc.signatureImageData,
    },
  };
}

export async function processRemoteSelfieUpload(
  rawToken: string,
  buffer: Buffer,
  mime: string,
  meta?: { ip?: string; userAgent?: string }
) {
  const resolved = await resolveSignatureToken(rawToken);
  if ("error" in resolved && resolved.error !== undefined) {
    if (resolved.error === "COMPLETED") throw new Error("SOLICITUD_COMPLETADA");
    if (resolved.error === "EXPIRED") throw new Error("ENLACE_EXPIRADO");
    if (resolved.error === "CANCELLED") throw new Error("ENLACE_CANCELADO");
    throw new Error("Enlace no válido.");
  }

  const err = validateSelfieBuffer(buffer, mime);
  if (err) throw new Error(err);

  const dataUrl = bufferToSelfieDataUrl(buffer, mime);
  return saveRemoteIdentitySelfie({
    pcId: resolved.record.planChangeId,
    recordId: resolved.record.id,
    selfieData: dataUrl,
    meta,
  });
}

export async function regenerateSignatureLink(planChangeId: string, userId: string, baseUrl?: string) {
  return generateSignatureLink(planChangeId, userId, baseUrl);
}

export async function cancelSignatureLink(planChangeId: string) {
  await prisma.planChangeSignatureToken.updateMany({
    where: { planChangeId, isActive: true },
    data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
  });
}
