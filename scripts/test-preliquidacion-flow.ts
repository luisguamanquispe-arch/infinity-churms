/**
 * Prueba de integración del flujo de preliquidación (requiere DATABASE_URL).
 * Uso: npm run test:preliquidacion
 *
 * No utiliza producción. Crea datos de prueba y los elimina al finalizar.
 */
import { PrismaClient } from "@prisma/client";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
} from "../src/lib/services/preliquidacion-remote-approval";
import { assertPreliquidacionApproved } from "../src/lib/preliquidacion-guards";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada. Configure en .env local para ejecutar esta prueba.");
    process.exit(0);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No hay usuario ADMIN activo");

  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `TST-PRELIQ-${suffix}`,
      name: "Cliente Prueba Preliquidación",
      cedula: `V-${suffix}`,
      address: "Test",
      zone: "CENTRO",
      planName: "Plan Test 50MB",
      serviceStartDate: new Date("2025-06-01"),
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: new Date("2025-06-01"),
      pendingBalance: 45.5,
      status: "ACTIVO",
    },
  });

  let cancellationId: string | null = null;

  try {
    const cancellation = await prisma.cancellation.create({
      data: {
        customerId: customer.id,
        reason: "DECISION_VOLUNTARIA",
        requestDate: new Date("2026-08-10"),
        createdById: admin.id,
        status: "SOLICITADA",
        withdrawalRequestFileName: "test.pdf",
        withdrawalRequestFileData: "data:application/pdf;base64,TEST",
        withdrawalRequestUploadedAt: new Date(),
      },
    });
    cancellationId = cancellation.id;

    // Bloqueo antes de aprobación
    let blocked = false;
    try {
      await assertPreliquidacionApproved(cancellation.id);
    } catch (e) {
      if (e instanceof Error && e.message === "PRELIQUIDACION_NOT_APPROVED") blocked = true;
    }
    if (!blocked) throw new Error("assertPreliquidacionApproved debió bloquear antes de generar");

    const preliq = await generatePreliquidacion(cancellation.id, admin.id);
    if (!preliq.lineItems.length) throw new Error("Preliquidación sin line items");
    if (Number(preliq.totalAmount) <= 0 && Number(customer.pendingBalance) > 0) {
      console.warn("WARN: total 0 con saldo pendiente — revisar cálculo");
    }

    const updated = await prisma.cancellation.findUnique({
      where: { id: cancellation.id },
      select: { activePreliquidacionId: true, status: true },
    });
    if (!updated?.activePreliquidacionId) {
      throw new Error("activePreliquidacionId no fue guardado");
    }
    console.log("✓ Generación + activePreliquidacionId");

    const { token } = await generatePreliquidacionLink(preliq.id, admin.id, "http://localhost:3000");
    if (!token || token.length < 20) throw new Error("Token inválido o corto");
    console.log("✓ Token generado (hash almacenado, no expuesto en URL más allá del token opaco)");

    await approvePreliquidacionViaToken(token, "127.0.0.1", "test-agent");
    const approved = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: preliq.id },
    });
    if (approved?.status !== "APROBADA") throw new Error(`Estado esperado APROBADA, got ${approved?.status}`);
    if (!approved.approvedAt || !approved.approvedIp) {
      throw new Error("Faltan metadatos de aprobación");
    }
    console.log("✓ Aprobación cliente → APROBADA");

    await assertPreliquidacionApproved(cancellation.id);
    console.log("✓ Bloqueo liberado tras aprobación");

    console.log("\nPrueba de preliquidación OK");
  } finally {
    if (cancellationId) {
      await prisma.cancellation.delete({ where: { id: cancellationId } }).catch(() => undefined);
    }
    await prisma.customer.delete({ where: { id: customer.id } }).catch(() => undefined);
  }
}

main()
  .catch((e) => {
    console.error("FAIL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
