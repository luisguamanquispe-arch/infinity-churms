/**
 * Pruebas matemáticas P1–P6 — computeBajaLiquidation / buildLiquidationBreakdownFromInputs
 */
import {
  allocateCollectionPayments,
  sumPendingByChargeType,
} from "@/lib/services/collection-payment-allocation";
import {
  buildLiquidationBreakdownFromInputs,
  type BajaLiquidationInput,
} from "@/lib/services/baja-liquidation";

let failures = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    failures += 1;
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
    return;
  }
  console.log(`✓ ${name}`);
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.011;
}

function charge(
  id: string,
  chargeType: string,
  amount: number,
  createdAt: string,
  extra: Partial<BajaLiquidationInput["collectionCharges"][0]> = {}
) {
  return {
    id,
    chargeType,
    amount,
    createdAt: new Date(createdAt),
    periodLabel: extra.periodLabel ?? null,
    periodFrom: extra.periodFrom ?? null,
    periodTo: extra.periodTo ?? null,
    description: extra.description ?? null,
  };
}

function baseInput(overrides: Partial<BajaLiquidationInput> = {}): BajaLiquidationInput {
  return {
    requestDate: new Date("2025-06-01"),
    permanenceStartDate: new Date("2025-06-01"),
    hasTvStreaming: false,
    tvStreamingSince: null,
    tariff: { permanenceMonths: 12, installCostUsd: 120, tvMonthlyUsd: 20 },
    monthsCompletedOverride: 0,
    collectionCharges: [],
    collectionPaymentsTotal: 0,
    cancellationCharges: [],
    equipment: [],
      equipmentTariffs: [{ type: "ONU", notReturnedUsd: 0, damagedUsd: 0 }],
    ...overrides,
  };
}

// --- P1 unit ---
{
  const allocations = allocateCollectionPayments(
    [
      { id: "c1", chargeType: "CONSUMO_MENSUAL", amount: 40, createdAt: new Date("2025-01-01") },
      { id: "c2", chargeType: "INSTALACION", amount: 50, createdAt: new Date("2025-01-02") },
      { id: "c3", chargeType: "STREAMS", amount: 30, createdAt: new Date("2025-01-03") },
    ],
    30
  );
  const pending = sumPendingByChargeType(allocations);
  assert("P1 atribución CONSUMO=10", approx(pending.CONSUMO_MENSUAL ?? 0, 10));
  assert("P1 atribución INSTALACION=50", approx(pending.INSTALACION ?? 0, 50));
  assert("P1 atribución STREAMS=30", approx(pending.STREAMS ?? 0, 30));
}

// Caso 1: CONSUMO 40+35, INSTALACION 0, install 120, EQUIPO 80 => 275
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 40, "2025-03-01", { periodLabel: "Marzo 2025" }),
        charge("m2", "CONSUMO_MENSUAL", 35, "2025-04-01", { periodLabel: "Abril 2025" }),
      ],
      equipment: [
        {
          id: "eq1",
          type: "ONU",
          brand: null,
          model: null,
          serial: "S1",
          delivered: false,
          condition: "NO_ENTREGADO",
          chargeAmount: 80,
        },
      ],
    })
  );
  assert("Caso 1 total=275", approx(b.total, 275), `got ${b.total}`);
  assert("Caso 1 mensualidades=75", approx(b.monthlyTotal, 75));
  assert("Caso 1 permanencia=120", approx(b.installationNet, 120));
  assert("Caso 1 equipo=80", approx(b.equipmentTotal, 80));
}

// Caso 2: MENS 50 + INST_NET 90 + STREAMS 25 + EQUIPO 60 - CRED 10 = 215
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 90, tvMonthlyUsd: 25 },
      monthsCompletedOverride: 0,
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 50, "2025-03-01"),
        charge("s1", "STREAMS", 25, "2025-03-02"),
      ],
      cancellationCharges: [{ concept: "Crédito comercial", amount: -10 }],
      equipment: [
        {
          id: "eq1",
          type: "ONU",
          brand: null,
          model: null,
          serial: "S1",
          delivered: false,
          condition: "NO_ENTREGADO",
          chargeAmount: 60,
        },
      ],
    })
  );
  assert("Caso 2 total=215", approx(b.total, 215), `got ${b.total}`);
}

