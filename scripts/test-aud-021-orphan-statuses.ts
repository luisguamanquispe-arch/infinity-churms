/**
 * AUD-021 — análisis estático de estados huérfanos vs flujo activo.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  FLOW_CANCELLATION_STATUSES,
  ORPHAN_CANCELLATION_STATUSES,
} from "../src/lib/cancellation-flow-statuses";

const root = join(import.meta.dirname, "..");

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const enumBlock = schema.match(/enum CancellationStatus \{([\s\S]*?)\}/)?.[1] ?? "";
const enumStatuses = enumBlock
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

assert("enum CancellationStatus definido", enumStatuses.length >= 10);

const flowSet = new Set(FLOW_CANCELLATION_STATUSES);
const orphanSet = new Set(ORPHAN_CANCELLATION_STATUSES);

for (const s of FLOW_CANCELLATION_STATUSES) {
  assert(`FLOW ${s} en enum Prisma`, enumStatuses.includes(s));
}
for (const s of ORPHAN_CANCELLATION_STATUSES) {
  assert(`ORPHAN ${s} en enum Prisma`, enumStatuses.includes(s));
}

assert("FLOW y ORPHAN no se solapan", !FLOW_CANCELLATION_STATUSES.some((s) => orphanSet.has(s)));

const uncovered = enumStatuses.filter((s) => !flowSet.has(s as (typeof FLOW_CANCELLATION_STATUSES)[number]) && !orphanSet.has(s as (typeof ORPHAN_CANCELLATION_STATUSES)[number]));
assert(`todos los enum clasificados (${uncovered.join(", ") || "ninguno"})`, uncovered.length === 0);

const cancellationsTs = readFileSync(join(root, "src/lib/services/cancellations.ts"), "utf8");
assert("createCancellation usa SOLICITADA", cancellationsTs.includes('status: "SOLICITADA"'));

console.log(
  JSON.stringify({
    flowCount: FLOW_CANCELLATION_STATUSES.length,
    orphanCount: ORPHAN_CANCELLATION_STATUSES.length,
    enumCount: enumStatuses.length,
    migrationStrategy:
      "Fase 1: mantener enum; Fase 2: mapear ORPHAN→FLOW en reportes; Fase 3: migración SQL solo tras auditoría de filas huérfanas",
  })
);

console.log("\nAUD-021 orphan status analysis OK");
