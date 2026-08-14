import { buildPermanenceSummary, getCustomerTypeLabel, technologyLabel } from "@/lib/permanence";
import type { CustomerTechnologyInput } from "@/lib/permanence";

const CONFIG = { permanenceMonths: 18, installCostUsd: 200 };

type Scenario = {
  name: string;
  customer: CustomerTechnologyInput;
  requestDate: string;
  expectPending: boolean;
  expectCanCalculate: boolean;
  expectMonths?: number;
};

const scenarios: Scenario[] = [
  {
    name: "PRUEBA 1 — Fibra original, cumple permanencia",
    customer: {
      serviceStartDate: "2020-01-10",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: "2020-01-10",
    },
    requestDate: "2026-08-10",
    expectPending: false,
    expectCanCalculate: true,
  },
  {
    name: "PRUEBA 2 — Fibra original, NO cumple permanencia",
    customer: {
      serviceStartDate: "2025-06-01",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: "2025-06-01",
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
  },
  {
    name: "PRUEBA 3 — Radio→Fibra migrado, NO cumple desde migración",
    customer: {
      serviceStartDate: "2024-01-10",
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2026-03-15",
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
    expectMonths: 4,
  },
  {
    name: "PRUEBA 4 — Radio→Fibra migrado, SÍ cumple desde migración",
    customer: {
      serviceStartDate: "2020-01-10",
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2024-01-10",
    },
    requestDate: "2026-08-10",
    expectPending: false,
    expectCanCalculate: true,
  },
  {
    name: "PRUEBA 5 — Radioenlace sin migración (permanencia cumplida por antigüedad)",
    customer: {
      serviceStartDate: "2024-01-10",
      originTechnology: "RADIOENLACE",
      currentTechnology: "RADIOENLACE",
    },
    requestDate: "2026-08-10",
    expectPending: false,
    expectCanCalculate: true,
    expectMonths: 31,
  },
  {
    name: "PRUEBA 5b — Radioenlace sin migración (NO cumple permanencia)",
    customer: {
      serviceStartDate: "2025-06-01",
      originTechnology: "RADIOENLACE",
      currentTechnology: "RADIOENLACE",
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
  },
  {
    name: "PRUEBA 6 — Migrado sin fecha de migración",
    customer: {
      serviceStartDate: "2024-01-10",
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      migrationReviewRequired: true,
    },
    requestDate: "2026-08-10",
    expectPending: false,
    expectCanCalculate: false,
  },
  {
    name: "PRUEBA 6b — Migrado con fecha pero flag revisión (permite calcular)",
    customer: {
      serviceStartDate: "2024-01-10",
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2026-03-15",
      migrationReviewRequired: true,
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
    expectMonths: 4,
  },
  {
    name: "PRUEBA 7 — Radio con migración registrada pero currentTechnology aún RADIO",
    customer: {
      serviceStartDate: "2022-08-03",
      originTechnology: "RADIOENLACE",
      currentTechnology: "RADIOENLACE",
      fiberMigrationDate: "2025-12-09",
      fiberInstallDate: "2025-12-09",
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
    expectMonths: 8,
  },
  {
    name: "PRUEBA 8 — Cambio de plan: permanencia desde nuevo contrato",
    customer: {
      serviceStartDate: "2020-01-10",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: "2020-01-10",
      contractPermanenceStart: "2025-06-01",
      contractPermanenceEnd: "2026-12-01",
    },
    requestDate: "2026-08-10",
    expectPending: true,
    expectCanCalculate: true,
    expectMonths: 14,
  },
  {
    name: "PRUEBA 9 — Renovación: permanencia desde fecha renovada",
    customer: {
      serviceStartDate: "2018-03-01",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: "2018-03-01",
      contractPermanenceStart: "2025-01-15",
      contractPermanenceEnd: "2026-07-15",
    },
    requestDate: "2026-08-10",
    expectPending: false,
    expectCanCalculate: true,
    expectMonths: 18,
  },
];

let passed = 0;
let failed = 0;

for (const s of scenarios) {
  const summary = buildPermanenceSummary(s.customer, new Date(s.requestDate), CONFIG);
  const okPending = summary.fiberInstallPending === s.expectPending;
  const okCalc = summary.canCalculate === s.expectCanCalculate;
  const okMonths =
    s.expectMonths === undefined || summary.monthsInFiber === s.expectMonths;
  const ok = okPending && okCalc && okMonths;

  if (ok) {
    passed++;
    console.log(`✓ ${s.name}`);
    console.log(
      `  meses=${summary.monthsInFiber} cobro=${summary.installAmount} calc=${summary.canCalculate}`
    );
  } else {
    failed++;
    console.error(`✗ ${s.name}`);
    console.error(
      `  expected pending=${s.expectPending} calc=${s.expectCanCalculate} months=${s.expectMonths ?? "any"}`
    );
    console.error(
      `  got pending=${summary.fiberInstallPending} calc=${summary.canCalculate} months=${summary.monthsInFiber} warning=${summary.warning}`
    );
  }
}

console.log(`\n${passed}/${scenarios.length} escenarios OK`);
if (failed > 0) process.exit(1);
