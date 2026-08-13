import { prisma } from "@/lib/prisma";
import type { CancellationStatus } from "@prisma/client";

const PRE_APPROVAL_STATUSES: CancellationStatus[] = [
  "SOLICITADA",
  "PRELIQUIDACION_EN_PROCESO",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
  "EN_REVISION",
];

const POST_APPROVAL_STATUSES: CancellationStatus[] = [
  "PRELIQUIDACION_APROBADA",
  "BAJA_AUTORIZADA",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "EN_DEVOLUCION_EQUIPOS",
  "LIQUIDACION_FINAL",
  "EQUIPOS_RECUPERADOS",
  "BAJA_COMPLETADA",
];

export async function getApprovedPreliquidacion(cancellationId: string) {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    select: {
      id: true,
      status: true,
      activePreliquidacionId: true,
      activePreliquidacion: true,
      preliquidaciones: {
        where: { status: "APROBADA" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!cancellation) return null;

  const approved =
    cancellation.activePreliquidacion?.status === "APROBADA"
      ? cancellation.activePreliquidacion
      : cancellation.preliquidaciones[0] ?? null;

  return { cancellation, approved };
}

export async function assertPreliquidacionApproved(cancellationId: string): Promise<void> {
  const result = await getApprovedPreliquidacion(cancellationId);
  if (!result?.cancellation) throw new Error("NOT_FOUND");

  if (result.approved?.status === "APROBADA") return;

  if (POST_APPROVAL_STATUSES.includes(result.cancellation.status)) {
    throw new Error("PRELIQUIDACION_REQUIRED");
  }

  throw new Error("PRELIQUIDACION_NOT_APPROVED");
}

export function isPreApprovalStatus(status: CancellationStatus): boolean {
  return PRE_APPROVAL_STATUSES.includes(status);
}

export function canRegisterPayment(status: CancellationStatus, hasApproved: boolean): boolean {
  if (!hasApproved) return false;
  return ["BAJA_AUTORIZADA", "PENDIENTE_DE_PAGO"].includes(status);
}

export function canAdvanceFromPayment(status: CancellationStatus): boolean {
  return status === "PAGADA";
}
