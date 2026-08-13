import { addHours } from "date-fns";
import type { SignatureLinkStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/app-url";
import { generateSignatureToken, hashSignatureToken } from "@/lib/plan-change-signature-token";
import { audit } from "@/lib/audit";

export const DEFAULT_PRELIQUIDACION_WHATSAPP_MESSAGE =
  "Hola [NOMBRE].\n\n" +
  "Infinity Internet ha preparado la preliquidación de baja de su servicio.\n\n" +
  "Para revisar los valores pendientes y aprobar o rechazar la preliquidación, ingrese al siguiente enlace:\n\n" +
  "[LINK]\n\n" +
  "Este enlace es temporal y tiene una vigencia limitada.\n\n" +
  "Gracias por confiar en Infinity Internet.";

type TokenError = "INVALID" | "EXPIRED" | "COMPLETED" | "CANCELLED" | "INVALID_STATE";

async function expireTokenIfNeeded(tokenId: string, expiresAt: Date, status: SignatureLinkStatus) {
  if (new Date() > expiresAt && !["COMPLETADO", "FIRMADO", "CANCELADO", "EXPIRADO"].includes(status)) {
    await prisma.preliquidacionApprovalToken.update({
      where: { id: tokenId },
      data: { status: "EXPIRADO", isActive: false },
    });
    return true;
  }
  return status === "EXPIRADO";
}

export async function resolvePreliquidacionToken(rawToken: string) {
  const tokenHash = hashSignatureToken(rawToken.trim());
  const record = await prisma.preliquidacionApprovalToken.findUnique({
    where: { tokenHash },
    include: {
      preliquidacion: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          cancellation: { include: { customer: true } },
        },
      },
    },
  });

  if (!record || !record.isActive) {
    return { error: "INVALID" as TokenError };
  }

  if (record.status === "COMPLETADO" || record.preliquidacion.status === "APROBADA") {
    return { error: "COMPLETED" as TokenError, record };
  }
  if (record.status === "CANCELADO") {
    return { error: "CANCELLED" as TokenError, record };
  }
  if (["RECHAZADA", "SUPERSEDED"].includes(record.preliquidacion.status)) {
    return { error: "INVALID_STATE" as TokenError, record };
  }

  const expired = await expireTokenIfNeeded(record.id, record.expiresAt, record.status);
  if (expired) {
    return { error: "EXPIRED" as TokenError, record };
  }

  return { record };
}

export async function generatePreliquidacionLink(
  preliquidacionId: string,
  userId: string,
  baseUrl?: string
) {
  const preliq = await prisma.cancellationPreliquidacion.findUnique({
    where: { id: preliquidacionId },
    include: { cancellation: { include: { customer: true } } },
  });
  if (!preliq) throw new Error("NOT_FOUND");
  if (preliq.status === "APROBADA") throw new Error("ALREADY_APPROVED");
  if (preliq.status === "SUPERSEDED") throw new Error("VERSION_SUPERSEDED");

  const config = await prisma.tariffConfig.findFirst();
  const hours = config?.signatureLinkExpiryHours ?? 24;
  const { token, hash } = generateSignatureToken();
  const expiresAt = addHours(new Date(), hours);
  const appBase = baseUrl ?? getAppBaseUrl();

  await prisma.$transaction(async (tx) => {
    await tx.preliquidacionApprovalToken.updateMany({
      where: {
        preliquidacionId,
        isActive: true,
        status: { in: ["GENERADO", "ENVIADO", "ABIERTO"] },
      },
      data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
    });

    await tx.preliquidacionApprovalToken.create({
      data: {
        preliquidacionId,
        tokenHash: hash,
        expiresAt,
        generatedById: userId,
        status: "GENERADO",
      },
    });

    await tx.cancellationPreliquidacion.update({
      where: { id: preliquidacionId },
      data: { status: "PENDIENTE_APROBACION" },
    });

    await tx.cancellation.update({
      where: { id: preliq.cancellationId },
      data: { status: "PRELIQUIDACION_PENDIENTE" },
    });
  });

  const url = `${appBase}/baja/preliquidacion/${token}`;
  return { url, token, expiresAt };
}

export async function markPreliquidacionLinkOpened(
  tokenId: string,
  ip?: string | null,
  userAgent?: string | null
) {
  const token = await prisma.preliquidacionApprovalToken.findUnique({ where: { id: tokenId } });
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
    await prisma.preliquidacionApprovalToken.update({ where: { id: tokenId }, data });
  }
}

