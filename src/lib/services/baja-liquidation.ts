import { prisma } from "@/lib/prisma";
import { calculateLiquidation } from "@/lib/liquidation";
import { buildPermanenceSummary, calculatePermanenceFromStartDate } from "@/lib/permanence";
import { INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL } from "@/lib/constants";
import {
  buildConsumptionPeriodLabel,
  formatChargeDetail,
  type CollectionChargeView,
} from "@/lib/services/collection-charges";
import { listCollectionPayments } from "@/lib/services/collection-payments";
import { listCollectionCharges } from "@/lib/services/collection-charges";
import {
  allocateCollectionPayments,
  sumPendingByChargeType,
  pendingForCharge,
  type ChargeForAllocation,
} from "@/lib/services/collection-payment-allocation";
import {
  customerTechnologyInput,
  getCancellation,
} from "@/lib/services/cancellations";
import { resolvePermanenceTariffForCancellation } from "@/lib/permanence-config-resolver";
import type { PreliquidacionLineInput } from "@/lib/services/preliquidaciones";

const OTHER_COLLECTION_CHARGE_TYPES = [
  "EXCEDENTE_FIBRA",
  "CAMBIO_DOMICILIO",
  "RECONEXION",
  "OTRO",
] as const;

export interface LiquidationBreakdown {
  lines: PreliquidacionLineInput[];
  monthlyTotal: number;
  installationCalculated: number;
  installationPending: number;
  installationNet: number;
  streamsPending: number;
  streamsCalculated: number;
  streamsNet: number;
  equipmentTotal: number;
  otherChargesTotal: number;
  creditsTotal: number;
  subtotal: number;
  total: number;
  permanenceAmount: number;
  tvAmount: number;
  monthlyAmount: number;
  equipmentAmount: number;
  otherAmount: number;
  creditsAmount: number;
  monthsCompleted: number;
  fiberInstallPending: boolean;
}

export interface BajaLiquidationEquipmentInput {
  id: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  delivered: boolean;
  condition: string | null;
  chargeAmount: number | string | { toString(): string } | null;
}

export interface BajaLiquidationChargeInput {
  concept: string;
  amount: number;
}

export interface BajaLiquidationCollectionChargeInput extends CollectionChargeView {
  id: string;
  createdAt: Date;
}

