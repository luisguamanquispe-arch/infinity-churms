/**
 * FASE 5B — diagnóstico contrato 2799 (solo lectura + motor).
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { computeBajaLiquidation } from "../src/lib/services/baja-liquidation";
import { listCollectionCharges } from "../src/lib/services/collection-charges";
import { listCollectionPayments } from "../src/lib/services/collection-payments";
import {
  allocateCollectionPayments,
  sumPendingByChargeType,
} from "../src/lib/services/collection-payment-allocation";

const prisma = new PrismaClient();

async function main() {
  assertTestDatabaseAllowed();

  const customer = await prisma.customer.findFirst({
    where: { OR: [{ contract: "2799" }, { cedula: { contains: "1850196971" } }] },
    include: {
      equipment: true,
      collectionCharges: { orderBy: { createdAt: "asc" } },
      collectionPayments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!customer) {
    const similar = await prisma.customer.findMany({
      where: {
        OR: [
          { contract: { contains: "2799" } },
          { cedula: { contains: "1850196971" } },
          { name: { contains: "MONTACHANA", mode: "insensitive" } },
          { name: { contains: "PILATASIG", mode: "insensitive" } },
        ],
      },
      select: { id: true, contract: true, name: true, cedula: true },
      take: 10,
    });
    console.log("CUSTOMER_NOT_FOUND");
    console.log("SIMILAR:", JSON.stringify(similar, null, 2));
    const count = await prisma.customer.count();
    console.log("TOTAL_CUSTOMERS:", count);
    return;
  }

  const cancellations = await prisma.cancellation.findMany({
    where: { customerId: customer.id },
    include: {
      charges: true,
      preliquidaciones: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { version: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const cancellation = cancellations[0] ?? null;

  console.log("=== CUSTOMER ===");
  console.log(
    JSON.stringify(
      {
        id: customer.id,
        contract: customer.contract,
        name: customer.name,
        cedula: customer.cedula,
        planName: customer.planName,
        planMonthlyUsd: Number(customer.planMonthlyUsd),
        pendingBalance: Number(customer.pendingBalance),
        serviceStartDate: customer.serviceStartDate,
        status: customer.status,
        originTechnology: customer.originTechnology,
        currentTechnology: customer.currentTechnology,
        fiberInstallDate: customer.fiberInstallDate,
      },
      null,
      2
    )
  );

  console.log("\n=== COLLECTION CHARGES ===");
  for (const c of customer.collectionCharges) {
    console.log(
      `${c.chargeType}\t${Number(c.amount)}\tfrom=${c.periodFrom?.toISOString?.() ?? c.periodFrom}\tto=${c.periodTo?.toISOString?.() ?? c.periodTo}\tlabel=${c.periodLabel ?? ""}\tdesc=${c.description ?? ""}`
    );
  }

  console.log("\n=== COLLECTION PAYMENTS ===");
  for (const p of customer.collectionPayments) {
    console.log(`${Number(p.amount)}\t${p.paymentDate.toISOString()}\t${p.paymentMethod ?? ""}`);
  }

  console.log("\n=== EQUIPMENT ===");
  for (const e of customer.equipment) {
    console.log(`${e.type}\t${e.serial}\t${e.brand}\t${e.model}`);
  }

  if (cancellation) {
    console.log("\n=== CANCELLATION ===");
    console.log(
      JSON.stringify(
        {
          id: cancellation.id,
          status: cancellation.status,
          requestDate: cancellation.requestDate,
          createdAt: cancellation.createdAt,
          monthsCompleted: cancellation.monthsCompleted,
          monthlyAmount: Number(cancellation.monthlyAmount),
          totalAmount: Number(cancellation.totalAmount),
        },
        null,
        2
      )
    );

    console.log("\n=== CANCELLATION CHARGES ===");
    for (const ch of cancellation.charges) {
      console.log(`${ch.concept}\t${Number(ch.amount)}`);
    }

    console.log("\n=== PRELIQUIDACIONES ===");
    for (const p of cancellation.preliquidaciones) {
      console.log(`V${p.version} status=${p.status} total=${Number(p.totalAmount)} approved=${p.approvedTotal ? Number(p.approvedTotal) : null}`);
      for (const l of p.lineItems) {
        console.log(`  [${l.category}] ${l.concept} = ${Number(l.amount)}`);
      }
    }

    const charges = await listCollectionCharges(customer.id);
    const payments = await listCollectionPayments(customer.id);
    const payTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
    const allocations = allocateCollectionPayments(
      charges.map((c) => ({
        id: c.id,
        chargeType: c.chargeType,
        amount: Number(c.amount),
        createdAt: c.createdAt,
      })),
      payTotal
    );
    const pending = sumPendingByChargeType(allocations);

    console.log("\n=== P1 PENDING BY TYPE ===");
    console.log(JSON.stringify(pending, null, 2));
    console.log(`paymentsTotal=${payTotal}`);

    const requestDay = cancellation.requestDate.getDate();
    console.log(`\nrequestDate day-of-month=${requestDay}`);

    const breakdown = await computeBajaLiquidation(cancellation.id);
    console.log("\n=== computeBajaLiquidation ===");
    console.log(
      JSON.stringify(
        {
          monthlyTotal: breakdown.monthlyTotal,
          installationCalculated: breakdown.installationCalculated,
          installationPending: breakdown.installationPending,
          installationNet: breakdown.installationNet,
          streamsPending: breakdown.streamsPending,
          streamsCalculated: breakdown.streamsCalculated,
          streamsNet: breakdown.streamsNet,
          equipmentTotal: breakdown.equipmentTotal,
          otherChargesTotal: breakdown.otherChargesTotal,
          creditsTotal: breakdown.creditsTotal,
          subtotal: breakdown.subtotal,
          total: breakdown.total,
          permanenceAmount: breakdown.permanenceAmount,
        },
        null,
        2
      )
    );
    console.log("\n=== LINES ===");
    for (const l of breakdown.lines) {
      console.log(`[${l.category}] ${l.concept} = ${l.amount}`);
    }
  } else {
    console.log("\nNO_CANCELLATION_FOUND");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
