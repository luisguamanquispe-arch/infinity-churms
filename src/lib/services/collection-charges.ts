import { prisma } from "@/lib/prisma";
import {
  COLLECTION_CHARGE_TYPE_LABELS,
  type CollectionChargeTypeValue,
} from "@/lib/constants";

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function formatMonthYear(date: Date): string {
  return `${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function buildConsumptionPeriodLabel(from: Date, to: Date): string {
  const fromLabel = formatMonthYear(from);
  const toLabel = formatMonthYear(to);
  if (fromLabel === toLabel) return fromLabel;
  return `${fromLabel} - ${toLabel}`;
}

export function parseMonthInput(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function monthInputFromDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface CollectionChargeView {
  chargeType: string;
  description?: string | null;
  periodLabel?: string | null;
  periodFrom?: Date | string | null;
  periodTo?: Date | string | null;
  amount: number | string | { toString(): string };
}

export function formatChargeConcept(charge: CollectionChargeView): string {
  return COLLECTION_CHARGE_TYPE_LABELS[charge.chargeType] ?? charge.chargeType;
}

export function formatChargeDetail(charge: CollectionChargeView): string {
  if (charge.periodLabel?.trim()) return charge.periodLabel.trim();
  if (charge.periodFrom && charge.periodTo) {
    return buildConsumptionPeriodLabel(new Date(charge.periodFrom), new Date(charge.periodTo));
  }
  if (charge.description?.trim()) return charge.description.trim();
  return "—";
}

export async function listCollectionCharges(customerId: string) {
  return prisma.collectionCharge.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "asc" }],
    include: { user: { select: { name: true } } },
  });
}

export function totalCharges(charges: { amount: unknown }[]) {
  return Math.round(charges.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100;
}

function resolveOverdueSinceOnBalanceChange(
  currentBalance: number,
  newBalance: number,
  currentOverdueSince: Date | null
): Date | null {
  if (newBalance <= 0) return null;
  if (currentOverdueSince) return currentOverdueSince;
  if (currentBalance <= 0 && newBalance > 0) return new Date();
  return currentOverdueSince;
}

async function syncCustomerBalanceFromCharges(customerId: string) {
  const [customer, charges] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.collectionCharge.findMany({ where: { customerId } }),
  ]);
  if (!customer) throw new Error("NOT_FOUND");

  if (charges.length === 0) {
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        pendingBalance: 0,
        overdueSince: null,
        inCollectionWhitelist: true,
      },
    });
  }

  const newBalance = totalCharges(charges);
  const currentBalance = Number(customer.pendingBalance);

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      pendingBalance: newBalance,
      overdueSince: resolveOverdueSinceOnBalanceChange(
        currentBalance,
        newBalance,
        customer.overdueSince
      ),
      inCollectionWhitelist: newBalance <= 0,
    },
  });
}

function resolvePeriodFields(data: {
  chargeType: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
  description?: string | null;
}) {
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  let periodLabel = data.periodLabel?.trim() || null;

  if (data.chargeType === "CONSUMO_MENSUAL") {
    periodFrom = data.periodFrom ? parseMonthInput(data.periodFrom) : null;
    periodTo = data.periodTo ? parseMonthInput(data.periodTo) : null;
    if (periodFrom && periodTo) {
      periodLabel = buildConsumptionPeriodLabel(periodFrom, periodTo);
    }
  }

  return {
    periodFrom,
    periodTo,
    periodLabel,
    description: data.description?.trim() || null,
  };
}

export async function createCollectionCharge(
  customerId: string,
  userId: string,
  data: {
    chargeType: CollectionChargeTypeValue;
    amount: number;
    description?: string;
    periodLabel?: string;
    periodFrom?: string;
    periodTo?: string;
  }
) {
  if (!data.amount || data.amount <= 0) throw new Error("AMOUNT_REQUIRED");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("NOT_FOUND");

  const period = resolvePeriodFields(data);

  const charge = await prisma.collectionCharge.create({
    data: {
      customerId,
      userId,
      chargeType: data.chargeType,
      amount: data.amount,
      description: period.description,
      periodLabel: period.periodLabel,
      periodFrom: period.periodFrom,
      periodTo: period.periodTo,
    },
    include: { user: { select: { name: true } } },
  });

  const updatedCustomer = await syncCustomerBalanceFromCharges(customerId);
  return { charge, customer: updatedCustomer };
}

export async function updateCollectionCharge(
  customerId: string,
  chargeId: string,
  data: {
    chargeType?: CollectionChargeTypeValue;
    amount?: number;
    description?: string;
    periodLabel?: string;
    periodFrom?: string;
    periodTo?: string;
  }
) {
  const existing = await prisma.collectionCharge.findFirst({
    where: { id: chargeId, customerId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (data.amount !== undefined && data.amount <= 0) throw new Error("AMOUNT_REQUIRED");

  const chargeType = data.chargeType ?? existing.chargeType;
  const period = resolvePeriodFields({
    chargeType,
    periodFrom: data.periodFrom ?? monthInputFromDate(existing.periodFrom),
    periodTo: data.periodTo ?? monthInputFromDate(existing.periodTo),
    periodLabel: data.periodLabel ?? existing.periodLabel ?? undefined,
    description: data.description ?? existing.description ?? undefined,
  });

  const charge = await prisma.collectionCharge.update({
    where: { id: chargeId },
    data: {
      chargeType,
      amount: data.amount ?? Number(existing.amount),
      description: period.description,
      periodLabel: period.periodLabel,
      periodFrom: period.periodFrom,
      periodTo: period.periodTo,
    },
    include: { user: { select: { name: true } } },
  });

  const updatedCustomer = await syncCustomerBalanceFromCharges(customerId);
  return { charge, customer: updatedCustomer };
}

export async function deleteCollectionCharge(customerId: string, chargeId: string) {
  const existing = await prisma.collectionCharge.findFirst({
    where: { id: chargeId, customerId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  await prisma.collectionCharge.delete({ where: { id: chargeId } });
  const updatedCustomer = await syncCustomerBalanceFromCharges(customerId);
  return { customer: updatedCustomer };
}
