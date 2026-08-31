import { prisma } from "@/lib/prisma";
import { buildCustomerSearchWhere } from "@/lib/services/customer-search";
import { calculateLiquidation } from "@/lib/liquidation";
import { buildPermanenceSummary, validatePermanenceForCancellation, calculatePermanenceFromStartDate } from "@/lib/permanence";
import {
  resolvePermanenceConfigForCustomer,
  resolvePermanenceTariffForCancellation,
} from "@/lib/permanence-config-resolver";
import type { CancellationReason, CancellationStatus, EquipmentCondition, EquipmentType } from "@prisma/client";
import { deliveryStateForEquipment, isEquipmentReceptionComplete } from "@/lib/equipment-reception";
import { assertPreliquidacionApproved } from "@/lib/preliquidacion-guards";

export const TERMINAL_CANCELLATION_STATUSES: CancellationStatus[] = ["BAJA_COMPLETADA", "CANCELADA"];

export class CancellationConflictError extends Error {
  constructor() {
    super("CUSTOMER_HAS_ACTIVE_CANCELLATION");
    this.name = "CancellationConflictError";
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export async function customerHasActiveCancellation(customerId: string) {
  const count = await prisma.cancellation.count({
    where: {
      customerId,
      status: { notIn: TERMINAL_CANCELLATION_STATUSES },
    },
  });
  return count > 0;
}

export async function customerHasCancellation(customerId: string) {
  return customerHasActiveCancellation(customerId);
}

export interface CreateCancellationInput {
  customerId: string;
  reason: CancellationReason;
  notes?: string | null;
  requestDate: Date;
  createdById: string;
  withdrawalRequestFileName: string;
  withdrawalRequestFileData: string;
}

export async function createCancellationRecord(input: CreateCancellationInput) {
  const permanenceConfig = await resolvePermanenceConfigForCustomer(input.customerId);

  try {
    return await prisma.$transaction(async (tx) => {
      const active = await tx.cancellation.findFirst({
        where: {
          customerId: input.customerId,
          status: { notIn: TERMINAL_CANCELLATION_STATUSES },
        },
      });
      if (active) {
        throw new CancellationConflictError();
      }

      return tx.cancellation.create({
        data: {
          customerId: input.customerId,
          reason: input.reason,
          notes: input.notes,
          requestDate: input.requestDate,
          createdById: input.createdById,
          status: "SOLICITADA",
          withdrawalRequestFileName: input.withdrawalRequestFileName,
          withdrawalRequestFileData: input.withdrawalRequestFileData,
          withdrawalRequestUploadedAt: new Date(),
          permanenceMonthsSnapshot: permanenceConfig.permanenceMonths,
          installCostUsdSnapshot: permanenceConfig.installCostUsd,
          tvMonthlyUsdSnapshot: permanenceConfig.tvMonthlyUsd,
          permanenceConfigSource: permanenceConfig.source,
          planChangeIdSnapshot: permanenceConfig.planChangeId,
        },
      });
    });
  } catch (error) {
    if (error instanceof CancellationConflictError || isPrismaUniqueViolation(error)) {
      throw new CancellationConflictError();
    }
    throw error;
  }
}

export async function getDashboardKpis() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    pendingRequests,
    pendingPreliquidacion,
    preliquidacionApproved,
    preliquidacionRejected,
    bajaAutorizada,
    pendingEquipment,
    pendingAmount,
    pendingFinalLiquidation,
    completedMonth,
    activePermanence,
    notRecovered,
  ] = await Promise.all([
    prisma.cancellation.count({
      where: { status: { in: ["SOLICITADA", "PRELIQUIDACION_EN_PROCESO", "PRELIQUIDACION_GENERADA", "PRELIQUIDACION_ENVIADA", "PRELIQUIDACION_PENDIENTE", "EN_REVISION"] } },
    }),
    prisma.cancellation.count({
      where: { status: { in: ["PRELIQUIDACION_GENERADA", "PRELIQUIDACION_ENVIADA", "PRELIQUIDACION_PENDIENTE"] } },
    }),
    prisma.cancellation.count({
      where: { status: { in: ["PRELIQUIDACION_APROBADA", "BAJA_AUTORIZADA"] } },
    }),
    prisma.cancellation.count({ where: { status: "PRELIQUIDACION_RECHAZADA" } }),
    prisma.cancellation.count({ where: { status: "BAJA_AUTORIZADA" } }),
    prisma.cancellationEquipment.count({
      where: { delivered: false, cancellation: { status: { not: "BAJA_COMPLETADA" } } },
    }),
    prisma.cancellation.aggregate({
      where: { status: { in: ["PENDIENTE_DE_PAGO", "BAJA_AUTORIZADA", "EN_REVISION"] } },
      _sum: { totalAmount: true },
    }),
    prisma.cancellation.count({ where: { status: "LIQUIDACION_FINAL" } }),
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
    pendingPreliquidacion,
    preliquidacionApproved,
    preliquidacionRejected,
    bajaAutorizada,
    pendingEquipment,
    pendingAmount: Number(pendingAmount._sum.totalAmount ?? 0),
    pendingFinalLiquidation,
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
      activePreliquidacion: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          createdBy: { select: { name: true } },
          approvalTokens: {
            where: { isActive: true },
            orderBy: { generatedAt: "desc" },
            take: 1,
            include: { generatedBy: { select: { name: true } } },
          },
        },
      },
      preliquidaciones: {
        orderBy: { version: "desc" },
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          createdBy: { select: { name: true } },
        },
      },
      finalLiquidations: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listCancellations(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const customerSearch = filters?.q?.trim()
    ? { customer: buildCustomerSearchWhere(filters.q.trim()) }
    : {};

  return prisma.cancellation.findMany({
    where: {
      ...customerSearch,
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
      activePreliquidacion: {
        select: { status: true, totalAmount: true, version: true },
      },
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

export async function recalculateCancellation(
  cancellationId: string,
  options?: { permanenceStartOverride?: Date | null }
) {
  const row = await getCancellation(cancellationId);
  if (!row) throw new Error("NOT_FOUND");

  const resolvedTariff = await resolvePermanenceTariffForCancellation(row);
  const tariff = {
    permanenceMonths: resolvedTariff.permanenceMonths,
    installCostUsd: resolvedTariff.installCostUsd,
    tvMonthlyUsd: resolvedTariff.tvMonthlyUsd,
  };

  const permanence = buildPermanenceSummary(customerTechnologyInput(row.customer), row.requestDate, {
    permanenceMonths: tariff.permanenceMonths,
    installCostUsd: tariff.installCostUsd,
  }, { planChangeAddendum: resolvedTariff.planChangeAddendum });

  if (!permanence.canCalculate || !permanence.permanenceStartDate) {
    throw new Error("PERMANENCE_INCOMPLETE");
  }

  const computedStart = new Date(permanence.permanenceStartDate);
  const permanenceStart = options?.permanenceStartOverride ?? computedStart;
  const charge = calculatePermanenceFromStartDate(
    permanenceStart,
    row.requestDate,
    { permanenceMonths: tariff.permanenceMonths, installCostUsd: tariff.installCostUsd }
  );

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
      permanenceStartDate: permanenceStart,
      originTechnology: permanence.originTechnology,
      currentTechnology: permanence.currentTechnology,
      fiberInstallPending: liq.fiberInstallPending,
    },
  });
}

export function customerTechnologyInput(customer: {
  serviceStartDate: Date;
  originTechnology: string;
  currentTechnology: string;
  fiberInstallDate: Date | null;
  fiberMigrationDate: Date | null;
  migrationReviewRequired: boolean;
  contractPermanenceStart?: Date | null;
  contractPermanenceEnd?: Date | null;
}) {
  return {
    serviceStartDate: customer.serviceStartDate,
    originTechnology: customer.originTechnology,
    currentTechnology: customer.currentTechnology,
    fiberInstallDate: customer.fiberInstallDate,
    fiberMigrationDate: customer.fiberMigrationDate,
    migrationReviewRequired: customer.migrationReviewRequired,
    contractPermanenceStart: customer.contractPermanenceStart,
    contractPermanenceEnd: customer.contractPermanenceEnd,
  };
}

export async function getPermanencePreviewForCustomer(customerId: string, requestDate = new Date()) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("NOT_FOUND");
  const resolved = await resolvePermanenceConfigForCustomer(customerId);
  return buildPermanenceSummary(
    customerTechnologyInput(customer),
    requestDate,
    {
      permanenceMonths: resolved.permanenceMonths,
      installCostUsd: resolved.installCostUsd,
    },
    { planChangeAddendum: resolved.planChangeAddendum }
  );
}

