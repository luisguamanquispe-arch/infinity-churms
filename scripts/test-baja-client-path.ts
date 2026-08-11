import {
  inferBajaClientPath,
  needsMigrationForm,
  validateClientPath,
  type BajaClientPath,
} from "@/lib/baja-client-path";

type Case = {
  name: string;
  customer: {
    originTechnology: string;
    currentTechnology: string;
    fiberMigrationDate?: string | null;
  };
  path: BajaClientPath;
  expectPathOk: boolean;
  expectNeedsMigration?: boolean;
  expectInferred?: BajaClientPath;
};

const cases: Case[] = [
  {
    name: "Fibra original → FIBRA_ORIGINAL",
    customer: { originTechnology: "FIBRA", currentTechnology: "FIBRA", fiberMigrationDate: null },
    path: "FIBRA_ORIGINAL",
    expectPathOk: true,
    expectInferred: "FIBRA_ORIGINAL",
  },
  {
    name: "Fibra original no puede elegir MIGRATED",
    customer: { originTechnology: "FIBRA", currentTechnology: "FIBRA" },
    path: "MIGRATED",
    expectPathOk: false,
  },
  {
    name: "Fibra original no puede elegir RADIO_ONLY",
    customer: { originTechnology: "FIBRA", currentTechnology: "FIBRA" },
    path: "RADIO_ONLY",
    expectPathOk: false,
  },
  {
    name: "Migrado con fecha → MIGRATED",
    customer: {
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2026-03-15",
    },
    path: "MIGRATED",
    expectPathOk: true,
    expectNeedsMigration: false,
    expectInferred: "MIGRATED",
  },
  {
    name: "Migrado sin fecha requiere formulario",
    customer: { originTechnology: "RADIOENLACE", currentTechnology: "FIBRA" },
    path: "MIGRATED",
    expectPathOk: true,
    expectNeedsMigration: true,
  },
  {
    name: "Migrado no puede elegir FIBRA_ORIGINAL",
    customer: {
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2026-03-15",
    },
    path: "FIBRA_ORIGINAL",
    expectPathOk: false,
  },
  {
    name: "Migrado no puede elegir RADIO_ONLY",
    customer: {
      originTechnology: "RADIOENLACE",
      currentTechnology: "FIBRA",
      fiberMigrationDate: "2026-03-15",
    },
    path: "RADIO_ONLY",
    expectPathOk: false,
  },
  {
    name: "Solo radio → RADIO_ONLY",
    customer: { originTechnology: "RADIOENLACE", currentTechnology: "RADIOENLACE" },
    path: "RADIO_ONLY",
    expectPathOk: true,
    expectInferred: "RADIO_ONLY",
  },
  {
    name: "Solo radio no puede elegir FIBRA_ORIGINAL",
    customer: { originTechnology: "RADIOENLACE", currentTechnology: "RADIOENLACE" },
    path: "FIBRA_ORIGINAL",
    expectPathOk: false,
  },
  {
    name: "Radio sin fibra puede iniciar migración (MIGRATED)",
    customer: { originTechnology: "RADIOENLACE", currentTechnology: "RADIOENLACE" },
    path: "MIGRATED",
    expectPathOk: true,
    expectNeedsMigration: true,
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const pathResult = validateClientPath(c.path, c.customer);
  const needsMigration = needsMigrationForm(c.path, {
    ...c.customer,
    fiberMigrationDate: c.customer.fiberMigrationDate ?? null,
  });
  const inferred = inferBajaClientPath(c.customer);

  const okPath = pathResult.ok === c.expectPathOk;
  const okMigration =
    c.expectNeedsMigration === undefined || needsMigration === c.expectNeedsMigration;
  const okInferred = c.expectInferred === undefined || inferred === c.expectInferred;

  if (okPath && okMigration && okInferred) {
    passed++;
    console.log(`✓ ${c.name}`);
  } else {
    failed++;
    console.error(`✗ ${c.name}`);
    if (!okPath) {
      console.error(`  path ok: expected ${c.expectPathOk}, got ${pathResult.ok}`);
    }
    if (!okMigration) {
      console.error(`  needsMigration: expected ${c.expectNeedsMigration}, got ${needsMigration}`);
    }
    if (!okInferred) {
      console.error(`  inferred: expected ${c.expectInferred}, got ${inferred}`);
    }
  }
}

console.log(`\n${passed}/${cases.length} casos OK`);
if (failed > 0) process.exit(1);
