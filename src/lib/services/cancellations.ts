import { prisma } from "@/lib/prisma";
import { calculateLiquidation } from "@/lib/liquidation";
import type { CancellationStatus, EquipmentCondition, EquipmentType } from "@prisma/client";

export async function customerHasCancellation(customerId: string) {
  const count = await prisma.cancellation.count({ where: { customerId } });
  return count > 0;
}

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
      customer: { select: { contract: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { requestDate: "desc" },
  });
}

export async function listClosedForAnalysis() {
  return prisma.cancellation.findMany({
    where: { status: "BAJA_COMPLETADA" },
    include: {
      customer: { select: { contract: true, name: true, cedula: true, planName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { closeDate: "desc" },
  });
}

export async function recalculateCancellation(cancellationId: string) {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const config = await prisma.tariffConfig.findFirst();
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
    extraCharges: row.charges.map((c) => ({ concept: c.concept, amount: Number(c.amount) })),
  });

  return prisma.cancellation.update({
    where: { id: cancellationId },
    data: {
      monthsCompleted: liq.monthsCompleted,
      permanenceAmount: liq.permanenceAmount,
      tvAmount: liq.tvAmount,
      monthlyAmount: liq.monthlyAmount,
      equipmentAmount: 0,
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
          brand: eq.brand,
          model: eq.model,
          delivered: false,
        },
      });
    }
  }
}

export async function addCancellationEquipment(
  cancellationId: string,
  data: { type: EquipmentType; serial?: string; brand?: string; model?: string }
) {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    select: { id: true, customerId: true, status: true },
  });
  if (!cancellation) throw new Error("NOT_FOUND");
  if (["EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"].includes(cancellation.status)) {
    throw new Error("CLOSED");
  }

  const customerEq = await prisma.customerEquipment.create({
    data: {
      customerId: cancellation.customerId,
      type: data.type,
      serial: data.serial?.trim() || null,
      brand: data.brand?.trim() || null,
      model: data.model?.trim() || null,
    },
  });

  return prisma.cancellationEquipment.create({
    data: {
      cancellationId,
      equipmentId: customerEq.id,
      type: data.type,
      serial: data.serial?.trim() || null,
      brand: data.brand?.trim() || null,
      model: data.model?.trim() || null,
      delivered: false,
    },
  });
}

export async function updateEquipmentItem(
  id: string,
  data: {
    delivered?: boolean;
    condition?: EquipmentCondition | null;
    notes?: string;
    brand?: string;
    model?: string;
    serial?: string;
  }
) {
  const item = await prisma.cancellationEquipment.update({
    where: { id },
    data,
    include: { cancellation: true },
  });

  if (item.equipmentId && (data.brand !== undefined || data.model !== undefined || data.serial !== undefined)) {
    await prisma.customerEquipment.update({
      where: { id: item.equipmentId },
      data: {
        ...(data.brand !== undefined ? { brand: data.brand?.trim() || null } : {}),
        ...(data.model !== undefined ? { model: data.model?.trim() || null } : {}),
        ...(data.serial !== undefined ? { serial: data.serial?.trim() || null } : {}),
      },
    });
  }

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

  return item;
}