export { validatePermanenceForCancellation };

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

  const brand = data.brand?.trim() || null;
  const model = data.model?.trim() || null;
  const serial = data.serial?.trim() || null;
  const delivery = deliveryStateForEquipment(brand, model, serial);

  const customerEq = await prisma.customerEquipment.create({
    data: {
      customerId: cancellation.customerId,
      type: data.type,
      serial,
      brand,
      model,
    },
  });

  const item = await prisma.cancellationEquipment.create({
    data: {
      cancellationId,
      equipmentId: customerEq.id,
      type: data.type,
      serial,
      brand,
      model,
      delivered: delivery.delivered,
      condition: delivery.condition,
      chargeAmount: 0,
    },
  });

  return item;
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
  const current = await prisma.cancellationEquipment.findUnique({ where: { id } });
  if (!current) throw new Error("NOT_FOUND");

  const brand = data.brand !== undefined ? data.brand?.trim() || null : current.brand;
  const model = data.model !== undefined ? data.model?.trim() || null : current.model;
  const serial = data.serial !== undefined ? data.serial?.trim() || null : current.serial;

  let delivered = data.delivered !== undefined ? data.delivered : current.delivered;
  let condition = data.condition !== undefined ? data.condition : current.condition;

  if (isEquipmentReceptionComplete(brand, model, serial)) {
    if (data.delivered === undefined) {
      delivered = true;
    }
    if (delivered && !condition) {
      condition = "BUENO";
    }
  }

  if (data.delivered === true && !condition) {
    condition = "BUENO";
  }
  if (data.delivered === false) {
    condition = null;
  }

  const updateData: {
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
    notes?: string | null;
    delivered: boolean;
    condition: EquipmentCondition | null;
  } = {
    delivered,
    condition,
    ...(data.brand !== undefined ? { brand } : {}),
    ...(data.model !== undefined ? { model } : {}),
    ...(data.serial !== undefined ? { serial } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
  };

  const item = await prisma.cancellationEquipment.update({
    where: { id },
    data: updateData,
    include: { cancellation: true },
  });

  if (item.equipmentId) {
    await prisma.customerEquipment.update({
      where: { id: item.equipmentId },
      data: { brand, model, serial },
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

const VALID_REASONS: CancellationReason[] = [
  "FALLAS_CONTINUAS",
  "INCUMPLIMIENTO_CONTRATO",
  "MUDANZA",
  "PROBLEMAS_ATENCION",
  "MEJOR_OFERTA",
  "DECISION_VOLUNTARIA",
];

const VALID_STATUSES: CancellationStatus[] = [
  "SOLICITADA",
  "PRELIQUIDACION_EN_PROCESO",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
  "PRELIQUIDACION_APROBADA",
  "BAJA_AUTORIZADA",
  "EN_REVISION",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "EN_DEVOLUCION_EQUIPOS",
  "LIQUIDACION_FINAL",
  "EQUIPOS_RECUPERADOS",
  "BAJA_COMPLETADA",
  "CANCELADA",
];

export interface AdminCancellationUpdate {
  reason?: CancellationReason;
  notes?: string | null;
  requestDate?: Date;
  closeDate?: Date | null;
  status?: CancellationStatus;
  invoiceNumber?: string | null;
  clientSignature?: string | null;
  actaNumber?: string | null;
  actaPhysicalCode?: string | null;
  monthsCompleted?: number;
  permanenceStartDate?: Date | null;
  originTechnology?: "FIBRA" | "RADIOENLACE" | null;
  currentTechnology?: "FIBRA" | "RADIOENLACE" | null;
  fiberInstallPending?: boolean | null;
  permanenceAmount?: number;
  tvAmount?: number;
  monthlyAmount?: number;
  equipmentAmount?: number;
  otherAmount?: number;
  totalAmount?: number;
  recalculate?: boolean;
  charges?: { id?: string; concept: string; amount: number }[];
  deletedChargeIds?: string[];
  payments?: {
    id?: string;
    paymentDate: Date;
    method: string;
    invoiceNumber: string;
    amountPaid: number;
    notes?: string | null;
  }[];
  deletedPaymentIds?: string[];
  equipment?: {
    id: string;
    type?: EquipmentType;
    serial?: string | null;
    brand?: string | null;
    model?: string | null;
    delivered?: boolean;
    condition?: EquipmentCondition | null;
    notes?: string | null;
  }[];
}

export async function updateCancellationAdmin(id: string, data: AdminCancellationUpdate) {
  const current = await prisma.cancellation.findUnique({ where: { id } });
  if (!current) throw new Error("NOT_FOUND");

  if (data.reason !== undefined && !VALID_REASONS.includes(data.reason)) {
    throw new Error("INVALID_REASON");
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    throw new Error("INVALID_STATUS");
  }

  const scalarData: Record<string, unknown> = {};

  if (data.reason !== undefined) scalarData.reason = data.reason;
  if (data.notes !== undefined) scalarData.notes = data.notes?.trim() || null;
  if (data.requestDate !== undefined) scalarData.requestDate = data.requestDate;
  if (data.closeDate !== undefined) scalarData.closeDate = data.closeDate;
  if (data.status !== undefined) {
    const requiresApproval = [
      "PENDIENTE_DE_PAGO",
      "PAGADA",
      "EN_DEVOLUCION_EQUIPOS",
      "LIQUIDACION_FINAL",
      "EQUIPOS_RECUPERADOS",
      "BAJA_COMPLETADA",
    ];
    if (requiresApproval.includes(data.status) && data.status !== current.status) {
      await assertPreliquidacionApproved(id);
    }
    scalarData.status = data.status;
    if (data.status === "BAJA_COMPLETADA" && data.closeDate === undefined) {
      scalarData.closeDate = current.closeDate ?? new Date();
    }
    if (data.status !== "BAJA_COMPLETADA" && data.closeDate === undefined) {
      scalarData.closeDate = null;
    }
  }
  if (data.invoiceNumber !== undefined) scalarData.invoiceNumber = data.invoiceNumber?.trim() || null;
  if (data.clientSignature !== undefined) scalarData.clientSignature = data.clientSignature?.trim() || null;
  if (data.actaNumber !== undefined) scalarData.actaNumber = data.actaNumber?.trim() || null;
  if (data.actaPhysicalCode !== undefined) {
    scalarData.actaPhysicalCode = data.actaPhysicalCode?.trim() || null;
  }
  if (data.monthsCompleted !== undefined) scalarData.monthsCompleted = data.monthsCompleted;
  if (data.permanenceStartDate !== undefined) scalarData.permanenceStartDate = data.permanenceStartDate;
  if (data.originTechnology !== undefined) scalarData.originTechnology = data.originTechnology;
  if (data.currentTechnology !== undefined) scalarData.currentTechnology = data.currentTechnology;
  if (data.fiberInstallPending !== undefined) scalarData.fiberInstallPending = data.fiberInstallPending;

  if (!data.recalculate) {
    if (data.permanenceAmount !== undefined) scalarData.permanenceAmount = data.permanenceAmount;
    if (data.tvAmount !== undefined) scalarData.tvAmount = data.tvAmount;
    if (data.monthlyAmount !== undefined) scalarData.monthlyAmount = data.monthlyAmount;
    if (data.equipmentAmount !== undefined) scalarData.equipmentAmount = data.equipmentAmount;
    if (data.otherAmount !== undefined) scalarData.otherAmount = data.otherAmount;
    if (data.totalAmount !== undefined) {
      scalarData.totalAmount = data.totalAmount;
    } else if (
      data.permanenceAmount !== undefined ||
      data.tvAmount !== undefined ||
      data.monthlyAmount !== undefined ||
      data.otherAmount !== undefined
    ) {
      const permanence = data.permanenceAmount ?? Number(current.permanenceAmount);
      const tv = data.tvAmount ?? Number(current.tvAmount);
      const monthly = data.monthlyAmount ?? Number(current.monthlyAmount);
      const other = data.otherAmount ?? Number(current.otherAmount);
      scalarData.totalAmount = Math.round((permanence + tv + monthly + other) * 100) / 100;
    }
  }

  if (Object.keys(scalarData).length > 0) {
    await prisma.cancellation.update({ where: { id }, data: scalarData });
  }

  if (data.deletedChargeIds?.length) {
    await prisma.cancellationCharge.deleteMany({
      where: { id: { in: data.deletedChargeIds }, cancellationId: id },
    });
  }

  if (data.charges?.length) {
    for (const charge of data.charges) {
      if (charge.id) {
        await prisma.cancellationCharge.update({
          where: { id: charge.id },
          data: { concept: charge.concept.trim(), amount: charge.amount },
        });
      } else if (charge.concept.trim()) {
        await prisma.cancellationCharge.create({
          data: { cancellationId: id, concept: charge.concept.trim(), amount: charge.amount },
        });
      }
    }
  }

  if (data.deletedPaymentIds?.length) {
    await prisma.cancellationPayment.deleteMany({
      where: { id: { in: data.deletedPaymentIds }, cancellationId: id },
    });
  }

  if (data.payments?.length) {
    for (const payment of data.payments) {
      if (payment.id) {
        await prisma.cancellationPayment.update({
          where: { id: payment.id },
          data: {
            paymentDate: payment.paymentDate,
            method: payment.method,
            invoiceNumber: payment.invoiceNumber.trim(),
            amountPaid: payment.amountPaid,
            notes: payment.notes?.trim() || null,
          },
        });
      } else if (payment.invoiceNumber.trim()) {
        await prisma.cancellationPayment.create({
          data: {
            cancellationId: id,
            paymentDate: payment.paymentDate,
            method: payment.method,
            invoiceNumber: payment.invoiceNumber.trim(),
            amountPaid: payment.amountPaid,
            notes: payment.notes?.trim() || null,
          },
        });
      }
    }
  }

  if (data.equipment?.length) {
    for (const eq of data.equipment) {
      await updateEquipmentItem(eq.id, {
        brand: eq.brand ?? undefined,
        model: eq.model ?? undefined,
        serial: eq.serial ?? undefined,
        delivered: eq.delivered,
        condition: eq.condition,
        notes: eq.notes ?? undefined,
      });
    }
  }

  const requestDateChanged =
    data.requestDate !== undefined &&
    data.requestDate.getTime() !== current.requestDate.getTime();
  const permanenceStartChanged =
    data.permanenceStartDate !== undefined &&
    (data.permanenceStartDate?.getTime() ?? null) !==
      (current.permanenceStartDate?.getTime() ?? null);

  if (data.recalculate || requestDateChanged || permanenceStartChanged) {
    await recalculateCancellation(id, {
      permanenceStartOverride: permanenceStartChanged ? data.permanenceStartDate : undefined,
    });
  } else if (data.charges?.length || data.deletedChargeIds?.length) {
    const row = await getCancellation(id);
    if (row) {
      const extraTotal = row.charges.reduce((sum, c) => sum + Number(c.amount), 0);
      const base =
        Number(row.permanenceAmount) +
        Number(row.tvAmount) +
        Number(row.monthlyAmount) +
        Number(row.otherAmount);
      await prisma.cancellation.update({
        where: { id },
        data: {
          otherAmount: extraTotal,
          totalAmount: Math.round((base + extraTotal) * 100) / 100,
        },
      });
    }
  }

  return getCancellation(id);
}

export async function deleteCancellationCharge(cancellationId: string, chargeId: string) {
  const charge = await prisma.cancellationCharge.findFirst({
    where: { id: chargeId, cancellationId },
  });
  if (!charge) throw new Error("NOT_FOUND");

  await prisma.cancellationCharge.delete({ where: { id: chargeId } });
  await recalculateCancellation(cancellationId);
}

export async function deleteCancellation(id: string) {
  const row = await prisma.cancellation.findUnique({
    where: { id },
    select: { id: true, customer: { select: { contract: true, name: true } } },
  });
  if (!row) throw new Error("NOT_FOUND");

  await prisma.cancellation.delete({ where: { id } });
  return row;
}
