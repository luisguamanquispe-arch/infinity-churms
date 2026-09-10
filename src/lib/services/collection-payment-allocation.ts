/** P1 — prioridad de atribución de pagos de cobranza a cargos. */

export const CHARGE_TYPE_PRIORITY: Record<string, number> = {
  CONSUMO_MENSUAL: 1,
  STREAMS: 2,
  INSTALACION: 3,
  EXCEDENTE_FIBRA: 4,
  CAMBIO_DOMICILIO: 5,
  RECONEXION: 6,
  OTRO: 7,
};

export interface ChargeForAllocation {
  id: string;
  chargeType: string;
  amount: number;
  createdAt: Date;
}

export interface ChargeAllocationResult {
  chargeId: string;
  chargeType: string;
  originalAmount: number;
  appliedAmount: number;
  pendingAmount: number;
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

export function compareChargesForPaymentAllocation(a: ChargeForAllocation, b: ChargeForAllocation): number {
  const pa = CHARGE_TYPE_PRIORITY[a.chargeType] ?? 99;
  const pb = CHARGE_TYPE_PRIORITY[b.chargeType] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * Atribuye pagos globales del cliente a cargos por prioridad de tipo y FIFO intra-tipo.
 */
export function allocateCollectionPayments(
  charges: ChargeForAllocation[],
  totalPaymentAmount: number
): ChargeAllocationResult[] {
  const sorted = [...charges].sort(compareChargesForPaymentAllocation);
  let remaining = roundUsd(Math.max(0, totalPaymentAmount));

  return sorted.map((charge) => {
    const original = roundUsd(Number(charge.amount));
    const applied = roundUsd(Math.min(original, remaining));
    const pending = roundUsd(original - applied);
    remaining = roundUsd(remaining - applied);
    return {
      chargeId: charge.id,
      chargeType: charge.chargeType,
      originalAmount: original,
      appliedAmount: applied,
      pendingAmount: pending,
    };
  });
}

export function sumPendingByChargeType(allocations: ChargeAllocationResult[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const row of allocations) {
    if (row.pendingAmount <= 0) continue;
    byType[row.chargeType] = roundUsd((byType[row.chargeType] ?? 0) + row.pendingAmount);
  }
  return byType;
}

export function pendingForCharge(allocations: ChargeAllocationResult[], chargeId: string): number {
  const row = allocations.find((a) => a.chargeId === chargeId);
  return row ? row.pendingAmount : 0;
}

export function totalPendingFromAllocations(allocations: ChargeAllocationResult[]): number {
  return roundUsd(allocations.reduce((sum, row) => sum + row.pendingAmount, 0));
}
