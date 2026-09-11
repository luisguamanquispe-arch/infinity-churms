/**
 * FASE 5B — contrato 2799: motor = preliquidación (BD test).
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { computeBajaLiquidation } from "../src/lib/services/baja-liquidation";

const prisma = new PrismaClient();

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.011;
}

async function main() {
  assertTestDatabaseAllowed();

  const customer = await prisma.customer.findFirst({ where: { contract: "2799" } });
  if (!customer) {
    console.error("FAIL — contrato 2799 no existe en BD test. Ejecute scripts/_fase5b-seed-2799.ts");
    process.exit(1);
  }

  const cancellation = await prisma.cancellation.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  if (!cancellation) {
    console.error("FAIL — sin baja para contrato 2799");
    process.exit(1);
  }

  const breakdown = await computeBajaLiquidation(cancellation.id);
  const preliq = await prisma.cancellationPreliquidacion.findFirst({
    where: { cancellationId: cancellation.id },
    orderBy: { version: "desc" },
    include: { lineItems: true },
  });

  const requestDay = cancellation.requestDate.getUTCDate();
  const nextMonthLine = breakdown.lines.find((l) => l.metadata?.includes("NEXT_MONTH_RULE"));
  console.log(
    [
      `contrato=2799`,
      `requestDate=${cancellation.requestDate.toISOString()}`,
      `requestDay(UTC)=${requestDay}`,
      `planMonthlyUsd=${customer.planMonthlyUsd}`,
      `NEXT_MONTH_RULE=${nextMonthLine ? nextMonthLine.amount : "none"}`,
      `subtotal=${breakdown.subtotal}`,
      `credits=${breakdown.creditsAmount}`,
      `total=${breakdown.total}`,
      preliq ? `snapshot.total=${preliq.totalAmount}` : "snapshot=none",
    ].join(" ")
  );

  if (requestDay >= 16) {
    if (!approx(breakdown.total, 20)) {
      console.error(`FAIL — esperado total=20, got ${breakdown.total}`);
      process.exit(1);
    }
    if (!approx(breakdown.monthlyTotal, 20)) {
      console.error(`FAIL — esperado monthly=20, got ${breakdown.monthlyTotal}`);
      process.exit(1);
    }
    console.log("✓ contrato 2799 día>=16 total=20");
  } else {
    if (breakdown.total !== 0) {
      console.error(`FAIL — día<=15 esperado total=0, got ${breakdown.total}`);
      process.exit(1);
    }
    console.log("✓ contrato 2799 día<=15 total=0");
  }

  if (preliq && !approx(Number(preliq.totalAmount), breakdown.total)) {
    console.error(
      `FAIL — preliquidación ${preliq.totalAmount} != motor ${breakdown.total}`
    );
    process.exit(1);
  }
  if (preliq) console.log("✓ motor = preliquidación snapshot");

  console.log("\nContrato 2799 preliquidación: PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
