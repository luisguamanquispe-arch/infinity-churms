/**
 * E2E integral — liquidación P1–P6, snapshot, paridad API, inmutabilidad.
 * Requiere BD local *test* (assertTestDatabaseAllowed).
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import { createCancellationRecord, recalculateCancellation } from "../src/lib/services/cancellations";
import { createCollectionCharge } from "../src/lib/services/collection-charges";
import { registerCollectionPayment } from "../src/lib/services/collection-payments";
import { computeBajaLiquidation } from "../src/lib/services/baja-liquidation";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
  resolvePreliquidacionToken,
} from "../src/lib/services/preliquidacion-remote-approval";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,E2E";

function assert(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}

function approx(a: number, b: number) {
  return Math.abs(a - b) < 0.011;
}

function publicPayloadFromRecord(
  record: NonNullable<Awaited<ReturnType<typeof resolvePreliquidacionToken>>["record"]>
) {
  const { preliquidacion } = record;
  const { cancellation } = preliquidacion;
  return {
    totalAmount: Number(preliquidacion.totalAmount),
    creditsAmount: Number(preliquidacion.creditsAmount),
    subtotal: Number(preliquidacion.subtotal),
    lineItems: preliquidacion.lineItems.map((l) => ({
      category: l.category,
      concept: l.concept,
      amount: Number(l.amount),
    })),
    customerName: cancellation.customer.name,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada");
    return;
  }
  assertTestDatabaseAllowed();

  const admin = await prisma.user.findFirst({
    where: { email: "admin@infinity.net", active: true },
  });
  if (!admin) throw new Error("Usuario admin seed requerido");

  const suffix = Date.now();
  let customerId = "";
  let cancellationId = "";

  try {
    const customer = await prisma.customer.create({
      data: {
        contract: `E2E-LIQ-${suffix}`,
        name: "Cliente E2E Liquidación",
        cedula: `V-LIQ-${suffix}`,
        address: "Test",
        zone: "CENTRO",
        planName: "200 MBPS",
        planMonthlyUsd: 22.4,
        serviceStartDate: parseBusinessDateOnly("2024-06-01"),
        originTechnology: "FIBRA",
        currentTechnology: "FIBRA",
        fiberInstallDate: parseBusinessDateOnly("2024-06-01"),
        pendingBalance: 0,
        hasTvStreaming: true,
        tvStreamingSince: parseBusinessDateOnly("2025-03-01"),
        status: "ACTIVO",
        equipment: {
          create: {
            type: "ONU",
            serial: `SN-LIQ-${suffix}`,
            brand: "Test",
            model: "ONU-1",
          },
        },
      },
    });
    customerId = customer.id;

    await createCollectionCharge(customerId, admin.id, {
      chargeType: "CONSUMO_MENSUAL",
      amount: 40,
      periodFrom: "2025-03",
      periodTo: "2025-03",
    });
    await createCollectionCharge(customerId, admin.id, {
      chargeType: "CONSUMO_MENSUAL",
      amount: 35,
      periodFrom: "2025-04",
      periodTo: "2025-04",
    });
    await createCollectionCharge(customerId, admin.id, {
      chargeType: "STREAMS",
      amount: 25,
      description: "Streams Mar-Abr",
    });
    await createCollectionCharge(customerId, admin.id, {
      chargeType: "OTRO",
      amount: 15,
      description: "Cargo administrativo",
    });

    await registerCollectionPayment(customerId, admin.id, {
      paymentDate: "2025-05-15",
      amount: 30,
      fenixDocument: `FENIX-E2E-${suffix}`,
      paymentMethod: "TRANSFERENCIA",
    });

    const cancellation = await createCancellationRecord({
      customerId,
      reason: "DECISION_VOLUNTARIA",
      notes: "E2E liquidación integral",
      requestDate: parseBusinessDateOnly("2026-08-01"),
      createdById: admin.id,
      withdrawalRequestFileName: "solicitud.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
    });
    cancellationId = cancellation.id;

    await prisma.cancellationCharge.create({
      data: {
        cancellationId,
        concept: "Crédito comercial E2E",
        amount: -10,
      },
    });

    await recalculateCancellation(cancellationId);

    const breakdown = await computeBajaLiquidation(cancellationId);
    const preliq = await generatePreliquidacion(cancellationId, admin.id);

    const expectedFromBreakdown = breakdown.total;
    const snapshotTotal = Number(preliq.totalAmount);

    assert(
      "E2E computeBajaLiquidation = snapshot total",
      approx(expectedFromBreakdown, snapshotTotal),
      `breakdown=${expectedFromBreakdown} snapshot=${snapshotTotal}`
    );

    assert(
      "E2E total NO es planMonthlyUsd fijo",
      !approx(snapshotTotal, 22.4) || breakdown.monthlyTotal === 22.4,
      `total=${snapshotTotal} planMonthlyUsd=22.4`
    );

    assert(
      "E2E pendingBalance=0 no fuerza total=0",
      snapshotTotal > 0,
      `total=${snapshotTotal}`
    );

    const breakdownLines = breakdown.lines.map((l) => ({
      category: l.category,
      concept: l.concept,
      amount: l.amount,
    }));
    const snapshotLines = preliq.lineItems.map((l) => ({
      category: l.category,
      concept: l.concept,
      amount: Number(l.amount),
    }));

    assert(
      "E2E paridad líneas count",
      breakdownLines.length === snapshotLines.length,
      `${breakdownLines.length} vs ${snapshotLines.length}`
    );

    for (let i = 0; i < snapshotLines.length; i++) {
      const a = breakdownLines[i];
      const b = snapshotLines[i];
      assert(
        `E2E línea ${i + 1} paridad`,
        a.category === b.category &&
          a.concept === b.concept &&
          approx(a.amount, b.amount),
        `[${a.category}] ${a.amount} vs [${b.category}] ${b.amount}`
      );
    }

    console.log("\n--- Desglose E2E (obligaciones reales) ---");
    console.log(`  Mensualidades netas: ${breakdown.monthlyTotal}`);
    console.log(`  Instalación neta:    ${breakdown.installationNet}`);
    console.log(`  Streams netos:       ${breakdown.streamsNet}`);
    console.log(`  Equipos:             ${breakdown.equipmentTotal}`);
    console.log(`  Otros:               ${breakdown.otherChargesTotal}`);
    console.log(`  Créditos:            ${breakdown.creditsTotal}`);
    console.log(`  TOTAL ESPERADO:      ${expectedFromBreakdown}`);
    console.log(`  TOTAL SNAPSHOT:      ${snapshotTotal}`);

    const { token } = await generatePreliquidacionLink(preliq.id, admin.id, "http://localhost:3000");

    const resolvedPending = await resolvePreliquidacionToken(token);
    assert(
      "E2E API/móvil token activo",
      Boolean(resolvedPending.record) && !("error" in resolvedPending && resolvedPending.error),
      "error" in resolvedPending ? resolvedPending.error : "no record"
    );
    if (resolvedPending.record) {
      const apiPending = publicPayloadFromRecord(resolvedPending.record);
      assert(
        "E2E API total = snapshot (pre-aprobación)",
        approx(apiPending.totalAmount, snapshotTotal),
        `api=${apiPending.totalAmount}`
      );
      assert(
        "E2E API paridad línea por línea (pre-aprobación)",
        JSON.stringify(apiPending.lineItems) === JSON.stringify(snapshotLines)
      );
    }

    await approvePreliquidacionViaToken(token, "127.0.0.1", "e2e-integral");

    const approved = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: preliq.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    const approvedTotal = Number(approved!.approvedTotal);
    assert(
      "E2E approvedTotal congelado",
      approx(approvedTotal, snapshotTotal),
      `approved=${approvedTotal}`
    );

    const snapshotBefore = JSON.stringify({
      total: approved!.totalAmount.toString(),
      subtotal: approved!.subtotal.toString(),
      credits: approved!.creditsAmount.toString(),
      lines: approved!.lineItems.map((l) => ({
        c: l.category,
        concept: l.concept,
        a: l.amount.toString(),
      })),
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { pendingBalance: 999, planMonthlyUsd: 99.99 },
    });
    await createCollectionCharge(customerId, admin.id, {
      chargeType: "CONSUMO_MENSUAL",
      amount: 500,
      periodFrom: "2025-12",
      periodTo: "2025-12",
    });
    await recalculateCancellation(cancellationId);

    const afterMutation = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: preliq.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    const snapshotAfter = JSON.stringify({
      total: afterMutation!.totalAmount.toString(),
      subtotal: afterMutation!.subtotal.toString(),
      credits: afterMutation!.creditsAmount.toString(),
      lines: afterMutation!.lineItems.map((l) => ({
        c: l.category,
        concept: l.concept,
        a: l.amount.toString(),
      })),
    });

    assert("E2E inmutabilidad snapshot aprobado", snapshotBefore === snapshotAfter);

    console.log("\nE2E liquidación integral: PASS");
  } finally {
    if (cancellationId) {
      await prisma.auditLog.deleteMany({ where: { entityId: cancellationId } }).catch(() => undefined);
      await prisma.preliquidacionApprovalToken.deleteMany({
        where: { preliquidacion: { cancellationId } },
      }).catch(() => undefined);
      await prisma.preliquidacionLineItem.deleteMany({
        where: { preliquidacion: { cancellationId } },
      }).catch(() => undefined);
      await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId } }).catch(() => undefined);
      await prisma.cancellationPayment.deleteMany({ where: { cancellationId } }).catch(() => undefined);
      await prisma.cancellationEquipment.deleteMany({ where: { cancellationId } }).catch(() => undefined);
      await prisma.cancellationCharge.deleteMany({ where: { cancellationId } }).catch(() => undefined);
      await prisma.cancellation.delete({ where: { id: cancellationId } }).catch(() => undefined);
    }
    if (customerId) {
      await prisma.collectionPayment.deleteMany({ where: { customerId } }).catch(() => undefined);
      await prisma.collectionCharge.deleteMany({ where: { customerId } }).catch(() => undefined);
      await prisma.customerEquipment.deleteMany({ where: { customerId } }).catch(() => undefined);
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error("\nE2E liquidación integral: FAIL —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