export interface BajaLiquidationInput {
  requestDate: Date;
  permanenceStartDate: Date;
  hasTvStreaming: boolean;
  tvStreamingSince: Date | null;
  tariff: { permanenceMonths: number; installCostUsd: number; tvMonthlyUsd: number };
  monthsCompletedOverride?: number;
  collectionCharges: BajaLiquidationCollectionChargeInput[];
  collectionPaymentsTotal: number;
  cancellationCharges: BajaLiquidationChargeInput[];
  equipment: BajaLiquidationEquipmentInput[];
  equipmentTariffs: { type: string; notReturnedUsd: unknown; damagedUsd: unknown }[];
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthlyConcept(charge: BajaLiquidationCollectionChargeInput): string {
  if (charge.periodLabel?.trim()) return charge.periodLabel.trim();
  if (charge.periodFrom && charge.periodTo) {
    return buildConsumptionPeriodLabel(new Date(charge.periodFrom), new Date(charge.periodTo));
  }
  return "Consumo mensual";
}

function buildEquipmentLines(
  equipment: BajaLiquidationEquipmentInput[],
  tariffs: BajaLiquidationInput["equipmentTariffs"],
  startOrder: number
): { lines: PreliquidacionLineInput[]; equipmentTotal: number; damageTotal: number } {
  const lines: PreliquidacionLineInput[] = [];
  let order = startOrder;
  let equipmentTotal = 0;
  let damageTotal = 0;

  for (const eq of equipment) {
    const t = tariffs.find((x) => x.type === eq.type);
    const notReturned = Number(t?.notReturnedUsd ?? 0);
    const damaged = Number(t?.damagedUsd ?? 0);
    const label =
      eq.brand || eq.model ? `${eq.type} ${eq.brand ?? ""} ${eq.model ?? ""}`.trim() : eq.type;
    const eqCharge = Number(eq.chargeAmount ?? 0);

    if (!eq.delivered || eq.condition === "NO_ENTREGADO") {
      const value = notReturned > 0 ? notReturned : eqCharge;
      if (value <= 0) continue;
      equipmentTotal = roundUsd(equipmentTotal + value);
      lines.push({
        category: "EQUIPO",
        concept: `${label} (pendiente de devolución)`,
        amount: value,
        sortOrder: order++,
        metadata: JSON.stringify({ serial: eq.serial, equipmentId: eq.id }),
      });
    } else if (eq.condition === "DANADO") {
      const value = damaged > 0 ? damaged : eqCharge;
      if (value <= 0) continue;
      damageTotal = roundUsd(damageTotal + value);
      lines.push({
        category: "OTRO",
        concept: `Daño — ${label}`,
        amount: value,
        sortOrder: order++,
        metadata: JSON.stringify({ serial: eq.serial, equipmentId: eq.id, damage: true }),
      });
    }
  }

  return { lines, equipmentTotal, damageTotal };
}

export function summarizeLiquidationLines(lines: PreliquidacionLineInput[]): Omit<
  LiquidationBreakdown,
  | "lines"
  | "monthlyTotal"
  | "installationCalculated"
  | "installationPending"
  | "installationNet"
  | "streamsPending"
  | "streamsCalculated"
  | "streamsNet"
  | "equipmentTotal"
  | "otherChargesTotal"
  | "creditsTotal"
  | "monthsCompleted"
  | "fiberInstallPending"
> {
  let permanenceAmount = 0;
  let tvAmount = 0;
  let monthlyAmount = 0;
  let equipmentAmount = 0;
  let otherAmount = 0;
  let creditsAmount = 0;

  for (const line of lines) {
    if (line.category === "PERMANENCIA") permanenceAmount += line.amount;
    else if (line.category === "TV") tvAmount += line.amount;
    else if (line.category === "MENSUALIDAD") monthlyAmount += line.amount;
    else if (line.category === "EQUIPO") equipmentAmount += line.amount;
    else if (line.category === "CREDITO") creditsAmount += Math.abs(line.amount);
    else otherAmount += line.amount;
  }

  const positiveSubtotal = roundUsd(
    permanenceAmount + tvAmount + monthlyAmount + equipmentAmount + otherAmount
  );
  const totalAmount = Math.max(0, roundUsd(positiveSubtotal - creditsAmount));

  return {
    permanenceAmount: roundUsd(permanenceAmount),
    tvAmount: roundUsd(tvAmount),
    monthlyAmount: roundUsd(monthlyAmount),
    equipmentAmount: roundUsd(equipmentAmount),
    otherAmount: roundUsd(otherAmount),
    creditsAmount: roundUsd(creditsAmount),
    subtotal: positiveSubtotal,
    total: totalAmount,
  };
}

/**
 * Fuente única de cálculo P1–P6 para preliquidación de baja (sin acceso a BD).
 */
export function buildLiquidationBreakdownFromInputs(input: BajaLiquidationInput): LiquidationBreakdown {
  const chargeRows: ChargeForAllocation[] = input.collectionCharges.map((c) => ({
    id: c.id,
    chargeType: c.chargeType,
    amount: Number(c.amount),
    createdAt: new Date(c.createdAt),
  }));

  const allocations = allocateCollectionPayments(chargeRows, input.collectionPaymentsTotal);
  const pendingByType = sumPendingByChargeType(allocations);

  const permanenceCharge = calculatePermanenceFromStartDate(
    input.permanenceStartDate,
    input.requestDate,
    {
      permanenceMonths: input.tariff.permanenceMonths,
      installCostUsd: input.tariff.installCostUsd,
    }
  );

  const installationCalculated = roundUsd(permanenceCharge.installAmount);
  const installationPending = roundUsd(pendingByType.INSTALACION ?? 0);
  const installationNet = roundUsd(Math.max(0, installationCalculated - installationPending));

  const streamsCalculated = calculateLiquidation({
    permanenceStartDate: input.permanenceStartDate,
    requestDate: input.requestDate,
    hasTvStreaming: input.hasTvStreaming,
    tvStreamingSince: input.tvStreamingSince,
    pendingBalance: 0,
    config: input.tariff,
    extraCharges: [],
    permanenceAmountOverride: installationCalculated,
    monthsCompletedOverride: input.monthsCompletedOverride ?? permanenceCharge.monthsInFiber,
  }).tvAmount;

  const streamsPending = roundUsd(pendingByType.STREAMS ?? 0);
  const streamsNet = roundUsd(streamsPending > 0 ? streamsPending : streamsCalculated);

  const lines: PreliquidacionLineInput[] = [];
  let order = 0;
  let monthlyTotal = 0;

  for (const charge of input.collectionCharges) {
    if (charge.chargeType !== "CONSUMO_MENSUAL") continue;
    const pending = pendingForCharge(allocations, charge.id);
    if (pending <= 0) continue;
    monthlyTotal = roundUsd(monthlyTotal + pending);
    lines.push({
      category: "MENSUALIDAD",
      concept: monthlyConcept(charge),
      amount: pending,
      sortOrder: order++,
      metadata: JSON.stringify({ chargeId: charge.id }),
    });
  }

  if (installationNet > 0) {
    lines.push({
      category: "PERMANENCIA",
      concept: INSTALLATION_PRORATION_LABEL,
      amount: installationNet,
      sortOrder: order++,
    });
  }

  if (streamsNet > 0) {
    lines.push({
      category: "TV",
      concept: STREAMS_SUPPORT_LABEL,
      amount: streamsNet,
      sortOrder: order++,
    });
  }

  let otherChargesTotal = 0;
  for (const chargeType of OTHER_COLLECTION_CHARGE_TYPES) {
    for (const charge of input.collectionCharges) {
      if (charge.chargeType !== chargeType) continue;
      const pending = pendingForCharge(allocations, charge.id);
      if (pending <= 0) continue;
      otherChargesTotal = roundUsd(otherChargesTotal + pending);
      lines.push({
        category: "OTRO",
        concept: formatChargeDetail(charge),
        amount: pending,
        sortOrder: order++,
        metadata: JSON.stringify({ chargeId: charge.id, chargeType }),
      });
    }
  }

  for (const c of input.cancellationCharges) {
    const amt = roundUsd(Number(c.amount));
    if (amt === 0) continue;
    lines.push({
      category: amt < 0 ? "CREDITO" : "OTRO",
      concept: c.concept,
      amount: amt,
      sortOrder: order++,
    });
    if (amt > 0) otherChargesTotal = roundUsd(otherChargesTotal + amt);
  }

  const equipmentBlock = buildEquipmentLines(input.equipment, input.equipmentTariffs, order);
  lines.push(...equipmentBlock.lines);
  otherChargesTotal = roundUsd(otherChargesTotal + equipmentBlock.damageTotal);

  const summary = summarizeLiquidationLines(lines);

  return {
    lines,
    monthlyTotal: roundUsd(monthlyTotal),
    installationCalculated,
    installationPending,
    installationNet,
    streamsPending,
    streamsCalculated: roundUsd(streamsCalculated),
    streamsNet,
    equipmentTotal: equipmentBlock.equipmentTotal,
    otherChargesTotal,
    creditsTotal: summary.creditsAmount,
    subtotal: summary.subtotal,
    total: summary.total,
    permanenceAmount: summary.permanenceAmount,
    tvAmount: summary.tvAmount,
    monthlyAmount: summary.monthlyAmount,
    equipmentAmount: summary.equipmentAmount,
    otherAmount: summary.otherAmount,
    creditsAmount: summary.creditsAmount,
    monthsCompleted: input.monthsCompletedOverride ?? permanenceCharge.monthsInFiber,
    fiberInstallPending: installationCalculated > 0,
  };
}

export async function computeBajaLiquidation(cancellationId: string): Promise<LiquidationBreakdown> {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const resolvedTariff = await resolvePermanenceTariffForCancellation(row);
  const tariff = {
    permanenceMonths: resolvedTariff.permanenceMonths,
    installCostUsd: resolvedTariff.installCostUsd,
    tvMonthlyUsd: resolvedTariff.tvMonthlyUsd,
  };

  const permanence = buildPermanenceSummary(
    customerTechnologyInput(row.customer),
    row.requestDate,
    tariff,
    { planChangeAddendum: resolvedTariff.planChangeAddendum }
  );

  const computedStart = permanence.permanenceStartDate
    ? new Date(permanence.permanenceStartDate)
    : null;
  const permanenceStart = row.permanenceStartDate
    ? new Date(row.permanenceStartDate)
    : computedStart;

  if (!permanence.canCalculate || !permanenceStart) {
    throw new Error("PERMANENCE_INCOMPLETE");
  }
  const [collectionCharges, payments, equipmentTariffs] = await Promise.all([
    listCollectionCharges(row.customerId),
    listCollectionPayments(row.customerId),
    prisma.equipmentTariff.findMany(),
  ]);

  const collectionPaymentsTotal = roundUsd(
    payments.reduce((sum, p) => sum + Number(p.amount), 0)
  );

  return buildLiquidationBreakdownFromInputs({
    requestDate: row.requestDate,
    permanenceStartDate: permanenceStart,
    hasTvStreaming: row.customer.hasTvStreaming,
    tvStreamingSince: row.customer.tvStreamingSince,
    tariff,
    monthsCompletedOverride: permanence.monthsInFiber,
    collectionCharges: collectionCharges.map((c) => ({
      id: c.id,
      chargeType: c.chargeType,
      amount: c.amount,
      createdAt: c.createdAt,
      periodLabel: c.periodLabel,
      periodFrom: c.periodFrom,
      periodTo: c.periodTo,
      description: c.description,
    })),
    collectionPaymentsTotal,
    cancellationCharges: row.charges.map((c) => ({
      concept: c.concept,
      amount: Number(c.amount),
    })),
    equipment: row.equipment.map((eq) => ({
      id: eq.id,
      type: eq.type,
      brand: eq.brand,
      model: eq.model,
      serial: eq.serial,
      delivered: eq.delivered,
      condition: eq.condition,
      chargeAmount: eq.chargeAmount != null ? Number(eq.chargeAmount) : null,
    })),
    equipmentTariffs,
  });
}

export async function buildPreliquidacionLines(cancellationId: string): Promise<PreliquidacionLineInput[]> {
  const breakdown = await computeBajaLiquidation(cancellationId);
  return breakdown.lines;
}
