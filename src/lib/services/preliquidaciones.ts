import type { PreliquidacionLineCategory, PreliquidacionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextPreliquidacionNumber } from "@/lib/acta-number";
import {
  customerTechnologyInput,
  getCancellation,
  recalculateCancellation,
} from "@/lib/services/cancellations";
import { buildPermanenceSummary, calculatePermanenceFromStartDate } from "@/lib/permanence";
import { calculateLiquidation } from "@/lib/liquidation";
import { INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL } from "@/lib/constants";

export interface PreliquidacionLineInput {
  category: PreliquidacionLineCategory;
  concept: string;
  amount: number;
  sortOrder: number;
  metadata?: string;
}

const LOCKED_STATUSES: PreliquidacionStatus[] = ["ENVIADA", "PENDIENTE_APROBACION", "APROBADA"];

const ACTIVE_PRELIQUIDACION_INCLUDE = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  createdBy: { select: { name: true } },
  approvalTokens: {
    where: { isActive: true },
    orderBy: { generatedAt: "desc" as const },
    take: 1,
  },
};

async function findLatestWorkingPreliquidacion(cancellationId: string) {
  return prisma.cancellationPreliquidacion.findFirst({
    where: {
      cancellationId,
      status: { not: "SUPERSEDED" },
    },
    orderBy: { version: "desc" },
    include: ACTIVE_PRELIQUIDACION_INCLUDE,
  });
}

async function linkActivePreliquidacion(cancellationId: string, preliquidacionId: string) {
  await prisma.cancellation.update({
    where: { id: cancellationId },
    data: { activePreliquidacionId: preliquidacionId },
  });
}

export async function listPreliquidaciones(cancellationId: string) {
  return prisma.cancellationPreliquidacion.findMany({
    where: { cancellationId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
      approvalTokens: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          sentAt: true,
          openedAt: true,
          approvedAt: true,
          rejectedAt: true,
        },
      },
    },
    orderBy: { version: "desc" },
  });
}

export async function getActivePreliquidacion(cancellationId: string) {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    include: {
      activePreliquidacion: {
        include: ACTIVE_PRELIQUIDACION_INCLUDE,
      },
    },
  });

  if (cancellation?.activePreliquidacion) {
    return cancellation.activePreliquidacion;
  }

  const latest = await findLatestWorkingPreliquidacion(cancellationId);
  if (!latest) return null;

  if (!cancellation?.activePreliquidacionId) {
    await linkActivePreliquidacion(cancellationId, latest.id);
  }

  return latest;
}

export async function ensureActivePreliquidacion(cancellationId: string, userId: string) {
  const active = await getActivePreliquidacion(cancellationId);
  if (active) return active;
  return createInitialPreliquidacion(cancellationId, userId);
}