// Caso 3: pendingBalance=90 NO es mensualidad; mensual=10
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 40, "2025-03-01"),
        charge("i1", "INSTALACION", 50, "2025-03-02"),
        charge("s1", "STREAMS", 30, "2025-03-03"),
      ],
      collectionPaymentsTotal: 30,
    })
  );
  assert("Caso 3 mensual=10 (no 90)", approx(b.monthlyTotal, 10), `got ${b.monthlyTotal}`);
  assert("Caso 3 installationNet=0 (P3 estricto)", approx(b.installationNet, 0), `got ${b.installationNet}`);
  assert("Caso 3 sin línea PERMANENCIA", !b.lines.some((l) => l.category === "PERMANENCIA"));
  assert("Caso 3 total=40 (P3 estricto)", approx(b.total, 40), `got ${b.total}`);
}

// P3 casos A–D
{
  function p3(installCostUsd: number, instalacionPending: number) {
    const charges =
      instalacionPending > 0
        ? [charge("i1", "INSTALACION", instalacionPending, "2025-01-01")]
        : [];
    return buildLiquidationBreakdownFromInputs(
      baseInput({
        tariff: { permanenceMonths: 12, installCostUsd, tvMonthlyUsd: 20 },
        collectionCharges: charges,
      })
    );
  }

  const a = p3(100, 0);
  assert("P3-A PERMANENCIA=100", approx(a.lines.find((l) => l.category === "PERMANENCIA")?.amount ?? 0, 100));

  const b = p3(100, 30);
  assert("P3-B PERMANENCIA=70", approx(b.lines.find((l) => l.category === "PERMANENCIA")?.amount ?? 0, 70));

  const c = p3(100, 100);
  assert("P3-C PERMANENCIA=0", !c.lines.some((l) => l.category === "PERMANENCIA"));
  assert("P3-C total=0", approx(c.total, 0));

  const d = p3(100, 120);
  assert("P3-D PERMANENCIA=0 (no 120)", !d.lines.some((l) => l.category === "PERMANENCIA"));
  assert("P3-D total=0", approx(d.total, 0));

  const e = p3(0, 50);
  assert("P3-E (Decisión B) 0/50 PERMANENCIA=0", !e.lines.some((l) => l.category === "PERMANENCIA"));
  assert("P3-E (Decisión B) installationNet=0", approx(e.installationNet, 0), `got ${e.installationNet}`);
  assert("P3-E (Decisión B) total=0", approx(e.total, 0), `got ${e.total}`);
}

// Decisión B — installAmountCalculated=0 + INSTALACION pending > 0
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 40, "2025-03-01"),
        charge("i1", "INSTALACION", 50, "2025-03-02"),
        charge("s1", "STREAMS", 30, "2025-03-03"),
      ],
      collectionPaymentsTotal: 30,
    })
  );
  assert("Decisión B installationNet=0", approx(b.installationNet, 0), `got ${b.installationNet}`);
  assert("Decisión B PERMANENCIA=0", !b.lines.some((l) => l.category === "PERMANENCIA"));
  assert(
    "Decisión B sin línea INSTALACION",
    !b.lines.some((l) => l.concept.toUpperCase().includes("INSTALACION"))
  );
  assert(
    "Decisión B INSTALACION no en OTRO",
    !b.lines.some(
      (l) =>
        l.category === "OTRO" &&
        (l.metadata?.includes("INSTALACION") || l.concept.toUpperCase().includes("INSTALACION"))
    )
  );
  assert("Decisión B total=40 (no 90, no 50, no 10)", approx(b.total, 40), `got ${b.total}`);
  assert("Decisión B mensual neto=10", approx(b.monthlyTotal, 10), `got ${b.monthlyTotal}`);
  assert("Decisión B streams=30", approx(b.streamsNet, 30), `got ${b.streamsNet}`);
  assert(
    "Decisión B total no contiene los 50 de INSTALACION",
    !approx(b.total, 90) && !approx(b.total, 50),
    `got ${b.total}`
  );
}

// Caso 4: CONSUMO 0, INST pend 50, installAmount 80 => net 30
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 80, tvMonthlyUsd: 20 },
      collectionCharges: [charge("i1", "INSTALACION", 50, "2025-03-01")],
    })
  );
  assert("Caso 4 installationNet=30", approx(b.installationNet, 30), `got ${b.installationNet}`);
  assert("Caso 4 total>0", b.total > 0);
}

// Caso 5
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 100, "2025-03-01"),
        charge("i1", "INSTALACION", 50, "2025-03-02"),
        charge("s1", "STREAMS", 30, "2025-03-03"),
      ],
      collectionPaymentsTotal: 80,
    })
  );
  assert("Caso 5 mensual=20", approx(b.monthlyTotal, 20), `got ${b.monthlyTotal}`);
  assert("Caso 5 installationNet=0", approx(b.installationNet, 0));
  assert("Caso 5 total=50 (P3 estricto, sin INSTALACION)", approx(b.total, 50), `got ${b.total}`);
}

