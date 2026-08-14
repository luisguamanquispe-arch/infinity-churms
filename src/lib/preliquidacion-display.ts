export type PreliquidacionListStatus = "PENDIENTE" | "ENVIADA" | "APROBADA" | "RECHAZADA";

export const PRELIQUIDACION_LIST_LABELS: Record<PreliquidacionListStatus, string> = {
  PENDIENTE: "Pendiente",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const POST_APPROVAL_CANCELLATION = [
  "PRELIQUIDACION_APROBADA",
  "BAJA_AUTORIZADA",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "EN_DEVOLUCION_EQUIPOS",
  "LIQUIDACION_FINAL",
  "EQUIPOS_RECUPERADOS",
  "BAJA_COMPLETADA",
];

export function getPreliquidacionListStatus(
  cancellationStatus: string,
  preliquidacionStatus?: string | null
): PreliquidacionListStatus {
  if (preliquidacionStatus === "APROBADA" || POST_APPROVAL_CANCELLATION.includes(cancellationStatus)) {
    return "APROBADA";
  }
  if (preliquidacionStatus === "RECHAZADA" || cancellationStatus === "PRELIQUIDACION_RECHAZADA") {
    return "RECHAZADA";
  }
  if (
    preliquidacionStatus === "ENVIADA" ||
    preliquidacionStatus === "PENDIENTE_APROBACION" ||
    cancellationStatus === "PRELIQUIDACION_ENVIADA" ||
    cancellationStatus === "PRELIQUIDACION_PENDIENTE"
  ) {
    return "ENVIADA";
  }
  return "PENDIENTE";
}

export const CANCELLATION_FLOW_STEPS = [
  "Solicitud",
  "Preliquidación",
  "Aprobación",
  "Equipos",
  "Liquidación",
  "Baja",
] as const;

/** Índice de la etapa activa (0–5). Etapas anteriores se marcan completadas. */
export function getCancellationFlowStep(cancellationStatus: string): number {
  switch (cancellationStatus) {
    case "SOLICITADA":
      return 0;
    case "PRELIQUIDACION_EN_PROCESO":
    case "PRELIQUIDACION_GENERADA":
    case "EN_REVISION":
      return 1;
    case "PRELIQUIDACION_ENVIADA":
    case "PRELIQUIDACION_PENDIENTE":
    case "PRELIQUIDACION_RECHAZADA":
      return 2;
    case "PRELIQUIDACION_APROBADA":
    case "BAJA_AUTORIZADA":
    case "PENDIENTE_DE_PAGO":
      return 3;
    case "PAGADA":
    case "EN_DEVOLUCION_EQUIPOS":
      return 3;
    case "LIQUIDACION_FINAL":
    case "EQUIPOS_RECUPERADOS":
      return 4;
    case "BAJA_COMPLETADA":
      return 5;
    default:
      return 1;
  }
}

export const PRELIQUIDACION_CATEGORY_LABELS: Record<string, string> = {
  PERMANENCIA: "Instalación / permanencia pendiente",
  MENSUALIDAD: "Mensualidades pendientes",
  EQUIPO: "Equipos pendientes de devolución",
  TV: "Soporte Streams / TV",
  OTRO: "Otros valores",
  CREDITO: "Créditos a favor",
};

export function summarizePreliquidacionByCategory(
  lineItems: { category: string; concept: string; amount: string | number }[]
) {
  const totals: Record<string, number> = {
    PERMANENCIA: 0,
    MENSUALIDAD: 0,
    EQUIPO: 0,
    TV: 0,
    OTRO: 0,
    CREDITO: 0,
  };

  for (const line of lineItems) {
    const amt = Number(line.amount);
    const key = line.category in totals ? line.category : "OTRO";
    totals[key] += amt;
  }

  return totals;
}