async function buildLineItems(cancellationId: string): Promise<PreliquidacionLineInput[]> {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const config = await prisma.tariffConfig.findFirst();
  const tariff = {
    permanenceMonths: config?.permanenceMonths ?? 18,
    installCostUsd: Number(config?.installCostUsd ?? 200),
    tvMonthlyUsd: Number(config?.tvMonthlyUsd ?? 2),
  };

  const activePlanChange = await prisma.planChange.findFirst({
    where: { customerId: row.customerId, status: "ACTIVO" },
    orderBy: { activatedAt: "desc" },
    select: { addendumNumber: true },
  });

  const permanence = buildPermanenceSummary(
    customerTechnologyInput(row.customer),
    row.requestDate,
    tariff,
    { planChangeAddendum: activePlanChange?.addendumNumber ?? null }
  );

  if (!permanence.canCalculate || !permanence.permanenceStartDate) {
    throw new Error("PERMANENCE_INCOMPLETE");
  }

  const permanenceStart = new Date(permanence.permanenceStartDate);
  const charge = calculatePermanenceFromStartDate(permanenceStart, row.requestDate, tariff);

  const liq = calculateLiquidation({
    permanenceStartDate: permanenceStart,
    requestDate: row.requestDate,
    hasTvStreaming: row.customer.hasTvStreaming,
    tvStreamingSince: row.customer.tvStreamingSince,
    pendingBalance: Number(row.customer.pendingBalance),
    config: tariff,
    extraCharges: row.charges.map((c) => ({ concept: c.concept, amount: Number(c.amount) })),
    permanenceAmountOverride: charge.installAmount,
    monthsCompletedOverride: charge.monthsInFiber,
  });

  const lines: PreliquidacionLineInput[] = [];
  let order = 0;

  if (liq.permanenceAmount > 0) {
    lines.push({
      category: "PERMANENCIA",
      concept: INSTALLATION_PRORATION_LABEL,
      amount: liq.permanenceAmount,
      sortOrder: order++,
    });
  }

  if (liq.monthlyAmount > 0) {
    lines.push({
      category: "MENSUALIDAD",
      concept: "Saldo pendiente / mensualidades",
      amount: liq.monthlyAmount,
      sortOrder: order++,
    });
  }

  if (liq.tvAmount > 0) {
    lines.push({
      category: "TV",
      concept: STREAMS_SUPPORT_LABEL,
      amount: liq.tvAmount,
      sortOrder: order++,
    });
  }

  for (const c of row.charges) {
    const amt = Number(c.amount);
    if (amt === 0) continue;
    lines.push({
      category: amt < 0 ? "CREDITO" : "OTRO",
      concept: c.concept,
      amount: amt,
      sortOrder: order++,
    });
  }

  const tariffs = await prisma.equipmentTariff.findMany();
  for (const eq of row.equipment) {
    const t = tariffs.find((x) => x.type === eq.type);
    const notReturned = Number(t?.notReturnedUsd ?? 0);
    const damaged = Number(t?.damagedUsd ?? 0);
    const label = eq.brand || eq.model ? `${eq.type} ${eq.brand ?? ""} ${eq.model ?? ""}`.trim() : eq.type;
    const eqCharge = Number(eq.chargeAmount ?? 0);

    if (!eq.delivered || eq.condition === "NO_ENTREGADO") {
      const value = notReturned > 0 ? notReturned : eqCharge;
      if (value <= 0) continue;
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
      lines.push({
        category: "OTRO",
        concept: `Daño — ${label}`,
        amount: value,
        sortOrder: order++,
        metadata: JSON.stringify({ serial: eq.serial, equipmentId: eq.id, damage: true }),
      });
    }
  }

  return lines;
}

function summarizeLines(lines: PreliquidacionLineInput[]) {
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

  const positiveSubtotal =
    Math.round((permanenceAmount + tvAmount + monthlyAmount + equipmentAmount + otherAmount) * 100) /
    100;
  const totalAmount = Math.round((positiveSubtotal - creditsAmount) * 100) / 100;

  return {
    permanenceAmount,
    tvAmount,
    monthlyAmount,
    equipmentAmount,
    otherAmount,
    creditsAmount,
    subtotal: positiveSubtotal,
    totalAmount: Math.max(0, totalAmount),
  };
}