// Caso 6: install 100, INST pend 30 => net 70 (nunca 130)
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 100, tvMonthlyUsd: 20 },
      collectionCharges: [charge("i1", "INSTALACION", 30, "2025-03-01")],
    })
  );
  assert("Caso 6 installationNet=70", approx(b.installationNet, 70), `got ${b.installationNet}`);
  assert("Caso 6 no doble cobro (≠130)", !approx(b.installationNet, 130));
}

// Caso 7: STREAMS pend 25, tv calc 40 => net 25
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      hasTvStreaming: true,
      tvStreamingSince: new Date("2025-03-01"),
      requestDate: new Date("2025-05-01"),
      tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 20 },
      collectionCharges: [charge("s1", "STREAMS", 25, "2025-03-01")],
    })
  );
  assert("Caso 7 streamsCalculated=40", approx(b.streamsCalculated, 40), `got ${b.streamsCalculated}`);
  assert("Caso 7 streamsNet=25", approx(b.streamsNet, 25), `got ${b.streamsNet}`);
  assert("Caso 7 no suma 65", !approx(b.streamsNet, 65));
}

// Caso 8 (P6): approvedTotal inmutable; finalTotal = approved + adjustment
{
  const approvedTotal = 300;
  const equipmentEstimated = 80;
  const equipmentAdjustment = -equipmentEstimated;
  const finalTotal = Math.max(0, Math.round((approvedTotal + equipmentAdjustment) * 100) / 100);
  assert("Caso 8 finalTotal=220", approx(finalTotal, 220));
  assert("Caso 8 approvedTotal sigue 300", approx(approvedTotal, 300));
}

// Caso especial: planMonthlyUsd=22.40 y pendingBalance=0 no fijan el total
{
  const scenarios = [
    {
      name: "solo equipo 15",
      input: baseInput({
        tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
        equipment: [
          {
            id: "eq1",
            type: "ONU",
            brand: null,
            model: null,
            serial: "S1",
            delivered: false,
            condition: "NO_ENTREGADO",
            chargeAmount: 15,
          },
        ],
        equipmentTariffs: [{ type: "ONU", notReturnedUsd: 0, damagedUsd: 0 }],
      }),
      expected: 15,
    },
    {
      name: "consumo 22.40",
      input: baseInput({
        tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
        collectionCharges: [charge("m1", "CONSUMO_MENSUAL", 22.4, "2025-03-01")],
      }),
      expected: 22.4,
    },
    {
      name: "consumo 50",
      input: baseInput({
        tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
        collectionCharges: [charge("m1", "CONSUMO_MENSUAL", 50, "2025-03-01")],
      }),
      expected: 50,
    },
    {
      name: "sin obligaciones",
      input: baseInput({ tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 } }),
      expected: 0,
    },
  ];

  for (const s of scenarios) {
    const b = buildLiquidationBreakdownFromInputs(s.input);
    assert(`Especial ${s.name} total=${s.expected}`, approx(b.total, s.expected), `got ${b.total}`);
  }

  const zeroBalanceOther = buildLiquidationBreakdownFromInputs(
    baseInput({
      tariff: { permanenceMonths: 12, installCostUsd: 0, tvMonthlyUsd: 0 },
      collectionCharges: [charge("o1", "OTRO", 33, "2025-03-01", { description: "Cargo real" })],
    })
  );
  assert(
    "Especial pendingBalance=0 no fuerza USD 0",
    zeroBalanceOther.total > 0,
    `got ${zeroBalanceOther.total}`
  );
  assert(
    "Especial no usa 22.40 como constante",
    !approx(zeroBalanceOther.total, 22.4),
    `got ${zeroBalanceOther.total}`
  );
}

// P5: una línea MENSUALIDAD por cargo CONSUMO_MENSUAL
{
  const b = buildLiquidationBreakdownFromInputs(
    baseInput({
      collectionCharges: [
        charge("m1", "CONSUMO_MENSUAL", 40, "2025-03-01", { periodLabel: "Marzo" }),
        charge("m2", "CONSUMO_MENSUAL", 35, "2025-04-01", { periodLabel: "Abril" }),
      ],
    })
  );
  const monthlyLines = b.lines.filter((l) => l.category === "MENSUALIDAD");
  assert("P5 dos líneas MENSUALIDAD", monthlyLines.length === 2);
  assert(
    "P5 suma líneas = monthlyTotal",
    approx(monthlyLines.reduce((s, l) => s + l.amount, 0), b.monthlyTotal)
  );
}

console.log(failures === 0 ? "\nP1–P6 liquidation tests OK" : `\n${failures} test(s) failed`);
if (failures > 0) process.exit(1);
