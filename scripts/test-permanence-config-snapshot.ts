/**
 * AUD-003: snapshot de permanencia congelado al crear la baja.
 * Verifica que recalcular con TariffConfig distinto no altera el monto si hay snapshot.
 */
import { calculatePermanenceFromStartDate } from "@/lib/permanence";
import { calculateLiquidation } from "@/lib/liquidation";
import { tariffFromCancellationSnapshot } from "@/lib/permanence-config";

const permanenceStart = new Date("2025-01-01");
const requestDate = new Date("2025-07-01");

const snapshotAtCreate = { permanenceMonths: 18, installCostUsd: 200, tvMonthlyUsd: 2 };
const liveTariffAfterChange = { permanenceMonths: 12, installCostUsd: 999, tvMonthlyUsd: 5 };

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

const snap = tariffFromCancellationSnapshot({
  permanenceMonthsSnapshot: 18,
  installCostUsdSnapshot: 200,
  tvMonthlyUsdSnapshot: 2,
});
assert("tariffFromCancellationSnapshot lee snapshot almacenado", snap !== null);
assert("snapshot conserva 18 meses", snap?.permanenceMonths === 18);

const fromSnapshot = calculatePermanenceFromStartDate(permanenceStart, requestDate, {
  permanenceMonths: snap!.permanenceMonths,
  installCostUsd: snap!.installCostUsd,
});
const fromLiveChanged = calculatePermanenceFromStartDate(permanenceStart, requestDate, {
  permanenceMonths: liveTariffAfterChange.permanenceMonths,
  installCostUsd: liveTariffAfterChange.installCostUsd,
});

assert(
  "cobro con snapshot difiere del TariffConfig vivo modificado",
  fromSnapshot.installAmount !== fromLiveChanged.installAmount,
  `snapshot=${fromSnapshot.installAmount} live=${fromLiveChanged.installAmount}`
);
assert(
  "cobro con snapshot es finito",
  Number.isFinite(fromSnapshot.installAmount),
  String(fromSnapshot.installAmount)
);

const liqSnapshot = calculateLiquidation({
  permanenceStartDate: permanenceStart,
  requestDate,
  hasTvStreaming: false,
  tvStreamingSince: null,
  pendingBalance: 0,
  config: { permanenceMonths: snap!.permanenceMonths, installCostUsd: snap!.installCostUsd, tvMonthlyUsd: snap!.tvMonthlyUsd },
  extraCharges: [],
  permanenceAmountOverride: fromSnapshot.installAmount,
  monthsCompletedOverride: fromSnapshot.monthsInFiber,
});
const liqLive = calculateLiquidation({
  permanenceStartDate: permanenceStart,
  requestDate,
  hasTvStreaming: false,
  tvStreamingSince: null,
  pendingBalance: 0,
  config: liveTariffAfterChange,
  extraCharges: [],
  permanenceAmountOverride: fromLiveChanged.installAmount,
  monthsCompletedOverride: fromLiveChanged.monthsInFiber,
});

assert("preliquidación con snapshot no es NaN", Number.isFinite(liqSnapshot.totalAmount));
assert("preliquidación con snapshot difiere de tarifa viva", liqSnapshot.totalAmount !== liqLive.totalAmount);
assert(
  "recalcular con mismo snapshot produce mismo monto (inmutable)",
  fromSnapshot.installAmount ===
    calculatePermanenceFromStartDate(permanenceStart, requestDate, {
      permanenceMonths: snap!.permanenceMonths,
      installCostUsd: snap!.installCostUsd,
    }).installAmount
);

console.log(`\n${passed} pruebas OK, ${failed} fallidas`);
if (failed > 0) process.exit(1);
