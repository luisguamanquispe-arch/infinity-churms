import type { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { serializeCancellationForClient } from "@/lib/serialize-cancellation";

type CancellationRow = NonNullable<
  Awaited<ReturnType<typeof import("@/lib/services/cancellations").getCancellation>>
>;

type SerializedCancellation = ReturnType<typeof serializeCancellationForClient>;

function canViewFinancialDetail(role: UserRole): boolean {
  return (
    hasPermission(role, "cancellations:preliquidate_view") ||
    hasPermission(role, "cancellations:payment") ||
    hasPermission(role, "cancellations:charges") ||
    hasPermission(role, "cancellations:close")
  );
}

/** DTO mínimo operativo para TECNICO (equipos, visita, estado). */
function serializeForTecnico(base: SerializedCancellation): SerializedCancellation {
  return {
    ...base,
    permanenceAmount: "0",
    tvAmount: "0",
    monthlyAmount: "0",
    equipmentAmount: "0",
    otherAmount: "0",
    totalAmount: "0",
    charges: [],
    payments: [],
    activePreliquidacion: null,
    finalLiquidations: [],
    customer: {
      ...base.customer,
      pendingBalance: "0",
      planMonthlyUsd: null,
    },
  };
}

export function serializeCancellationByRole(
  row: CancellationRow,
  role: UserRole
): SerializedCancellation {
  const base = serializeCancellationForClient(row);
  if (canViewFinancialDetail(role)) return base;
  if (role === "TECNICO") return serializeForTecnico(base);
  return base;
}

/** Lista de bajas — oculta montos a roles sin permiso financiero. */
export function serializeCancellationListItemByRole<
  T extends {
    permanenceAmount: unknown;
    tvAmount: unknown;
    monthlyAmount: unknown;
    equipmentAmount: unknown;
    otherAmount: unknown;
    totalAmount: unknown;
    activePreliquidacion?: { totalAmount: unknown } | null;
  },
>(row: T, role: UserRole): T {
  if (canViewFinancialDetail(role)) return row;
  return {
    ...row,
    permanenceAmount: 0,
    tvAmount: 0,
    monthlyAmount: 0,
    equipmentAmount: 0,
    otherAmount: 0,
    totalAmount: 0,
    activePreliquidacion: row.activePreliquidacion
      ? { ...row.activePreliquidacion, totalAmount: 0 }
      : null,
  };
}
