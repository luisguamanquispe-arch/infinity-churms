import type { CancellationStatus } from "@prisma/client";

/** Estados que el flujo automático puede producir. */
export const FLOW_CANCELLATION_STATUSES: CancellationStatus[] = [
  "SOLICITADA",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
  "BAJA_AUTORIZADA",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "LIQUIDACION_FINAL",
  "BAJA_COMPLETADA",
];

/**
 * Estados legacy/huérfanos: existen en enum/BD/admin pero el happy path no los escribe.
 * Se mantienen para datos históricos y edición admin.
 */
export const ORPHAN_CANCELLATION_STATUSES: CancellationStatus[] = [
  "PRELIQUIDACION_EN_PROCESO",
  "PRELIQUIDACION_APROBADA",
  "EN_REVISION",
  "EN_DEVOLUCION_EQUIPOS",
  "EQUIPOS_RECUPERADOS",
  "CANCELADA",
];

/** Solicitudes en curso antes de aprobación del cliente (KPI dashboard). */
export const PENDING_REQUEST_STATUSES: CancellationStatus[] = [
  "SOLICITADA",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
];

/** Preliquidación en pipeline operativo. */
export const PRELIQUIDACION_PIPELINE_STATUSES: CancellationStatus[] = [
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
];

/** Bajas abiertas (excluye terminales). */
export const OPEN_CANCELLATION_STATUSES: CancellationStatus[] = [
  ...PENDING_REQUEST_STATUSES,
  "BAJA_AUTORIZADA",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "LIQUIDACION_FINAL",
  ...ORPHAN_CANCELLATION_STATUSES.filter((s) => s !== "CANCELADA"),
];

/** Equipos pendientes de recuperación: bajas abiertas, no completadas/canceladas. */
export const EQUIPMENT_RECOVERY_CANCELLATION_FILTER = {
  status: { notIn: ["BAJA_COMPLETADA", "CANCELADA"] as CancellationStatus[] },
};
