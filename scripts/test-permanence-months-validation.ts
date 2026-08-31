/**
 * AUD-004: permanenceMonths inválido nunca produce NaN en liquidación.
 */
import {
  assertValidPermanenceMonths,
  PermanenceConfigError,
} from "@/lib/permanence-config";
import { calculatePermanenceFromStartDate, buildPermanenceSummary } from "@/lib/permanence";
import { calculateLiquidation } from "@/lib/liquidation";

const invalidValues: unknown[] = [0, -1, null, undefined, NaN, "abc", 1.5, Infinity];

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

for (const value of invalidValues) {
  let threw = false;
  try {
    assertValidPermanenceMonths(value);
  } catch (error) {
    threw = error instanceof PermanenceConfigError;
  }
  assert(`assertValidPermanenceMonths rechaza ${String(value)}`, threw);
}

const start = new Date("2025-01-01");
const request = new Date("2025-06-01");

for (const badMonths of [0, -3, NaN]) {
  let threw = false;
  try {
    calculatePermanenceFromStartDate(start, request, { permanenceMonths: badMonths as number, installCostUsd: 200 });
  } catch (error) {
    threw = error instanceof PermanenceConfigError;
  }
  assert(`calculatePermanenceFromStartDate rechaza months=${String(badMonths)}`, threw);
}

let liqThrew = false;
try {
  calculateLiquidation({
    permanenceStartDate: start,
    requestDate: request,
    hasTvStreaming: false,
    tvStreamingSince: null,
    pendingBalance: 10,
    config: { permanenceMonths: 0, installCostUsd: 200, tvMonthlyUsd: 2 },
    extraCharges: [],
  });
} catch (error) {
  liqThrew = error instanceof PermanenceConfigError;
}
assert("calculateLiquidation rechaza permanenceMonths=0", liqThrew);

const summary = buildPermanenceSummary(
  {
    serviceStartDate: "2025-01-01",
    originTechnology: "FIBRA",
    currentTechnology: "FIBRA",
    fiberInstallDate: "2025-01-01",
  },
  request,
  { permanenceMonths: 0, installCostUsd: 200 }
);
assert("buildPermanenceSummary con months=0 no calcula", summary.canCalculate === false);
assert("buildPermanenceSummary con months=0 no produce NaN", Number.isFinite(summary.monthlyPermanenceRate));

console.log(`\n${passed} pruebas OK, ${failed} fallidas`);
if (failed > 0) process.exit(1);
