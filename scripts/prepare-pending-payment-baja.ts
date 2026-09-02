/**
 * Crea una baja sintética en PENDIENTE_DE_PAGO y escribe el ID en stdout (solo ID).
 * Uso: npx tsx scripts/prepare-pending-payment-baja.ts
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import {
  createCancellationRecord,
  recalculateCancellation,
} from "../src/lib/services/cancellations";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
} from "../src/lib/services/preliquidacion-remote-approval";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,TEST";

async function main() {
  assertTestDatabaseAllowed();
  const admin = await prisma.user.findFirst({ where: { email: "admin@infinity.net" } });
  if (!admin) throw new Error("admin seed requerido");

  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `UI-FIX-${suffix}`,
      name: "Cliente UI Fixture",
      cedula: `V-FIX-${suffix}`,
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
        create: { type: "ONU", serial: `SN-FIX-${suffix}`, brand: "Test", model: "ONU-1" },
      },
    },
  });

  const cancellation = await createCancellationRecord({
    customerId: customer.id,
    reason: "DECISION_VOLUNTARIA",
    notes: "UI fixture",
    requestDate: parseBusinessDateOnly("2026-08-01"),
    createdById: admin.id,
    withdrawalRequestFileName: "solicitud.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  });
  await recalculateCancellation(cancellation.id);
  const preliq = await generatePreliquidacion(cancellation.id, admin.id);
  const { token } = await generatePreliquidacionLink(preliq.id, admin.id, "http://localhost:3000");
  await approvePreliquidacionViaToken(token, "127.0.0.1", "ui-fixture");
  await prisma.cancellation.update({
    where: { id: cancellation.id },
    data: { status: "PENDIENTE_DE_PAGO" },
  });

  console.log(cancellation.id);
  console.error(`Cliente: ${customer.contract} | Baja: ${cancellation.id} | /bajas/${cancellation.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
