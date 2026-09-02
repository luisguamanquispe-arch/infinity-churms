import type { CancellationStatus } from "@prisma/client";
import {
  EQUIPMENT_RECOVERY_CANCELLATION_FILTER,
  PENDING_REQUEST_STATUSES,
  PRELIQUIDACION_PIPELINE_STATUSES,
} from "@/lib/cancellation-flow-statuses";

export interface DashboardKpiDefinition {
  key: string;
  label: string;
  definition: string;
  includedStatuses: CancellationStatus[] | "derived";
}

export const DASHBOARD_KPI_DEFINITIONS: DashboardKpiDefinition[] = [
  {
    key: "pendingRequests",
    label: "Solicitudes en curso",
    definition: "Bajas abiertas antes de aprobación del cliente (sin estados huérfanos del enum).",
    includedStatuses: PENDING_REQUEST_STATUSES,
  },
  {
    key: "pendingPreliquidacion",
    label: "Preliquidaciones en pipeline",
    definition: "Preliquidación generada o enviada, pendiente de respuesta del cliente.",
    includedStatuses: PRELIQUIDACION_PIPELINE_STATUSES,
  },
  {
    key: "preliquidacionApproved",
    label: "Preliquidación aprobada",
    definition: "Cliente aprobó; baja autorizada para cobro/devolución de equipos.",
    includedStatuses: ["BAJA_AUTORIZADA"],
  },
  {
    key: "preliquidacionRejected",
    label: "Preliquidación rechazada",
    definition: "Cliente rechazó la preliquidación activa.",
    includedStatuses: ["PRELIQUIDACION_RECHAZADA"],
  },
  {
    key: "bajaAutorizada",
    label: "Bajas autorizadas",
    definition: "Estado BAJA_AUTORIZADA (post-aprobación, pre-pago).",
    includedStatuses: ["BAJA_AUTORIZADA"],
  },
  {
    key: "pendingEquipment",
    label: "Equipos sin marcar entregados",
    definition: "Ítems con delivered=false en bajas no completadas ni canceladas.",
    includedStatuses: "derived",
  },
  {
    key: "notRecovered",
    label: "Equipos pendientes de recuperación",
    definition:
      "Equipos no entregados o marcados NO_ENTREGADO en bajas abiertas (misma regla que reporte equipos KPI).",
    includedStatuses: "derived",
  },
  {
    key: "pendingFinalLiquidation",
    label: "Liquidación final pendiente",
    definition: "Bajas en LIQUIDACION_FINAL esperando acta/cierre.",
    includedStatuses: ["LIQUIDACION_FINAL"],
  },
  {
    key: "completedMonth",
    label: "Completadas este mes",
    definition: "BAJA_COMPLETADA con closeDate en el mes calendario actual.",
    includedStatuses: ["BAJA_COMPLETADA"],
  },
  {
    key: "activePermanence",
    label: "Con cobro de permanencia pendiente",
    definition: "Bajas abiertas con permanenceAmount > 0.",
    includedStatuses: "derived",
  },
];

/** Filtro Prisma compartido: equipos pendientes de recuperación (dashboard + reportes). */
export const PENDING_EQUIPMENT_RECOVERY_WHERE = {
  OR: [{ delivered: false }, { condition: "NO_ENTREGADO" as const }],
  cancellation: EQUIPMENT_RECOVERY_CANCELLATION_FILTER,
};
