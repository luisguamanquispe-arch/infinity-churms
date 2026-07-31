import { differenceInDays } from "date-fns";

export const PRELEGAL_OVERDUE_DAYS = 90;

export const PRELEGAL_NOTICE = {
  title: "Aviso de Cobranza por Mora Superior a 90 Días",
  greeting: "Estimado(a) cliente:",
  intro:
    "Nuestros registros indican que su cuenta mantiene una **mora superior a 90 días**, " +
    "por lo que se encuentra en estado de **cobranza prelegal**.",
  valuesIntro: "Según nuestro registro, los valores vencidos son los siguientes:",
  contractIntro:
    "Le recordamos que, de conformidad con las condiciones del contrato de prestación de servicios:",
  bullets: [
    "Los **equipos entregados en comodato** (ONU, router, fuente de poder, cables y demás accesorios) deberán ser devueltos en buen estado.",
    "En caso de no realizar la devolución, **se emitirá la factura correspondiente por el valor total de los equipos no entregados**.",
    "De mantenerse la mora, **su obligación podrá ser reportada a la Central de Riesgos**, permaneciendo registrada hasta la cancelación total de la deuda, conforme a la normativa vigente.",
  ],
  callToAction: "Evite estos inconvenientes.",
  invitation:
    "Le invitamos a acercarse a nuestras oficinas o comunicarse con nuestro departamento de cobranzas " +
    "para llegar a un acuerdo de pago y regularizar su situación.",
  company: "Infinity Internet",
  department: "Departamento de Cobranzas",
  tagline: "Nuestro compromiso es encontrar una solución antes de llegar a instancias legales.",
} as const;

export interface PrelegalOverdueSummary {
  overdueDays: number;
  overdueMonths: number;
  overdueSince: Date | null;
  overdueItems: { concept: string; detail: string; amount: number }[];
  totalOverdue: number;
  equipmentExposure: { type: string; label: string; amount: number }[];
  totalEquipmentExposure: number;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  ONU: "ONU",
  ROUTER: "Router",
  STB: "Decodificador (STB)",
  ANTENA: "Antena",
  OTRO: "Otro equipo",
};

export function getOverdueDays(params: {
  pendingBalance: number | string;
  overdueSince: Date | string | null;
}): number {
  const balance = Number(params.pendingBalance);
  if (balance <= 0 || !params.overdueSince) return 0;
  const since = new Date(params.overdueSince);
  if (Number.isNaN(since.getTime())) return 0;
  return Math.max(0, differenceInDays(new Date(), since));
}

export function getOverdueMonths(params: {
  pendingBalance: number | string;
  overdueSince: Date | string | null;
}): number {
  const days = getOverdueDays(params);
  if (days <= 0) return 0;
  return Math.max(1, Math.ceil(days / 30));
}

export function isPrelegalOverdue(params: {
  pendingBalance: number | string;
  overdueSince: Date | string | null;
}): boolean {
  return getOverdueDays(params) >= PRELEGAL_OVERDUE_DAYS;
}

export function buildPrelegalOverdueSummary(params: {
  pendingBalance: number | string;
  overdueSince: Date | string | null;
  planName: string;
  hasTvStreaming: boolean;
  tvStreamingSince: Date | string | null;
  equipment: { type: string; brand?: string | null; model?: string | null }[];
  equipmentTariffs: { type: string; notReturnedUsd: number | string }[];
}): PrelegalOverdueSummary | null {
  if (!isPrelegalOverdue(params)) return null;

  const overdueDays = getOverdueDays(params);
  const overdueMonths = getOverdueMonths(params);
  const overdueSince = params.overdueSince ? new Date(params.overdueSince) : null;
  const pendingBalance = Number(params.pendingBalance);

  const overdueItems: PrelegalOverdueSummary["overdueItems"] = [
    {
      concept: "Valores vencidos (servicios)",
      detail: `Plan ${params.planName} · mora ${overdueDays} días (≈ ${overdueMonths} mes(es))`,
      amount: pendingBalance,
    },
  ];

  const totalOverdue = pendingBalance;

  const tariffMap = Object.fromEntries(
    params.equipmentTariffs.map((t) => [t.type, Number(t.notReturnedUsd)])
  );

  const equipmentExposure = params.equipment.map((eq) => {
    const label = [
      EQUIPMENT_LABELS[eq.type] ?? eq.type,
      eq.brand,
      eq.model,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      type: eq.type,
      label,
      amount: tariffMap[eq.type] ?? 0,
    };
  });

  const totalEquipmentExposure =
    Math.round(equipmentExposure.reduce((s, e) => s + e.amount, 0) * 100) / 100;

  return {
    overdueDays,
    overdueMonths,
    overdueSince,
    overdueItems,
    totalOverdue,
    equipmentExposure,
    totalEquipmentExposure,
  };
}

export function resolveOverdueSinceOnBalanceChange(
  currentBalance: number,
  newBalance: number,
  currentOverdueSince: Date | null
): Date | null {
  if (newBalance <= 0) return null;
  if (currentOverdueSince) return currentOverdueSince;
  if (currentBalance <= 0 && newBalance > 0) return new Date();
  return currentOverdueSince;
}