export async function generatePreliquidacion(
  cancellationId: string,
  userId: string,
  options?: { forceNewVersion?: boolean }
) {
  await recalculateCancellation(cancellationId);

  const existing = await prisma.cancellationPreliquidacion.findMany({
    where: { cancellationId },
    orderBy: { version: "desc" },
  });

  const latest = existing[0];
  if (latest && LOCKED_STATUSES.includes(latest.status) && !options?.forceNewVersion) {
    throw new Error("VERSION_LOCKED");
  }

  if (latest?.status === "APROBADA" && !options?.forceNewVersion) {
    throw new Error("ALREADY_APPROVED");
  }

  const lines = await buildLineItems(cancellationId);
  const summary = summarizeLines(lines);
  const version = latest ? latest.version + 1 : 1;
  const docNumber = await nextPreliquidacionNumber();

  if (latest && !LOCKED_STATUSES.includes(latest.status)) {
    await prisma.cancellationPreliquidacion.update({
      where: { id: latest.id },
      data: { status: "SUPERSEDED" },
    });
  } else if (latest && (latest.status === "RECHAZADA" || latest.status === "SUPERSEDED")) {
    // keep history
  }

  const preliq = await prisma.$transaction(async (tx) => {
    const created = await tx.cancellationPreliquidacion.create({
      data: {
        cancellationId,
        version,
        status: "GENERADA",
        docNumber,
        ...summary,
        createdById: userId,
        lineItems: {
          create: lines.map((l) => ({
            category: l.category,
            concept: l.concept,
            amount: l.amount,
            sortOrder: l.sortOrder,
            metadata: l.metadata ?? null,
          })),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    await tx.cancellation.update({
      where: { id: cancellationId },
      data: {
        activePreliquidacionId: created.id,
        status: "PRELIQUIDACION_GENERADA",
        totalAmount: summary.totalAmount,
        permanenceAmount: summary.permanenceAmount,
        tvAmount: summary.tvAmount,
        monthlyAmount: summary.monthlyAmount,
        equipmentAmount: summary.equipmentAmount,
        otherAmount: summary.otherAmount,
      },
    });

    return created;
  });

  return preliq;
}

export async function createInitialPreliquidacion(cancellationId: string, userId: string) {
  const active = await getActivePreliquidacion(cancellationId);
  if (active) return active;

  return generatePreliquidacion(cancellationId, userId);
}

export async function regeneratePreliquidacion(cancellationId: string, userId: string) {
  const active = await getActivePreliquidacion(cancellationId);
  if (active && LOCKED_STATUSES.includes(active.status)) {
    throw new Error("VERSION_LOCKED");
  }
  return generatePreliquidacion(cancellationId, userId, { forceNewVersion: true });
}

export async function markPreliquidacionSent(preliquidacionId: string) {
  const preliq = await prisma.cancellationPreliquidacion.findUnique({
    where: { id: preliquidacionId },
    include: { cancellation: true },
  });
  if (!preliq) throw new Error("NOT_FOUND");
  if (preliq.status === "APROBADA") throw new Error("ALREADY_APPROVED");

  await prisma.$transaction([
    prisma.cancellationPreliquidacion.update({
      where: { id: preliquidacionId },
      data: { status: "ENVIADA", sentAt: new Date() },
    }),
    prisma.cancellation.update({
      where: { id: preliq.cancellationId },
      data: { status: "PRELIQUIDACION_ENVIADA" },
    }),
  ]);
}

export async function computeFinalLiquidation(cancellationId: string) {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const approved = await prisma.cancellationPreliquidacion.findFirst({
    where: { cancellationId, status: "APROBADA" },
    orderBy: { version: "desc" },
    include: { lineItems: true },
  });
  if (!approved) throw new Error("PRELIQUIDACION_NOT_APPROVED");

  const preTotal = Number(approved.totalAmount);
  let equipmentAdjustment = 0;

  for (const eq of row.equipment) {
    const charge = Number(eq.chargeAmount ?? 0);
    const meta = approved.lineItems.find((l) => {
      if (l.category !== "EQUIPO") return false;
      try {
        const m = JSON.parse(l.metadata ?? "{}") as { equipmentId?: string };
        return m.equipmentId === eq.id;
      } catch {
        return false;
      }
    });
    const estimated = meta ? Number(meta.amount) : 0;
    if (eq.delivered && eq.condition === "BUENO") {
      equipmentAdjustment -= estimated;
    } else if (charge > 0 && charge < estimated) {
      equipmentAdjustment -= estimated - charge;
    }
  }

  equipmentAdjustment = Math.round(equipmentAdjustment * 100) / 100;
  const totalAmount = Math.round((preTotal + equipmentAdjustment) * 100) / 100;

  const existingCount = await prisma.cancellationFinalLiquidation.count({
    where: { cancellationId },
  });

  const liq = await prisma.cancellationFinalLiquidation.create({
    data: {
      cancellationId,
      preliquidacionId: approved.id,
      version: existingCount + 1,
      preliquidacionTotal: preTotal,
      equipmentAdjustment,
      otherAdjustments: 0,
      totalAmount,
    },
  });

  await prisma.cancellation.update({
    where: { id: cancellationId },
    data: {
      status: "LIQUIDACION_FINAL",
      totalAmount,
      equipmentAmount: Math.max(0, Number(row.equipmentAmount) + equipmentAdjustment),
    },
  });

  return liq;
}
