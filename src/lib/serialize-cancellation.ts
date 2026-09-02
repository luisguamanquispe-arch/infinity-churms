import { serializePreliquidacion } from "@/lib/serialize-preliquidacion";

type CancellationRow = Awaited<
  ReturnType<typeof import("@/lib/services/cancellations").getCancellation>
>;

function strDecimal(value: unknown): string {
  return value == null ? "0" : String(value);
}

function strDecimalNullable(value: unknown): string | null {
  return value == null ? null : String(value);
}

/** Serializa una baja para props/JSON del cliente (sin PDF archivado ni relaciones crudas). */
export function serializeCancellationForClient(row: NonNullable<CancellationRow>) {
  return {
    id: row.id,
    customerId: row.customerId,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    requestDate: row.requestDate.toISOString(),
    closeDate: row.closeDate?.toISOString() ?? null,
    permanenceStartDate: row.permanenceStartDate?.toISOString() ?? null,
    originTechnology: row.originTechnology,
    currentTechnology: row.currentTechnology,
    fiberInstallPending: row.fiberInstallPending,
    monthsCompleted: row.monthsCompleted,
    permanenceAmount: strDecimal(row.permanenceAmount),
    tvAmount: strDecimal(row.tvAmount),
    monthlyAmount: strDecimal(row.monthlyAmount),
    equipmentAmount: strDecimal(row.equipmentAmount),
    otherAmount: strDecimal(row.otherAmount),
    totalAmount: strDecimal(row.totalAmount),
    invoiceNumber: row.invoiceNumber,
    clientSignature: row.clientSignature,
    actaNumber: row.actaNumber,
    actaPhysicalCode: row.actaPhysicalCode,
    withdrawalRequestFileName: row.withdrawalRequestFileName,
    withdrawalRequestUploadedAt: row.withdrawalRequestUploadedAt?.toISOString() ?? null,
    activePreliquidacionId: row.activePreliquidacionId,
    permanenceMonthsSnapshot: row.permanenceMonthsSnapshot,
    installCostUsdSnapshot: strDecimalNullable(row.installCostUsdSnapshot),
    tvMonthlyUsdSnapshot: strDecimalNullable(row.tvMonthlyUsdSnapshot),
    permanenceConfigSource: row.permanenceConfigSource,
    planChangeIdSnapshot: row.planChangeIdSnapshot,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customer: {
      id: row.customer.id,
      contract: row.customer.contract,
      name: row.customer.name,
      cedula: row.customer.cedula,
      address: row.customer.address,
      zone: row.customer.zone,
      phone: row.customer.phone,
      planName: row.customer.planName,
      serviceStartDate: row.customer.serviceStartDate.toISOString(),
      pendingBalance: strDecimal(row.customer.pendingBalance),
      planMonthlyUsd: strDecimalNullable(row.customer.planMonthlyUsd),
      originTechnology: row.customer.originTechnology,
      currentTechnology: row.customer.currentTechnology,
      fiberInstallDate: row.customer.fiberInstallDate?.toISOString() ?? null,
      fiberMigrationDate: row.customer.fiberMigrationDate?.toISOString() ?? null,
      hasTvStreaming: row.customer.hasTvStreaming,
      tvStreamingSince: row.customer.tvStreamingSince?.toISOString() ?? null,
    },
    equipment: row.equipment.map((e) => ({
      id: e.id,
      type: e.type,
      serial: e.serial,
      brand: e.brand,
      model: e.model,
      delivered: e.delivered,
      condition: e.condition,
      notes: e.notes,
    })),
    charges: row.charges.map((c) => ({
      id: c.id,
      concept: c.concept,
      amount: strDecimal(c.amount),
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      amountPaid: strDecimal(p.amountPaid),
      method: p.method,
      paymentDate: p.paymentDate.toISOString(),
      notes: p.notes,
    })),
    activePreliquidacion: serializePreliquidacion(row.activePreliquidacion),
    finalLiquidations: row.finalLiquidations.map((fl) => ({
      id: fl.id,
      version: fl.version,
      totalAmount: strDecimal(fl.totalAmount),
      equipmentAdjustment: strDecimal(fl.equipmentAdjustment),
      preliquidacionTotal: strDecimal(fl.preliquidacionTotal),
      otherAdjustments: strDecimal(fl.otherAdjustments),
      signedAt: fl.signedAt?.toISOString() ?? null,
      clientSignature: fl.clientSignature,
      signatureMode: fl.signatureMode,
    })),
  };
}
