import { addMonths, differenceInDays, differenceInMonths } from "date-fns";
import type { Customer, PlanChange, PlanChangeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function fetchTariffConfig() {
  const row = await prisma.tariffConfig.findFirst();
  return (
    row ?? {
      permanenceMonths: 18,
      renewalMinMonthsCompleted: 18,
      earlyRenewalEnabled: true,
      earlyRenewalDaysBefore: 30,
      renewalAlertDays60: 60,
      renewalAlertDays30: 30,
      renewalAlertDays15: 15,
    }
  );
}

export type ContractEligibilityStatus =
  | "PERMANENCIA_VIGENTE"
  | "PERMANENCIA_CUMPLIDA"
  | "CONTRATO_PROXIMO_VENCER"
  | "CONTRATO_VENCIDO"
  | "RENOVACION_PENDIENTE"
  | "RENOVADO";

export const ELIGIBILITY_LABELS: Record<ContractEligibilityStatus, string> = {
  PERMANENCIA_VIGENTE: "Permanencia vigente",
  PERMANENCIA_CUMPLIDA: "Permanencia cumplida",
  CONTRATO_PROXIMO_VENCER: "Contrato próximo a vencer",
  CONTRATO_VENCIDO: "Contrato vencido",
  RENOVACION_PENDIENTE: "Renovación pendiente",
  RENOVADO: "Renovado recientemente",
};

export interface CustomerContractSummary {
  customerId: string;
  contract: string;
  name: string;
  cedula: string;
  phone: string | null;
  planName: string;
  speedMbps: number | null;
  monthlyUsd: number | null;
  permanenceStart: Date;
  permanenceEnd: Date;
  daysRemaining: number;
  monthsCompleted: number;
  eligibilityStatus: ContractEligibilityStatus;
  eligibleForRenewal: boolean;
  renewalAlert: string | null;
  pendingOperationId: string | null;
}

const ACTIVE_BLOCKING: PlanChangeStatus[] = ["BORRADOR", "PENDIENTE_DE_FIRMA", "FIRMADO"];

export function computePermanenceWindow(customer: {
  serviceStartDate: Date;
  contractPermanenceStart: Date | null;
  contractPermanenceEnd: Date | null;
}, permanenceMonths: number) {
  const start = customer.contractPermanenceStart ?? customer.serviceStartDate;
  const end = customer.contractPermanenceEnd ?? addMonths(start, permanenceMonths);
  return { start, end };
}

export function classifyContractStatus(params: {
  permanenceStart: Date;
  permanenceEnd: Date;
  monthsCompleted: number;
  daysRemaining: number;
  renewalMinMonths: number;
  earlyRenewalEnabled: boolean;
  earlyRenewalDaysBefore: number;
  hasPendingRenewal: boolean;
  recentlyRenewed: boolean;
}): ContractEligibilityStatus {
  if (params.hasPendingRenewal) return "RENOVACION_PENDIENTE";
  if (params.recentlyRenewed) return "RENOVADO";
  if (params.daysRemaining < 0) return "CONTRATO_VENCIDO";
  if (
    params.earlyRenewalEnabled &&
    params.daysRemaining <= params.earlyRenewalDaysBefore
  ) {
    return "CONTRATO_PROXIMO_VENCER";
  }
  if (params.monthsCompleted >= params.renewalMinMonths) return "PERMANENCIA_CUMPLIDA";
  return "PERMANENCIA_VIGENTE";
}

export function isEligibleForRenewal(status: ContractEligibilityStatus): boolean {
  return [
    "PERMANENCIA_CUMPLIDA",
    "CONTRATO_PROXIMO_VENCER",
    "CONTRATO_VENCIDO",
  ].includes(status);
}

export function renewalAlertLabel(
  daysRemaining: number,
  alert60: number,
  alert30: number,
  alert15: number
): string | null {
  if (daysRemaining < 0) return "CONTRATO VENCIDO";
  if (daysRemaining <= alert15) return `RENOVACIÓN EN ${alert15} DÍAS`;
  if (daysRemaining <= alert30) return `RENOVACIÓN EN ${alert30} DÍAS`;
  if (daysRemaining <= alert60) return `RENOVACIÓN EN ${alert60} DÍAS`;
  return null;
}

export async function buildCustomerContractSummary(
  customer: Customer & { planChanges?: Pick<PlanChange, "id" | "status" | "operationType" | "activatedAt">[] }
): Promise<CustomerContractSummary> {
  const config = await fetchTariffConfig();
  const now = new Date();
  const { start, end } = computePermanenceWindow(customer, config.permanenceMonths);
  const daysRemaining = differenceInDays(end, now);
  const monthsCompleted = Math.max(0, differenceInMonths(now, start));

  const pending = customer.planChanges?.find((p) =>
    ACTIVE_BLOCKING.includes(p.status)
  );
  const pendingRenewal = pending &&
    (pending.operationType === "RENOVACION" || pending.operationType === "RENOVACION_CAMBIO_PLAN");

  const lastRenewal = customer.planChanges?.find(
    (p) => p.status === "ACTIVO" && p.operationType !== "CAMBIO_PLAN" && p.activatedAt
  );
  const recentlyRenewed =
    !!lastRenewal?.activatedAt &&
    differenceInDays(now, lastRenewal.activatedAt) <= 30;

  const eligibilityStatus = classifyContractStatus({
    permanenceStart: start,
    permanenceEnd: end,
    monthsCompleted,
    daysRemaining,
    renewalMinMonths: config.renewalMinMonthsCompleted ?? 18,
    earlyRenewalEnabled: config.earlyRenewalEnabled ?? true,
    earlyRenewalDaysBefore: config.earlyRenewalDaysBefore ?? 30,
    hasPendingRenewal: !!pendingRenewal,
    recentlyRenewed,
  });

  return {
    customerId: customer.id,
    contract: customer.contract,
    name: customer.name,
    cedula: customer.cedula,
    phone: customer.phone,
    planName: customer.planName,
    speedMbps: customer.planSpeedMbps,
    monthlyUsd: customer.planMonthlyUsd ? Number(customer.planMonthlyUsd) : null,
    permanenceStart: start,
    permanenceEnd: end,
    daysRemaining,
    monthsCompleted,
    eligibilityStatus,
    eligibleForRenewal: isEligibleForRenewal(eligibilityStatus),
    renewalAlert: renewalAlertLabel(
      daysRemaining,
      config.renewalAlertDays60 ?? 60,
      config.renewalAlertDays30 ?? 30,
      config.renewalAlertDays15 ?? 15
    ),
    pendingOperationId: pending?.id ?? null,
  };
}

export async function listCustomersForRenewal(filter?: string) {
  const customers = await prisma.customer.findMany({
      where: { status: "ACTIVO" },
      include: {
        planChanges: {
          where: { status: { in: [...ACTIVE_BLOCKING, "ACTIVO"] } },
          select: { id: true, status: true, operationType: true, activatedAt: true },
          orderBy: { requestDate: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

  const summaries = await Promise.all(customers.map(buildCustomerContractSummary));

  if (!filter || filter === "todos") return summaries;

  if (filter === "elegibles") {
    return summaries.filter((s) => s.eligibleForRenewal);
  }
  if (filter === "por_vencer") {
    return summaries.filter((s) => s.eligibilityStatus === "CONTRATO_PROXIMO_VENCER");
  }
  if (filter === "vencidos") {
    return summaries.filter((s) => s.eligibilityStatus === "CONTRATO_VENCIDO");
  }
  if (filter === "permanencia_cumplida") {
    return summaries.filter((s) => s.eligibilityStatus === "PERMANENCIA_CUMPLIDA");
  }
  if (filter === "pendiente") {
    return summaries.filter((s) => s.eligibilityStatus === "RENOVACION_PENDIENTE");
  }
  if (filter === "renovados") {
    return summaries.filter((s) => s.eligibilityStatus === "RENOVADO");
  }

  return summaries;
}
