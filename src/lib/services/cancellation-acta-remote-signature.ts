import { addHours } from "date-fns";
import type { SignatureLinkStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/app-url";
import { generateSignatureToken, hashSignatureToken } from "@/lib/plan-change-signature-token";
import { audit } from "@/lib/audit";

export const DEFAULT_ACTA_WHATSAPP_MESSAGE =
  "Hola [NOMBRE].\n\n" +
  "Infinity Internet ha preparado el acta de baja y la liquidación final de su servicio.\n\n" +
  "Para revisar el documento y firmar digitalmente desde su celular, ingrese al siguiente enlace:\n\n" +
  "[LINK]\n\n" +
  "Este enlace es temporal y tiene una vigencia limitada.\n\n" +
  "Gracias por confiar en Infinity Internet.";

type TokenError = "INVALID" | "EXPIRED" | "COMPLETED" | "CANCELLED" | "INVALID_STATE";

async function expireTokenIfNeeded(tokenId: string, expiresAt: Date, status: SignatureLinkStatus) {
  if (new Date() > expiresAt && !["COMPLETADO", "FIRMADO", "CANCELADO", "EXPIRADO"].includes(status)) {
    await prisma.cancellationActaSignatureToken.update({
      where: { id: tokenId },
      data: { status: "EXPIRADO", isActive: false },
    });
    return true;
  }
  return status === "EXPIRADO";
}

export async function getLatestFinalLiquidation(cancellationId: string) {
  return prisma.cancellationFinalLiquidation.findFirst({
    where: { cancellationId },
    orderBy: { createdAt: "desc" },
    include: {
      preliquidacion: { include: { lineItems: { orderBy: { sortOrder: "asc" } } } },
    },
  });
}

export async function resolveActaSignatureToken(rawToken: string) {
  const tokenHash = hashSignatureToken(rawToken.trim());
  const record = await prisma.cancellationActaSignatureToken.findUnique({
    where: { tokenHash },
    include: {
      finalLiquidation: {
        include: {
          preliquidacion: { include: { lineItems: { orderBy: { sortOrder: "asc" } } } },
        },
      },
      cancellation: {
        include: {
          customer: true,
          equipment: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!record || !record.isActive) {
    return { error: "INVALID" as TokenError };
  }

  if (record.status === "COMPLETADO" || record.finalLiquidation.signedAt) {
    return { error: "COMPLETED" as TokenError, record };
  }
  if (record.status === "CANCELADO") {
    return { error: "CANCELLED" as TokenError, record };
  }
  if (record.cancellation.status !== "LIQUIDACION_FINAL") {
    return { error: "INVALID_STATE" as TokenError, record };
  }

  const expired = await expireTokenIfNeeded(record.id, record.expiresAt, record.status);
  if (expired) {
    return { error: "EXPIRED" as TokenError, record };
  }

  return { record };
}

export async function generateActaSignatureLink(
  cancellationId: string,
  userId: string,
  baseUrl?: string
) {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    include: { customer: true },
  });
  if (!cancellation) throw new Error("NOT_FOUND");
  if (cancellation.status !== "LIQUIDACION_FINAL") {
    throw new Error("INVALID_STATE");
  }

  const finalLiq = await getLatestFinalLiquidation(cancellationId);
  if (!finalLiq) throw new Error("NO_FINAL_LIQUIDATION");
  if (finalLiq.signedAt) throw new Error("ALREADY_SIGNED");

  const config = await prisma.tariffConfig.findFirst();
  const hours = config?.signatureLinkExpiryHours ?? 24;
  const { token, hash } = generateSignatureToken();
  const expiresAt = addHours(new Date(), hours);
  const appBase = baseUrl ?? getAppBaseUrl();

  await prisma.$transaction(async (tx) => {
    await tx.cancellationActaSignatureToken.updateMany({
      where: {
        finalLiquidationId: finalLiq.id,
        isActive: true,
        status: { in: ["GENERADO", "ENVIADO", "ABIERTO", "EN_PROCESO"] },
      },
      data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
    });

    await tx.cancellationActaSignatureToken.create({
      data: {
        cancellationId,
        finalLiquidationId: finalLiq.id,
        tokenHash: hash,
        expiresAt,
        generatedById: userId,
        status: "GENERADO",
      },
    });

    await tx.cancellationFinalLiquidation.update({
      where: { id: finalLiq.id },
      data: { signatureMode: "REMOTA" },
    });
  });

  const url = `${appBase}/baja/acta/${token}`;
  return { url, token, expiresAt, finalLiquidationId: finalLiq.id };
}

export async function markActaLinkOpened(
  tokenId: string,
  ip?: string | null,
  userAgent?: string | null
) {
  const token = await prisma.cancellationActaSignatureToken.findUnique({ where: { id: tokenId } });
  if (!token) return;

  const data: {
    openedAt?: Date;
    status?: SignatureLinkStatus;
    openIp?: string;
    openUserAgent?: string;
  } = {};

  if (!token.openedAt) {
    data.openedAt = new Date();
    data.status = "ABIERTO";
    if (ip) data.openIp = ip;
    if (userAgent) data.openUserAgent = userAgent;
  }

  if (Object.keys(data).length > 0) {
    await prisma.cancellationActaSignatureToken.update({ where: { id: tokenId }, data });
  }
}

export async function getActiveActaSignatureToken(cancellationId: string) {
  const finalLiq = await getLatestFinalLiquidation(cancellationId);
  if (!finalLiq) return null;

  return prisma.cancellationActaSignatureToken.findFirst({
    where: { finalLiquidationId: finalLiq.id, isActive: true },
    orderBy: { generatedAt: "desc" },
    include: { generatedBy: { select: { name: true } } },
  });
}

export async function markActaLinkSent(cancellationId: string, userId: string) {
  const token = await getActiveActaSignatureToken(cancellationId);
  if (!token) throw new Error("NO_TOKEN");

  await prisma.cancellationActaSignatureToken.update({
    where: { id: token.id },
    data: { status: "ENVIADO", sentAt: new Date() },
  });

  await audit({
    userId,
    action: "ACTA_LINK_SENT",
    entity: "Cancellation",
    entityId: cancellationId,
  });
}

export function buildActaWhatsappUrl(
  phone: string | null | undefined,
  message: string,
  link: string
) {
  const text = message.replace("[LINK]", link);
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("593") ? digits : `593${digits.replace(/^0/, "")}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export async function completeActaRemoteSignature(
  rawToken: string,
  params: {
    clientName: string;
    signatureImageData: string;
    accepted: boolean;
  },
  ip?: string | null,
  userAgent?: string | null
) {
  const resolved = await resolveActaSignatureToken(rawToken);
  if ("error" in resolved && resolved.error) {
    throw new Error(resolved.error);
  }

  const { record } = resolved;
  const name = params.clientName.trim();
  if (!params.accepted) throw new Error("ACCEPT_REQUIRED");
  if (!name) throw new Error("NAME_REQUIRED");
  if (!params.signatureImageData?.startsWith("data:image")) throw new Error("SIGNATURE_INVALID");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.cancellationFinalLiquidation.update({
      where: { id: record.finalLiquidationId },
      data: {
        clientSignature: name,
        signatureImageData: params.signatureImageData,
        actaAcceptedAt: now,
        signedAt: now,
        signIp: ip ?? null,
        signUserAgent: userAgent ?? null,
        signatureMode: "REMOTA",
      },
    });

    await tx.cancellation.update({
      where: { id: record.cancellationId },
      data: {
        clientSignature: name,
      },
    });

    await tx.cancellationActaSignatureToken.update({
      where: { id: record.id },
      data: {
        status: "COMPLETADO",
        isActive: false,
        signedAt: now,
        completedAt: now,
        signIp: ip ?? null,
        signUserAgent: userAgent ?? null,
      },
    });

    await tx.cancellationActaSignatureToken.updateMany({
      where: {
        finalLiquidationId: record.finalLiquidationId,
        id: { not: record.id },
        isActive: true,
      },
      data: { isActive: false, status: "CANCELADO", cancelledAt: now },
    });
  });

  await audit({
    action: "ACTA_SIGNED_REMOTE",
    entity: "Cancellation",
    entityId: record.cancellationId,
    detail: name,
    ipAddress: ip ?? undefined,
  });

  return record.finalLiquidation;
}

export async function assertActaSigned(cancellationId: string): Promise<void> {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    select: { status: true, clientSignature: true },
  });
  if (!cancellation) throw new Error("NOT_FOUND");

  if (cancellation.status !== "LIQUIDACION_FINAL") return;

  const finalLiq = await getLatestFinalLiquidation(cancellationId);
  if (finalLiq?.signedAt) return;
  if (cancellation.clientSignature?.trim()) return;

  throw new Error("ACTA_NOT_SIGNED");
}

export async function recordPresencialActaSignature(cancellationId: string, clientName: string) {
  const name = clientName.trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const finalLiq = await getLatestFinalLiquidation(cancellationId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.cancellation.update({
      where: { id: cancellationId },
      data: { clientSignature: name },
    });
    if (finalLiq) {
      await tx.cancellationFinalLiquidation.update({
        where: { id: finalLiq.id },
        data: {
          clientSignature: name,
          signedAt: now,
          signatureMode: "PRESENCIAL",
          actaAcceptedAt: now,
        },
      });
    }
  });
}

export function publicActaPayload(
  record: NonNullable<Awaited<ReturnType<typeof resolveActaSignatureToken>>["record"]>
) {
  const { cancellation, finalLiquidation } = record;
  const preliq = finalLiquidation.preliquidacion;

  return {
    customerName: cancellation.customer.name,
    cedula: cancellation.customer.cedula,
    contract: cancellation.customer.contract,
    planName: cancellation.customer.planName,
    requestDate: cancellation.requestDate,
    actaNumber: cancellation.actaNumber,
    preliquidacionTotal: Number(finalLiquidation.preliquidacionTotal),
    equipmentAdjustment: Number(finalLiquidation.equipmentAdjustment),
    totalAmount: Number(finalLiquidation.totalAmount),
    preliquidacionVersion: preliq.version,
    equipment: cancellation.equipment.map((e) => ({
      type: e.type,
      brand: e.brand,
      model: e.model,
      serial: e.serial,
      delivered: e.delivered,
      condition: e.condition,
      chargeAmount: Number(e.chargeAmount),
    })),
    signed: !!finalLiquidation.signedAt,
    expiresAt: record.expiresAt,
    tokenStatus: record.status,
  };
}
