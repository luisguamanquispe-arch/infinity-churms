export class PermanenceConfigError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_PERMANENCE_MONTHS" | "INVALID_INSTALL_COST" = "INVALID_PERMANENCE_MONTHS"
  ) {
    super(message);
    this.name = "PermanenceConfigError";
  }
}

/** Rejects 0, negative, null, undefined, NaN and non-integers. */
export function assertValidPermanenceMonths(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new PermanenceConfigError(
      "permanenceMonths debe ser un entero positivo.",
      "INVALID_PERMANENCE_MONTHS"
    );
  }
  return n;
}

export function assertValidInstallCostUsd(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new PermanenceConfigError(
      "installCostUsd debe ser un número finito mayor o igual a cero.",
      "INVALID_INSTALL_COST"
    );
  }
  return n;
}

export function assertValidTvMonthlyUsd(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new PermanenceConfigError(
      "tvMonthlyUsd debe ser un número finito mayor o igual a cero.",
      "INVALID_INSTALL_COST"
    );
  }
  return n;
}

export interface ResolvedPermanenceTariff {
  permanenceMonths: number;
  installCostUsd: number;
  tvMonthlyUsd: number;
  source: "PLAN_CHANGE" | "TARIFF_DEFAULT";
  planChangeId: string | null;
  planChangeAddendum: string | null;
}

export interface PermanenceTariffSnapshot {
  permanenceMonths: number;
  installCostUsd: number;
  tvMonthlyUsd: number;
}

export function tariffFromCancellationSnapshot(row: {
  permanenceMonthsSnapshot?: number | null;
  installCostUsdSnapshot?: unknown | null;
  tvMonthlyUsdSnapshot?: unknown | null;
}): PermanenceTariffSnapshot | null {
  if (row.permanenceMonthsSnapshot == null || row.installCostUsdSnapshot == null) {
    return null;
  }
  return {
    permanenceMonths: assertValidPermanenceMonths(row.permanenceMonthsSnapshot),
    installCostUsd: assertValidInstallCostUsd(row.installCostUsdSnapshot),
    tvMonthlyUsd: assertValidTvMonthlyUsd(row.tvMonthlyUsdSnapshot ?? 0),
  };
}
