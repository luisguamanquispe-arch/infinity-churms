/**
 * FASE 5B — reproduce contrato 2799 en BD test (idempotente).
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import { createCancellationRecord, recalculateCancellation } from "../src/lib/services/cancellations";
import { computeBajaLiquidation } from "../src/lib/services/baja-liquidation";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";

const prisma = new PrismaClient();

async function main() {
  assertTestDatabaseAllowed();

  const admin = await prisma.user.findFirst({ where: { email: "admin@infinity.net" } });
  if (!admin) throw new Error("admin seed requerido");

  let customer = await prisma.customer.findFirst({ where: { contract: "2799" } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        contract: "2799",
        name: "MONTACHANA PILATASIG EDWIN SANTIAGO",
        cedula: "1850196971",
        address: "Test FASE 5B",
        zone: "CENTRO",
        planName: "PLAN SIN LIMITES",
        planMonthlyUsd: 20,
        serviceStartDate: parseBusinessDateOnly("2021-10-15"),
        originTechnology: "FIBRA",
        currentTechnology: "FIBRA",
        fiberInstallDate: parseBusinessDateOnly("2021-10-15"),
        pendingBalance: 0,
        status: "ACTIVO",
      },
    });
    console.log("CREATED customer", customer.id);
  } else {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: "MONTACHANA PILATASIG EDWIN SANTIAGO",
        cedula: "1850196971",
        planName: "PLAN SIN LIMITES",
        planMonthlyUsd: 20,
        pendingBalance: 0,
      },
    });
    console.log("UPDATED customer", customer.id);
  }

  let cancellation = await prisma.cancellation.findFirst({
    where: { customerId: customer.id, status: { not: "BAJA_COMPLETADA" } },
    orderBy: { createdAt: "desc" },
  });

  if (!cancellation) {
    cancellation = await createCancellationRecord({
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      notes: "FASE 5B contrato 2799",
      requestDate: parseBusinessDateOnly("2026-09-20"),
      createdById: admin.id,
      withdrawalRequestFileName: "solicitud.pdf",
      withdrawalRequestFileData: "data:application/pdf;base64,TEST",
    });
    console.log("CREATED cancellation", cancellation.id);
  } else {
    await prisma.cancellation.update({
      where: { id: cancellation.id },
      data: { requestDate: parseBusinessDateOnly("2026-09-20") },
    });
    console.log("UPDATED cancellation requestDate day=20", cancellation.id);
  }

  await recalculateCancellation(cancellation.id);

  const breakdown = await computeBajaLiquidation(cancellation.id);
  console.log("\n=== MOTOR breakdown ===");
  console.log(JSON.stringify({ total: breakdown.total, monthlyTotal: breakdown.monthlyTotal, lines: breakdown.lines }, null, 2));

  const existingPreliq = await prisma.cancellationPreliquidacion.findFirst({
    where: { cancellationId: cancellation.id, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
  });

  if (!existingPreliq) {
    const preliq = await generatePreliquidacion(cancellation.id, admin.id);
    console.log("\n=== PRELIQUIDACION ===");
    console.log(`total=${preliq.totalAmount} lines=${preliq.lineItems.length}`);
    for (const l of preliq.lineItems) {
      console.log(`  [${l.category}] ${l.concept} = ${l.amount}`);
    }
  } else {
    console.log("\n=== EXISTING PRELIQUIDACION ===");
    console.log(`total=${existingPreliq.totalAmount}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
