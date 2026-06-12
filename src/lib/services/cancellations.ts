import { prisma } from "@/lib/prisma";
import { calculateLiquidation } from "@/lib/liquidation";
import type { CancellationStatus, EquipmentCondition } from "@prisma/client";

export async function getDashboardKpis() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    pendingRequests,
    pendingEquipment,
    pendingAmount,
    completedMonth,
    activePermanence,
    notRecovered,
  ] = await Promise.all([
    prisma.cancellation.count({
      where: { status: { in: ["SOLICITADA", "EN_REVISION", "PENDIENTE_DE_PAGO"] } },
    }),
    prisma.cancellationEquipment.count({
      where: { delivered: false, cancellation: { status: { not: "BAJA_COMPLETADA" } } },
    }),
    prisma.cancellation.aggregate({
      where: { status: { in: ["PENDIENTE_DE_PAGO", "EN_REVISION"] } },
      _sum: { totalAmount: true },
    }),
    prisma.cancellation.count({
      where: { status: "BAJA_COMPLETADA", closeDate: { gte: monthStart } },
    }),
    prisma.cancellation.count({
      where: { permanenceAmount: { gt: 0 }, status: { not: "BAJA_COMPLETADA" } },
    }),
    prisma.cancellationEquipment.count({
      where: {
        OR: [{ delivered: false }, { condition: "NO_ENTREGADO" }],
        cancellation: { status: { not: "BAJA_COMPLETADA" } },
      },
    }),
  ]);

  return {
    pendingRequests,
    pendingEquipment,
    pendingAmount: Number(pendingAmount._sum.totalAmount ?? 0),
    completedMonth,
    activePermanence,
    notRecovered,
  };
}

export async function getCancellation(id: string) {
  return prisma.cancellation.findUnique({
    where: { id },
    include: {
      customer: { include: { equipment: true } },
      createdBy: { select: { name: true } },
      equipment: true,
      charges: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listCancellations(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return prisma.cancellation.findMany({
    where: {
      ...(filters?.status ? { status: filters.status as CancellationStatus } : {}),
      ...(filters?.dateFrom || filters?.dateTo
        ? {
            requestDate: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { requestDate: "desc" },
  });
}

export async function recalculateCancellation(cancellationId: string) {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const config = await prisma.tariffConfig.findFirst();
  const tariffs = await prisma.equipmentTariff.findMany();
  const tariffMap = Object.fromEntries(
    tariffs.map((t) => [t.type, { damagedUsd: Number(t.damagedUsd), notReturnedUsd: Number(t.notReturnedUsd) }])
  );

  const liq = calculateLiquidation({
    serviceStartDate: row.customer.serviceStartDate,
    requestDate: row.requestDate,
    hasTvStreaming: row.customer.hasTvStreaming,
    tvStreamingSince: row.customer.tvStreamingSince,
    pendingBalance: Number(row.customer.pendingBalance),
    config: {
      permanenceMonths: config?.permanenceMonths ?? 18,
      installCostUsd: Number(config?.installCostUsd ?? 200),
      tvMonthlyUsd: Number(config?.tvMonthlyUsd ?? 2),
    },
    equipment: row.equipment.map((e) => ({
      type: e.type,
      delivered: e.delivered,
      condition: e.condition,
    })),
    tariffs: tariffMap,
    extraCharges: row.charges.map((c) => ({ concept: c.concept, amount: Number(c.amount) })),
  });

  return prisma.cancellation.update({
    where: { id: cancellationId },
    data: {
      monthsCompleted: liq.monthsCompleted,
      permanenceAmount: liq.permanenceAmount,
      tvAmount: liq.tvAmount,
      monthlyAmount: liq.monthlyAmount,
      equipmentAmount: liq.equipmentAmount,
      otherAmount: liq.otherAmount,
      totalAmount: liq.totalAmount,
    },
  });
}

export async function initEquipmentChecklist(cancellationId: string, customerId: string) {
  const items = await prisma.customerEquipment.findMany({ where: { customerId } });
  for (const eq of items) {
    const exists = await prisma.cancellationEquipment.findFirst({
      where: { cancellationId, equipmentId: eq.id },
    });
    if (!exists) {
      await prisma.cancellationEquipment.create({
        data: {
          cancellationId,
          equipmentId: eq.id,
          type: eq.type,
          serial: eq.serial,
          delivered: false,
        },
      });
    }
  }
}

export async function updateEquipmentItem(
  id: string,
  data: { delivered?: boolean; condition?: EquipmentCondition | null; notes?: string }
) {
  const item = await prisma.cancellationEquipment.update({
    where: { id },
    data,
    include: { cancellation: true },
  });

  const tariffs = await prisma.equipmentTariff.findMany();
  const tariff = tariffs.find((t) => t.type === item.type);
  let charge = 0;
  if (!item.delivered || item.condition === "NO_ENTREGADO") {
    charge = Number(tariff?.notReturnedUsd ?? 0);
  } else if (item.condition === "DANADO") {
    charge = Number(tariff?.damagedUsd ?? 0);
  }

  await prisma.cancellationEquipment.update({
    where: { id },
    data: { chargeAmount: charge },
  });

  await recalculateCancellation(item.cancellationId);
  return item;
}
