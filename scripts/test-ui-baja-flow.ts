/**
 * Prueba UI-equivalente vía HTTP (mismos endpoints que la interfaz).
 * Uso: npm run test:ui-baja-flow
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import {
  generatePreliquidacion,
  computeFinalLiquidation,
} from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
} from "../src/lib/services/preliquidacion-remote-approval";
import {
  completeActaRemoteSignature,
  generateActaSignatureLink,
} from "../src/lib/services/cancellation-acta-remote-signature";
import { createCancellationRecord, initEquipmentChecklist, recalculateCancellation } from "../src/lib/services/cancellations";

const BASE = process.env.UI_TEST_BASE_URL ?? "http://localhost:3000";
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

function hasDecimalLike(obj: unknown, path = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  const ctor = (obj as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "Decimal") return [path || "(root)"];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => hasDecimalLike(v, `${path}[${i}]`));
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    hasDecimalLike(v, path ? `${path}.${k}` : k)
  );
}

async function loginCookie(): Promise<string> {
  const password = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (!password) throw new Error("SEED_DEFAULT_PASSWORD requerido");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cobranzas@infinity.net", password }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) throw new Error(`Login falló (${res.status})`);
  return setCookie.split(";")[0];
}

async function apiGet(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GET ${path} no JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  return { res, json };
}

async function apiPost(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function apiPatch(path: string, cookie: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function main() {
  assertTestDatabaseAllowed();
  const cookie = await loginCookie();
  step("LOGIN", true, "cobranzas@infinity.net (cookie OK)");

  const suffix = Date.now();
  let customerId = "";
  let cancellationId = "";

  try {
    const customer = await prisma.customer.create({
      data: {
        contract: `UI-E2E-${suffix}`,
        name: "Cliente UI E2E",
        cedula: `V-UI-${suffix}`,
        address: "Test UI",
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
            serial: `SN-UI-${suffix}`,
            brand: "Test",
            model: "ONU-1",
          },
        },
      },
    });
    customerId = customer.id;
    step("CLIENTE", true, customer.contract);

    const admin = await prisma.user.findFirst({ where: { email: "admin@infinity.net" } });
    if (!admin) throw new Error("admin seed requerido");

    const cancellation = await createCancellationRecord({
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      notes: "UI E2E",
      requestDate: parseBusinessDateOnly("2026-08-01"),
      createdById: admin.id,
      withdrawalRequestFileName: "solicitud.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
    });
    cancellationId = cancellation.id;
    await recalculateCancellation(cancellation.id);
    step("BAJA", true, `status=${cancellation.status}`);

    const preliq = await generatePreliquidacion(cancellation.id, admin.id);
    step("PRELIQUIDACIÓN", preliq.lineItems.length > 0, `V${preliq.version} total=${preliq.totalAmount}`);

    const { token: preliqToken } = await generatePreliquidacionLink(
      preliq.id,
      admin.id,
      BASE
    );
    await approvePreliquidacionViaToken(preliqToken, "127.0.0.1", "ui-e2e");
    const afterApprove = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
    step("APROBACIÓN", afterApprove?.status === "BAJA_AUTORIZADA", `status=${afterApprove?.status}`);

    await prisma.cancellation.update({
      where: { id: cancellation.id },
      data: { status: "PENDIENTE_DE_PAGO" },
    });
    step("PRE-PAGO", true, "status=PENDIENTE_DE_PAGO");

    const detailBefore = await apiGet(`/api/cancellations/${cancellation.id}`, cookie);
    step("GET DETALLE", detailBefore.res.ok, `HTTP ${detailBefore.res.status}`);
    const decimalPaths = hasDecimalLike(detailBefore.json);
    step("SERIALIZACIÓN", decimalPaths.length === 0, decimalPaths.length ? decimalPaths.join(", ") : "sin Decimal");

    const invoice = `FAC-UI-${suffix}`;
    const pay = await apiPost(`/api/cancellations/${cancellation.id}/payment`, cookie, {
      paymentDate: "2026-08-15",
      method: "TRANSFERENCIA",
      invoiceNumber: invoice,
      amountPaid: Number(preliq.totalAmount),
      notes: "UI test",
    });
    step(
      "PAGO",
      pay.res.ok,
      `HTTP ${pay.res.status} body=${JSON.stringify(pay.json)}`
    );
    const afterPay = await apiGet(`/api/cancellations/${cancellation.id}`, cookie);
    step(
      "PAGADA",
      (afterPay.json as { status?: string }).status === "PAGADA",
      `status=${(afterPay.json as { status?: string }).status ?? "?"}`
    );

    await initEquipmentChecklist(cancellation.id, customer.id);
    const eqList = await prisma.cancellationEquipment.findMany({ where: { cancellationId: cancellation.id } });
    for (const eq of eqList) {
      await apiPatch(`/api/cancellations/${cancellation.id}/equipment`, cookie, {
        equipmentId: eq.id,
        delivered: true,
        condition: "BUENO",
        brand: eq.brand ?? "Test",
        model: eq.model ?? "ONU-1",
        serial: eq.serial ?? `SN-${suffix}`,
      });
    }
    const advance1 = await apiPatch(`/api/cancellations/${cancellation.id}`, cookie, {
      action: "advance_status",
    });
    step(
      "LIQUIDACIÓN",
      advance1.res.ok && (advance1.json as { status?: string }).status === "LIQUIDACION_FINAL",
      `HTTP ${advance1.res.status} status=${(advance1.json as { status?: string }).status ?? "?"}`
    );

    const { token: actaToken } = await generateActaSignatureLink(cancellation.id, admin.id, BASE);
    await completeActaRemoteSignature(
      actaToken,
      {
        clientName: customer.name,
        signatureImageData: MINIMAL_SIG,
        accepted: true,
      },
      "127.0.0.1",
      "ui-e2e"
    );
    step("ACTA/FIRMA", true, "acta firmada remotamente");

    const close = await apiPatch(`/api/cancellations/${cancellation.id}`, cookie, {
      action: "advance_status",
    });
    step(
      "CIERRE",
      close.res.ok && (close.json as { status?: string }).status === "BAJA_COMPLETADA",
      `HTTP ${close.res.status} status=${(close.json as { status?: string }).status ?? "?"}`
    );

    const cust = await prisma.customer.findUnique({ where: { id: customer.id }, select: { status: true } });
    step("CUSTOMER STATUS", cust?.status === "INACTIVO", `status=${cust?.status ?? "?"}`);

    console.log(`\nUI baja flow (HTTP): PASS — ${steps.length} etapas`);
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
    console.error("\nUI baja flow (HTTP): FAIL —", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
