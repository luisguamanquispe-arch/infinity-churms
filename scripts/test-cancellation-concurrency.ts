/**
 * AUD-005: solo una baja activa por cliente ante solicitudes concurrentes.
 * Requiere DATABASE_URL. Se omite si no hay conexión.
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import {
  CancellationConflictError,
  createCancellationRecord,
  TERMINAL_CANCELLATION_STATUSES,
} from "@/lib/services/cancellations";

const prisma = new PrismaClient();

const MINIMAL_PDF = "data:application/pdf;base64,TEST";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada — prueba de concurrencia omitida");
    process.exit(0);
  }
  try {
    assertTestDatabaseAllowed();
  } catch (e) {
    console.log(`BLOCKED: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  try {
    await prisma.$queryRaw`SELECT "permanenceMonthsSnapshot" FROM "Cancellation" LIMIT 0`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/authentication failed|password authentication failed/i.test(msg)) {
      console.log("BLOCKED — PostgreSQL authentication failed");
      process.exit(1);
    }
    console.log(
      "SKIP: columnas AUD-003/005 no aplicadas aún en BD local — ejecute db:migrate en entorno de prueba"
    );
    process.exit(0);
  }

  const user = await prisma.user.findFirst({ where: { active: true } });
  if (!user) {
    console.error("FAIL: no hay usuario activo en BD para la prueba");
    process.exit(1);
  }

  const contract = `AUD005-${Date.now()}`;
  const customer = await prisma.customer.create({
    data: {
      contract,
      name: "Cliente prueba AUD-005",
      cedula: `099${Date.now().toString().slice(-7)}`,
      address: "Test",
      serviceStartDate: new Date("2024-01-01"),
      planName: "Plan Test",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: new Date("2024-01-01"),
    },
  });

  const input = {
    customerId: customer.id,
    reason: "DECISION_VOLUNTARIA" as const,
    notes: "AUD-005 concurrency test",
    requestDate: new Date(),
    createdById: user.id,
    withdrawalRequestFileName: "solicitud-test.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  };

  const results = await Promise.allSettled([
    createCancellationRecord(input),
    createCancellationRecord(input),
  ]);

  const successes = results.filter((r) => r.status === "fulfilled");
  const conflicts = results.filter(
    (r) => r.status === "rejected" && r.reason instanceof CancellationConflictError
  );

  let passed = 0;
  let failed = 0;

  function assert(name: string, ok: boolean, detail?: string) {
    if (ok) {
      passed++;
      console.log(`✓ ${name}`);
    } else {
      failed++;
      console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
    }
  }

  assert("exactamente una creación exitosa", successes.length === 1, `got ${successes.length}`);
  assert("exactamente un conflicto 409-equivalente", conflicts.length === 1, `got ${conflicts.length}`);

  const activeCount = await prisma.cancellation.count({
    where: {
      customerId: customer.id,
      status: { notIn: TERMINAL_CANCELLATION_STATUSES },
    },
  });
  assert("solo una baja activa en BD", activeCount === 1, `count=${activeCount}`);

  // Limpieza
  await prisma.cancellation.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });

  console.log(`\n${passed} pruebas OK, ${failed} fallidas`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
