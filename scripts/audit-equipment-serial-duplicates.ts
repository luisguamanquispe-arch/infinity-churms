/**
 * AUD-027 — Auditoría de seriales duplicados en CustomerEquipment.
 * Requiere DATABASE_URL (carga .env automáticamente).
 * No modifica datos.
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed, formatDatabaseTargetSafe } from "../src/lib/test-database-guard";

const prisma = new PrismaClient();

type Row = {
  id: string;
  customerId: string;
  serial: string | null;
  contract: string;
};

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log(JSON.stringify({ error: "NO_DATABASE_URL", skip: true }));
    process.exit(0);
  }

  try {
    assertTestDatabaseAllowed(url);
  } catch (e) {
    console.log(JSON.stringify({ error: "BLOCKED_TARGET", detail: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(JSON.stringify({ error: "CONNECTION_FAILED", target: formatDatabaseTargetSafe(url), detail: msg }));
    process.exit(0);
  }

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT ce.id, ce."customerId", ce.serial, c.contract
    FROM "CustomerEquipment" ce
    JOIN "Customer" c ON c.id = ce."customerId"
    ORDER BY ce.serial NULLS LAST, c.contract
  `;

  const nullCount = rows.filter((r) => r.serial == null).length;
  const emptyCount = rows.filter((r) => r.serial != null && r.serial.trim() === "").length;
  const whitespaceOnly = rows.filter((r) => r.serial != null && r.serial.trim() === "" && r.serial.length > 0).length;

  const byNormalized = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.serial == null || row.serial.trim() === "") continue;
    const key = row.serial.trim().toUpperCase();
    const list = byNormalized.get(key) ?? [];
    list.push(row);
    byNormalized.set(key, list);
  }

  const duplicates = [...byNormalized.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([normalizedSerial, list]) => ({
      normalizedSerial,
      count: list.length,
      items: list.map((r) => ({
        equipmentId: r.id,
        customerId: r.customerId,
        contract: r.contract,
        serial: r.serial,
      })),
    }));

  const caseVariants = duplicates.filter((d) => {
    const raw = new Set(d.items.map((i) => i.serial));
    return raw.size > 1;
  });

  console.log(
    JSON.stringify(
      {
        totalEquipment: rows.length,
        nullSerial: nullCount,
        emptySerial: emptyCount,
        whitespaceOnlySerial: whitespaceOnly,
        duplicateGroups: duplicates.length,
        caseVariantGroups: caseVariants.length,
        duplicates,
        migrationReady: duplicates.length === 0,
        nextStep:
          duplicates.length === 0
            ? "Ejecutar prisma/pending-migrations/AUD-027-equipment-serial-unique.sql en ventana controlada"
            : "Resolver duplicados manualmente antes de aplicar índice UNIQUE",
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
