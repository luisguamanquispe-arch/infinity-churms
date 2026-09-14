/**
 * Auditoría matemática P1–P6 — solo lectura/ejecución, sin modificar datos.
 */
import { buildLiquidationBreakdownFromInputs } from "@/lib/services/baja-liquidation";
import { allocateCollectionPayments } from "@/lib/services/collection-payment-allocation";

function charge(id: string, chargeType: string, amount: number, createdAt: string) {
  return { id, chargeType, amount, createdAt: new Date(createdAt) };
}

function p3(installCostUsd: number, instalacionPending: number) {
  const charges =
    instalacionPending > 0
      ? [charge("i1", "INSTALACION", instalacionPending, "2025-01-01")]
      : [];
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd, tvMonthlyUsd: 20 },
    monthsCompletedOverride: 0,
    collectionCharges: charges,
    collectionPaymentsTotal: 0,
    cancellationCharges: [],
    equipment: [],
    equipmentTariffs: [],
  });
  const permanenceLine = b.lines.find((l) => l.category === "PERMANENCIA");
  return {
    installAmountCalculated: b.installationCalculated,
    instalacionPendingP1: b.installationPending,
    installationNet: b.installationNet,
    permanenceLine: permanenceLine?.amount ?? 0,
    total: b.total,
  };
}

console.log("=== P3 CASOS ===");
console.log("A", p3(100, 0));
console.log("B", p3(100, 30));
console.log("C", p3(100, 100));
console.log("D", p3(100, 120));

console.log("\n=== STREAMS ===");
{
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-05-01"),
    permanenceStartDate: new Date("2025-05-01"),
    hasTvStreaming: true,
    tvStreamingSince: new Date("2025-03-01"),
    tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 20 },
    collectionCharges: [charge("s1", "STREAMS", 25, "2025-01-01")],
    collectionPaymentsTotal: 0,
    cancellationCharges: [],
    equipment: [],
    equipmentTariffs: [],
  });
  console.log({
    streamsPending: b.streamsPending,
    streamsCalculated: b.streamsCalculated,
    streamsNet: b.streamsNet,
    tvLine: b.lines.find((l) => l.category === "TV")?.amount,
  });
}

console.log("\n=== PAGO PARCIAL ===");
{
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
    collectionCharges: [
      charge("m1", "CONSUMO_MENSUAL", 40, "2025-01-01"),
      charge("i1", "INSTALACION", 50, "2025-01-02"),
      charge("s1", "STREAMS", 30, "2025-01-03"),
    ],
    collectionPaymentsTotal: 30,
    cancellationCharges: [],
    equipment: [],
    equipmentTariffs: [],
  });
  console.log({
    monthlyTotal: b.monthlyTotal,
    installationNet: b.installationNet,
    permanenceLine: b.lines.find((l) => l.category === "PERMANENCIA")?.amount ?? 0,
    streamsNet: b.streamsNet,
    total: b.total,
    note: "P3 estricto: INSTALACION pendiente con install=0 no entra al total — decisión de negocio pendiente",
  });
}

console.log("\n=== CRÉDITOS ===");
{
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
    collectionCharges: [charge("m1", "CONSUMO_MENSUAL", 100, "2025-01-01")],
    collectionPaymentsTotal: 0,
    cancellationCharges: [{ concept: "Crédito", amount: -10 }],
    equipment: [],
    equipmentTariffs: [],
  });
  console.log({
    creditLines: b.lines.filter((l) => l.category === "CREDITO"),
    creditsTotal: b.creditsTotal,
    subtotal: b.subtotal,
    total: b.total,
  });
}

console.log("\n=== 22.40 ESCENARIOS ===");
for (const [label, charges, equip] of [
  ["total=0", [], []],
  ["total<22.40", [charge("m1", "CONSUMO_MENSUAL", 15, "2025-01-01")], []],
  ["total=22.40", [charge("m1", "CONSUMO_MENSUAL", 22.4, "2025-01-01")], []],
  ["total>22.40", [charge("m1", "CONSUMO_MENSUAL", 50, "2025-01-01")], []],
] as const) {
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
    collectionCharges: [...charges],
    collectionPaymentsTotal: 0,
    cancellationCharges: [],
    equipment: [...equip],
    equipmentTariffs: [],
  });
  console.log(label, { total: b.total, uses2240Constant: b.total === 22.4 && label !== "total=22.40" });
}

console.log("\n=== P1 ORDEN ===");
{
  const allocs = allocateCollectionPayments(
    [
      charge("o1", "OTRO", 10, "2025-01-10"),
      charge("c1", "CONSUMO_MENSUAL", 40, "2025-01-05"),
      charge("s1", "STREAMS", 20, "2025-01-03"),
      charge("c2", "CONSUMO_MENSUAL", 30, "2025-01-01"),
    ],
    35
  );
  console.log(
    allocs.map((a) => ({
      id: a.chargeId,
      type: a.chargeType,
      applied: a.appliedAmount,
      pending: a.pendingAmount,
    }))
  );
}

console.log("\n=== OTROS CARGOS DUPLICADO POTENCIAL ===");
{
  const b = buildLiquidationBreakdownFromInputs({
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
    collectionCharges: [charge("o1", "OTRO", 25, "2025-01-01")],
    collectionPaymentsTotal: 0,
    cancellationCharges: [{ concept: "Cargo manual baja", amount: 25 }],
    equipment: [],
    equipmentTariffs: [],
  });
  console.log({
    otroLines: b.lines.filter((l) => l.category === "OTRO"),
    total: b.total,
    note: "Si mismo monto en CollectionCharge OTRO y CancellationCharge, suma 50 — riesgo operacional",
  });
}

console.log("\n=== P6 INMUTABILIDAD (simulación) ===");
{
  const approvedTotal = 300;
  const equipmentEstimated = 80;
  const equipmentAdjustment = -equipmentEstimated;
  const finalTotal = Math.max(0, approvedTotal + equipmentAdjustment);
  console.log({ approvedTotal, equipmentAdjustment, finalTotal, approvedUnchanged: approvedTotal === 300 });
}
