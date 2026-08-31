import { differenceInMonths } from "date-fns";
import {
  assertValidInstallCostUsd,
  assertValidPermanenceMonths,
  assertValidTvMonthlyUsd,
  PermanenceConfigError,
} from "@/lib/permanence-config";

export interface LiquidationInput {
  permanenceStartDate: Date;
  requestDate: Date;
  hasTvStreaming: boolean;
  tvStreamingSince: Date | null;
  pendingBalance: number;
  config: { permanenceMonths: number; installCostUsd: number; tvMonthlyUsd: number };
  extraCharges: { concept: string; amount: number }[];
  /** When set, overrides calculated permanence charge (from permanence module). */
  permanenceAmountOverride?: number;
  monthsCompletedOverride?: number;
}

export interface LiquidationResult {
  monthsCompleted: number;
  permanenceAmount: number;
  fiberInstallPending: boolean;
  tvAmount: number;
  monthlyAmount: number;
  equipmentAmount: number;
  otherAmount: number;
  totalAmount: number;
}

export function calculateLiquidation(input: LiquidationInput): LiquidationResult {
  const permanenceMonths = assertValidPermanenceMonths(input.config.permanenceMonths);
  const installCostUsd = assertValidInstallCostUsd(input.config.installCostUsd);
  const tvMonthlyUsd = assertValidTvMonthlyUsd(input.config.tvMonthlyUsd);

  const monthsCompleted =
    input.monthsCompletedOverride ??
    Math.max(0, differenceInMonths(input.requestDate, input.permanenceStartDate));

  let permanenceAmount: number;
  let fiberInstallPending: boolean;

  if (input.permanenceAmountOverride !== undefined) {
    permanenceAmount = input.permanenceAmountOverride;
    fiberInstallPending = permanenceAmount > 0;
  } else {
    const monthsPending = Math.max(0, permanenceMonths - monthsCompleted);
    const monthlyPermanence = installCostUsd / permanenceMonths;
    permanenceAmount = Math.round(monthsPending * monthlyPermanence * 100) / 100;
    fiberInstallPending = monthsPending > 0;
  }

  let tvAmount = 0;
  if (input.hasTvStreaming && input.tvStreamingSince) {
    const tvMonths = Math.max(1, differenceInMonths(input.requestDate, input.tvStreamingSince));
    tvAmount = Math.round(tvMonths * tvMonthlyUsd * 100) / 100;
  }

  const monthlyAmount = input.pendingBalance;
  const equipmentAmount = 0;
  const otherAmount = input.extraCharges.reduce((s, c) => s + c.amount, 0);
  const totalAmount =
    Math.round((permanenceAmount + tvAmount + monthlyAmount + otherAmount) * 100) / 100;

  if (
    !Number.isFinite(permanenceAmount) ||
    !Number.isFinite(tvAmount) ||
    !Number.isFinite(totalAmount)
  ) {
    throw new PermanenceConfigError("La liquidación produjo un valor inválido.");
  }

  return {
    monthsCompleted,
    permanenceAmount,
    fiberInstallPending,
    tvAmount,
    monthlyAmount,
    equipmentAmount,
    otherAmount,
    totalAmount,
  };
}

export function formatUsd(n: number) {
  return new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(n);
}
