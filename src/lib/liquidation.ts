import { differenceInMonths } from "date-fns";

export interface LiquidationInput {
  serviceStartDate: Date;
  requestDate: Date;
  hasTvStreaming: boolean;
  tvStreamingSince: Date | null;
  pendingBalance: number;
  config: { permanenceMonths: number; installCostUsd: number; tvMonthlyUsd: number };
  extraCharges: { concept: string; amount: number }[];
}

export interface LiquidationResult {
  monthsCompleted: number;
  permanenceAmount: number;
  tvAmount: number;
  monthlyAmount: number;
  equipmentAmount: number;
  otherAmount: number;
  totalAmount: number;
}

export function calculateLiquidation(input: LiquidationInput): LiquidationResult {
  const monthsCompleted = Math.max(
    0,
    differenceInMonths(input.requestDate, input.serviceStartDate)
  );
  const monthsPending = Math.max(0, input.config.permanenceMonths - monthsCompleted);
  const monthlyPermanence = input.config.installCostUsd / input.config.permanenceMonths;
  const permanenceAmount = Math.round(monthsPending * monthlyPermanence * 100) / 100;

  let tvAmount = 0;
  if (input.hasTvStreaming && input.tvStreamingSince) {
    const tvMonths = Math.max(1, differenceInMonths(input.requestDate, input.tvStreamingSince));
    tvAmount = Math.round(tvMonths * input.config.tvMonthlyUsd * 100) / 100;
  }

  const monthlyAmount = input.pendingBalance;
  const equipmentAmount = 0;
  const otherAmount = input.extraCharges.reduce((s, c) => s + c.amount, 0);
  const totalAmount =
    Math.round((permanenceAmount + tvAmount + monthlyAmount + otherAmount) * 100) / 100;

  return {
    monthsCompleted,
    permanenceAmount,
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