export async function approvePreliquidacionViaToken(
  rawToken: string,
  ip?: string | null,
  userAgent?: string | null
) {
  const resolved = await resolvePreliquidacionToken(rawToken);
  if ("error" in resolved && resolved.error) {
    throw new Error(resolved.error);
  }

  const { record } = resolved;
  const now = new Date();
  const total = Number(record.preliquidacion.totalAmount);

  await prisma.$transaction(async (tx) => {
    await tx.preliquidacionApprovalToken.update({
      where: { id: record.id },
      data: {
        status: "COMPLETADO",
        isActive: false,
        approvedAt: now,
        approveIp: ip ?? null,
        approveUserAgent: userAgent ?? null,
      },
    });

    await tx.cancellationPreliquidacion.update({
      where: { id: record.preliquidacionId },
      data: {
        status: "APROBADA",
        approvedAt: now,
        approvedIp: ip ?? null,
        approvedUserAgent: userAgent ?? null,
        approvedTotal: total,
      },
    });

    await tx.cancellation.update({
      where: { id: record.preliquidacion.cancellationId },
      data: {
        status: "BAJA_AUTORIZADA",
        activePreliquidacionId: record.preliquidacionId,
      },
    });

    await tx.preliquidacionApprovalToken.updateMany({
      where: {
        preliquidacionId: record.preliquidacionId,
        id: { not: record.id },
        isActive: true,
      },
      data: { isActive: false, status: "CANCELADO", cancelledAt: now },
    });
  });

  await audit({
    action: "PRELIQUIDACION_APPROVED",
    entity: "CancellationPreliquidacion",
    entityId: record.preliquidacionId,
    detail: `Cliente aprobó preliquidación V${record.preliquidacion.version} · ${total} USD`,
    ipAddress: ip ?? undefined,
  });

  return record.preliquidacion;
}

export async function rejectPreliquidacionViaToken(
  rawToken: string,
  reason: string,
  ip?: string | null,
  userAgent?: string | null
) {
  const resolved = await resolvePreliquidacionToken(rawToken);
  if ("error" in resolved && resolved.error) {
    throw new Error(resolved.error);
  }

  const { record } = resolved;
  const now = new Date();
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("REASON_REQUIRED");

  await prisma.$transaction(async (tx) => {
    await tx.preliquidacionApprovalToken.update({
      where: { id: record.id },
      data: {
        status: "COMPLETADO",
        isActive: false,
        rejectedAt: now,
        rejectIp: ip ?? null,
        rejectUserAgent: userAgent ?? null,
        rejectionReason: trimmed,
      },
    });

    await tx.cancellationPreliquidacion.update({
      where: { id: record.preliquidacionId },
      data: {
        status: "RECHAZADA",
        rejectedAt: now,
        rejectedIp: ip ?? null,
        rejectedUserAgent: userAgent ?? null,
        rejectionReason: trimmed,
      },
    });

    await tx.cancellation.update({
      where: { id: record.preliquidacion.cancellationId },
      data: { status: "PRELIQUIDACION_RECHAZADA" },
    });
  });

  await audit({
    action: "PRELIQUIDACION_REJECTED",
    entity: "CancellationPreliquidacion",
    entityId: record.preliquidacionId,
    detail: `Cliente rechazó V${record.preliquidacion.version}: ${trimmed}`,
    ipAddress: ip ?? undefined,
  });

  return record.preliquidacion;
}

export function buildWhatsappUrl(phone: string | null | undefined, message: string, link: string) {
  const text = message.replace("[LINK]", link).replace("[NOMBRE]", "cliente");
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function getActivePreliquidacionToken(preliquidacionId: string) {
  return prisma.preliquidacionApprovalToken.findFirst({
    where: { preliquidacionId, isActive: true },
    orderBy: { generatedAt: "desc" },
    include: { generatedBy: { select: { name: true } } },
  });
}

export async function markPreliquidacionLinkSent(preliquidacionId: string, userId: string) {
  const token = await getActivePreliquidacionToken(preliquidacionId);
  if (!token) throw new Error("NO_TOKEN");

  await prisma.$transaction([
    prisma.preliquidacionApprovalToken.update({
      where: { id: token.id },
      data: { status: "ENVIADO", sentAt: new Date() },
    }),
    prisma.cancellationPreliquidacion.update({
      where: { id: preliquidacionId },
      data: { status: "ENVIADA", sentAt: new Date() },
    }),
    prisma.cancellation.update({
      where: { id: (await prisma.cancellationPreliquidacion.findUnique({ where: { id: preliquidacionId } }))!.cancellationId },
      data: { status: "PRELIQUIDACION_ENVIADA" },
    }),
  ]);

  await audit({
    userId,
    action: "PRELIQUIDACION_LINK_SENT",
    entity: "CancellationPreliquidacion",
    entityId: preliquidacionId,
  });
}
