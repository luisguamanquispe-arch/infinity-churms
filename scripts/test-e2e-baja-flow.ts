/**
 * E2E integración — flujo completo de baja (solo BD de prueba).
 * Uso: npm run test:e2e-baja-flow
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { createCancellationRecord, initEquipmentChecklist, recalculateCancellation } from "../src/lib/services/cancellations";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
} from "../src/lib/services/preliquidacion-remote-approval";
import { computeFinalLiquidation } from "../src/lib/services/preliquidaciones";
import {
  completeActaRemoteSignature,
  generateActaSignatureLink,
} from "../src/lib/services/cancellation-acta-remote-signature";
import { getDashboardKpis } from "../src/lib/services/cancellations";
import { parseBusinessDateOnly } from "../src/lib/business-date";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,TEST";
const MINIMAL_SIG = "data:image/png;base64,iVBORw0KGgo=";

type Step = { stage: string; ok: boolean; detail: string };

const steps: Step[] = [];

function step(stage: string, ok: boolean, detail: string) {
  steps.push({ stage, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${stage}: ${detail}`);
  if (!ok) throw new Error(`Fallo en ${stage}: ${detail}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada");
    process.exit(0);
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
    // LOGIN (servicio — sesión simulada por adminId)
    step("LOGIN", true, `admin@infinity.net (${admin.role})`);

    // DASHBOARD
    const kpisBefore = await getDashboardKpis();
    step("DASHBOARD", typeof kpisBefore.pendingRequests === "number", `KPIs OK (${kpisBefore.pendingRequests} pendientes)`);

    // CLIENTE
    const customer = await prisma.customer.create({
      data: {
        contract: `E2E-${suffix}`,
        name: "Cliente E2E Baja",
        cedula: `V-E2E-${suffix}`,
        address: "Test",
        zone: "CENTRO",
        planName: "200 MBPS",
        serviceStartDate: parseBusinessDateOnly("2024-06-01"),
        originTechnology: "FIBRA",
        currentTechnology: "FIBRA",
        fiberInstallDate: parseBusinessDateOnly("2024-06-01"),
        pendingBalance: 30,
        status: "ACTIVO",
        equipment: {
          create: {
            type: "ONU",
            serial: `SN-E2E-${suffix}`,
            brand: "Test",
            model: "ONU-1",
          },
        },
      },
      include: { equipment: true },
    });
    customerId = customer.id;
    step("CLIENTE", Boolean(customer.id), `creado ${customer.contract}`);

    // SOLICITUD DE BAJA
    const cancellation = await createCancellationRecord({
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      notes: "E2E test",
      requestDate: parseBusinessDateOnly("2026-08-01"),
      createdById: admin.id,
      withdrawalRequestFileName: "solicitud.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
    });
    cancellationId = cancellation.id;
    step("SOLICITUD DE BAJA", cancellation.status === "SOLICITADA", `status=${cancellation.status}`);

    // VALIDACIÓN / RECÁLCULO
    await recalculateCancellation(cancellation.id);
    const afterCalc = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
    step(
      "VALIDACIÓN",
      afterCalc != null && Number(afterCalc.totalAmount) >= 0,
      `total=${afterCalc?.totalAmount}`
    );

    // PRELIQUIDACIÓN
    const preliq = await generatePreliquidacion(cancellation.id, admin.id);
    step(
      "PRELIQUIDACIÓN",
      preliq.lineItems.length > 0,
      `V${preliq.version} items=${preliq.lineItems.length} total=${preliq.totalAmount}`
    );

    const auditPreliq = await prisma.auditLog.count({
      where: { entity: "CancellationPreliquidacion", entityId: preliq.id },
    });
    step("AUDITORÍA PRELIQ", auditPreliq >= 0, `registros=${auditPreliq}`);

    // APROBACIÓN
    const { token: preliqToken } = await generatePreliquidacionLink(
      preliq.id,
      admin.id,
      "http://localhost:3000"
    );
    await approvePreliquidacionViaToken(preliqToken, "127.0.0.1", "e2e-test");
    const afterApprove = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
    step("APROBACIÓN", afterApprove?.status === "BAJA_AUTORIZADA", `status=${afterApprove?.status}`);

    const auditApprove = await prisma.auditLog.count({
      where: { action: "PRELIQUIDACION_APPROVED", entityId: preliq.id },
    });
    step("AUDITORÍA APROBACIÓN", auditApprove >= 1, `registros=${auditApprove}`);

    // PAGO
    await prisma.$transaction(async (tx) => {
      await tx.cancellation.update({
        where: { id: cancellation.id },
        data: { status: "PAGADA", invoiceNumber: `FAC-E2E-${suffix}` },
      });
      await tx.cancellationPayment.create({
        data: {
          cancellationId: cancellation.id,
          paymentDate: new Date(),
          method: "TRANSFERENCIA",
          invoiceNumber: `FAC-E2E-${suffix}`,
          amountPaid: Number(preliq.totalAmount),
          notes: "E2E",
        },
      });
    });
    const afterPay = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
    step("PAGO", afterPay?.status === "PAGADA", `status=${afterPay?.status} invoice=${afterPay?.invoiceNumber}`);

    // EQUIPOS + LIQUIDACIÓN FINAL
    await initEquipmentChecklist(cancellation.id, customer.id);
    await prisma.cancellationEquipment.updateMany({
      where: { cancellationId: cancellation.id },
      data: { delivered: true, condition: "BUENO" },
    });
    const finalLiq = await computeFinalLiquidation(cancellation.id);
    const afterLiq = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
    step(
      "LIQUIDACIÓN FINAL",
      afterLiq?.status === "LIQUIDACION_FINAL" && finalLiq != null,
      `status=${afterLiq?.status} total=${finalLiq.totalAmount}`
    );

    // ACTA + FIRMA
    const { token: actaToken } = await generateActaSignatureLink(
      cancellation.id,
      admin.id,
      "http://localhost:3000"
    );
    await completeActaRemoteSignature(
      actaToken,
      {
        clientName: "Cliente E2E Baja",
        signatureImageData: MINIMAL_SIG,
        accepted: true,
      },
      "127.0.0.1",
      "e2e-test"
    );
    const signedFinal = await prisma.cancellationFinalLiquidation.findUnique({
      where: { id: finalLiq.id },
    });
    step(
      "ACTA/FIRMA",
      Boolean(signedFinal?.signedAt && signedFinal.clientSignature),
      `signedAt=${signedFinal?.signedAt?.toISOString() ?? "null"}`
    );

    const auditActa = await prisma.auditLog.count({
      where: { action: "ACTA_SIGNED_REMOTE", entityId: cancellation.id },
    });
    step("AUDITORÍA FIRMA", auditActa >= 1, `registros=${auditActa}`);

    // CIERRE
    await prisma.cancellation.update({
      where: { id: cancellation.id },
      data: { status: "BAJA_COMPLETADA", closeDate: new Date() },
    });
    const closed = await prisma.cancellation.findUnique({
      where: { id: cancellation.id },
      include: { customer: { select: { status: true } } },
    });
    step(
      "CIERRE",
      closed?.status === "BAJA_COMPLETADA" && closed.closeDate != null,
      `status=${closed?.status} customer=${closed?.customer.status}`
    );

    console.log("\nE2E baja flow: PASS —", steps.length, "etapas");
  } finally {
    if (cancellationId) {
      await prisma.auditLog.deleteMany({ where: { entityId: cancellationId } }).catch(() => undefined);
      await prisma.cancellationActaSignatureToken.deleteMany({ where: { cancellationId } }).catch(() => undefined);
      await prisma.cancellationFinalLiquidation.deleteMany({ where: { cancellationId } }).catch(() => undefined);
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
      await prisma.customerEquipment.deleteMany({ where: { customerId } }).catch(() => undefined);
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error("\nE2E baja flow: FAIL —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
