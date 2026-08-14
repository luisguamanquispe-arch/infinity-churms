import { serializePreliquidacion } from "@/lib/serialize-preliquidacion";

type CancellationRow = Awaited<
  ReturnType<typeof import("@/lib/services/cancellations").getCancellation>
>;

/** Serializa una baja para respuestas JSON del cliente (sin PDF archivado). */
export function serializeCancellationForClient(row: NonNullable<CancellationRow>) {
  const { withdrawalRequestFileData: _pdf, ...safe } = row;
  return {
    ...safe,
    requestDate: row.requestDate.toISOString(),
    closeDate: row.closeDate?.toISOString() ?? null,
    permanenceStartDate: row.permanenceStartDate?.toISOString() ?? null,
    permanenceAmount: String(row.permanenceAmount),
    tvAmount: String(row.tvAmount),
    monthlyAmount: String(row.monthlyAmount),
    equipmentAmount: String(row.equipmentAmount),
    otherAmount: String(row.otherAmount),
    totalAmount: String(row.totalAmount),
    withdrawalRequestUploadedAt: row.withdrawalRequestUploadedAt?.toISOString() ?? null,
    customer: {
      ...row.customer,
      serviceStartDate: row.customer.serviceStartDate.toISOString(),
      pendingBalance: String(row.customer.pendingBalance),
      planMonthlyUsd:
        row.customer.planMonthlyUsd != null ? String(row.customer.planMonthlyUsd) : null,
      fiberInstallDate: row.customer.fiberInstallDate?.toISOString() ?? null,
      fiberMigrationDate: row.customer.fiberMigrationDate?.toISOString() ?? null,
      tvStreamingSince: row.customer.tvStreamingSince?.toISOString() ?? null,
    },
    charges: row.charges.map((c) => ({ ...c, amount: String(c.amount) })),
    payments: row.payments.map((p) => ({
      ...p,
      amountPaid: String(p.amountPaid),
      paymentDate: p.paymentDate.toISOString(),
    })),
    activePreliquidacion: serializePreliquidacion(row.activePreliquidacion),
    finalLiquidations: row.finalLiquidations.map((fl) => ({
      ...fl,
      totalAmount: String(fl.totalAmount),
      equipmentAdjustment: String(fl.equipmentAdjustment),
      preliquidacionTotal: String(fl.preliquidacionTotal),
      signedAt: fl.signedAt?.toISOString() ?? null,
      clientSignature: fl.clientSignature,
      signatureMode: fl.signatureMode,
    })),
  };
}
