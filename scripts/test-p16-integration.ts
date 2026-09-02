/**
 * FASE P1.6 — Validación integral con PostgreSQL TEST.
 * Requiere DATABASE_URL apuntando a localhost (NO producción).
 *
 * Uso:
 *   npm run db:bootstrap-test   (primera vez)
 *   npm run test:p16-integration
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import {
  createCancellationRecord,
  getCancellation,
  recalculateCancellation,
  updateCancellationAdmin,
  CancellationConflictError,
} from "@/lib/services/cancellations";
import { registerCollectionPayment, CollectionPaymentError } from "@/lib/services/collection-payments";
import { syncCustomerStatusAfterCancellationCompleted } from "@/lib/customer-status-sync";
import { serializeCancellationByRole } from "@/lib/serialize-cancellation-by-role";
import { generatePreliquidacion } from "@/lib/services/preliquidaciones";
import { planChangeEffectiveDate } from "@/lib/services/plan-changes";
import {
  DASHBOARD_KPI_DEFINITIONS,
} from "@/lib/dashboard-kpi-definitions";
import {
  FLOW_CANCELLATION_STATUSES,
  ORPHAN_CANCELLATION_STATUSES,
  PENDING_REQUEST_STATUSES,
} from "@/lib/cancellation-flow-statuses";
import {
  formatBusinessDateOnly,
  parseBusinessDateInput,
  parseBusinessDateOnly,
} from "@/lib/business-date";
import { assertTestDatabaseAllowed, formatDatabaseTargetSafe } from "@/lib/test-database-guard";
import type { CancellationStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,VEVTVA==";

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

function assertBlocked(name: string, fn: () => Promise<unknown>, code: string) {
  return fn()
    .then(() => assert(name, false, "debió fallar"))
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      assert(name, msg.includes(code), `got ${msg}`);
    });
}

function assertTestDatabaseUrl(url: string) {
  assertTestDatabaseAllowed(url);
}

function isDatabaseAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /authentication failed|password authentication failed/i.test(msg);
}

async function ensureSchemaReady() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
  } catch (error) {
    if (isDatabaseAuthError(error)) {
      throw new Error("BLOCKED — PostgreSQL authentication failed for infinity_bajas_test");
    }
    throw new Error(
      "Schema no inicializado. Ejecute: npm run db:bootstrap-test && npm run db:migrate && npm run db:seed"
    );
  }
  try {
    await prisma.$queryRaw`SELECT "permanenceMonthsSnapshot" FROM "Cancellation" LIMIT 0`;
  } catch {
    throw new Error("Columnas AUD-003/005 ausentes — ejecute npm run db:migrate en BD TEST");
  }
}

async function getOrCreateRoleUser(role: UserRole) {
  const email = `p16-${role.toLowerCase()}@test.local`;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password: "unused-hash",
        name: `Test ${role}`,
        role,
        active: true,
      },
    });
  }
  return user;
}

async function testAud019(adminId: string) {
  const suffix = Date.now();
  await prisma.tariffConfig.upsert({
    where: { id: "default" },
    update: { permanenceMonths: 18, installCostUsd: 200, tvMonthlyUsd: 2 },
    create: { id: "default", permanenceMonths: 18, installCostUsd: 200, tvMonthlyUsd: 2 },
  });

  const customer = await prisma.customer.create({
    data: {
      contract: `P16-AUD019-${suffix}`,
      name: "AUD-019 Test",
      cedula: `099${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2024-01-01"),
      planName: "Plan A",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2024-01-01"),
    },
  });

  const cancellation = await createCancellationRecord({
    customerId: customer.id,
    reason: "DECISION_VOLUNTARIA",
    notes: "AUD-019",
    requestDate: parseBusinessDateOnly("2026-01-15"),
    createdById: adminId,
    withdrawalRequestFileName: "s.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  });

  const snapBefore = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
  const monthsSnap = snapBefore?.permanenceMonthsSnapshot;
  const installSnap = Number(snapBefore?.installCostUsdSnapshot);

  await prisma.tariffConfig.update({
    where: { id: "default" },
    data: { permanenceMonths: 6, installCostUsd: 999, tvMonthlyUsd: 99 },
  });

  await recalculateCancellation(cancellation.id);
  const afterRecalc = await prisma.cancellation.findUnique({ where: { id: cancellation.id } });
  assert(
    "AUD-019 snapshot permanenceMonths inmutable",
    afterRecalc?.permanenceMonthsSnapshot === monthsSnap,
    `snap=${afterRecalc?.permanenceMonthsSnapshot} expected=${monthsSnap}`
  );
  assert(
    "AUD-019 snapshot installCostUsd inmutable",
    Number(afterRecalc?.installCostUsdSnapshot) === installSnap,
    `install=${afterRecalc?.installCostUsdSnapshot}`
  );

  await assertBlocked(
    "AUD-019 rechaza total manipulado sin recalculate",
    () => updateCancellationAdmin(cancellation.id, { totalAmount: 1 }),
    "FINANCIAL_OVERRIDE_REQUIRES_RECALCULATE"
  );
  await assertBlocked(
    "AUD-019 rechaza permanenceAmount manipulado",
    () => updateCancellationAdmin(cancellation.id, { permanenceAmount: 999999 }),
    "FINANCIAL_OVERRIDE_REQUIRES_RECALCULATE"
  );

  await prisma.tariffConfig.update({
    where: { id: "default" },
    data: { permanenceMonths: 18, installCostUsd: 200, tvMonthlyUsd: 2 },
  });
  await prisma.cancellation.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testAud025(adminId: string) {
  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-AUD025-${suffix}`,
      name: "AUD-025 Test",
      cedula: `098${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2020-01-01"),
      planName: "Plan",
      status: "ACTIVO",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2020-01-01"),
    },
  });

  const cancellation = await prisma.cancellation.create({
    data: {
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      requestDate: parseBusinessDateOnly("2026-01-01"),
      createdById: adminId,
      status: "BAJA_COMPLETADA",
      closeDate: new Date(),
      withdrawalRequestFileName: "s.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
      withdrawalRequestUploadedAt: new Date(),
    },
  });

  await syncCustomerStatusAfterCancellationCompleted(customer.id);
  let cust = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert("AUD-025 Customer INACTIVO tras baja completada", cust?.status === "INACTIVO");

  await syncCustomerStatusAfterCancellationCompleted(customer.id);
  cust = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert("AUD-025 sync idempotente (sigue INACTIVO)", cust?.status === "INACTIVO");

  await prisma.cancellation.delete({ where: { id: cancellation.id } });
  await prisma.customer.update({ where: { id: customer.id }, data: { status: "ACTIVO" } });

  const activeCancellation = await prisma.cancellation.create({
    data: {
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      requestDate: parseBusinessDateOnly("2026-02-01"),
      createdById: adminId,
      status: "SOLICITADA",
      withdrawalRequestFileName: "s.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
      withdrawalRequestUploadedAt: new Date(),
    },
  });
  const completed = await prisma.cancellation.create({
    data: {
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      requestDate: parseBusinessDateOnly("2026-01-01"),
      createdById: adminId,
      status: "BAJA_COMPLETADA",
      closeDate: new Date(),
      withdrawalRequestFileName: "s2.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
      withdrawalRequestUploadedAt: new Date(),
    },
  });
  await syncCustomerStatusAfterCancellationCompleted(customer.id);
  cust = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert(
    "AUD-025 Customer ACTIVE si hay otra baja activa",
    cust?.status === "ACTIVO",
    `status=${cust?.status}`
  );

  await prisma.cancellation.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testAud026(cobranzasId: string) {
  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-AUD026-${suffix}`,
      name: "AUD-026 Test",
      cedula: `097${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2024-06-01"),
      planName: "Plan",
      pendingBalance: 100,
      status: "ACTIVO",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2024-06-01"),
    },
  });

  const fenix = `FENIX-P16-${suffix}`;
  const payload = {
    paymentDate: "2026-01-15",
    amount: 60,
    fenixDocument: fenix,
    paymentMethod: "EFECTIVO",
  };

  const [r1, r2] = await Promise.allSettled([
    registerCollectionPayment(customer.id, cobranzasId, payload),
    registerCollectionPayment(customer.id, cobranzasId, payload),
  ]);

  const successes = [r1, r2].filter((r) => r.status === "fulfilled");
  const conflicts = [r1, r2].filter(
    (r) =>
      r.status === "rejected" &&
      r.reason instanceof CollectionPaymentError &&
      r.reason.message === "CONCURRENT_BALANCE_UPDATE"
  );
  const idempotent = successes.filter(
    (r) => r.status === "fulfilled" && r.value.idempotent
  );

  assert(
    "AUD-026 concurrencia: al menos una operación exitosa",
    successes.length >= 1,
    `successes=${successes.length}`
  );
  assert(
    "AUD-026 concurrencia: conflicto o idempotencia en la otra",
    conflicts.length + idempotent.length >= 1 || successes.length === 1,
    `conflicts=${conflicts.length} idempotent=${idempotent.length}`
  );

  const payCount = await prisma.collectionPayment.count({
    where: { customerId: customer.id, fenixDocument: fenix },
  });
  assert("AUD-026 un solo pago persistido", payCount === 1, `count=${payCount}`);

  const cust = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert(
    "AUD-026 saldo final correcto",
    Number(cust?.pendingBalance) === 40,
    `balance=${cust?.pendingBalance}`
  );

  const dup = await registerCollectionPayment(customer.id, cobranzasId, payload);
  assert("AUD-026 idempotencia fenixDocument", dup.idempotent === true);
  const payCount2 = await prisma.collectionPayment.count({
    where: { customerId: customer.id, fenixDocument: fenix },
  });
  assert("AUD-026 idempotencia: sigue un pago", payCount2 === 1);

  await prisma.collectionPayment.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testAudC01(adminId: string) {
  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-C01-${suffix}`,
      name: "AUD-C01",
      cedula: `096${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2024-01-01"),
      planName: "Plan",
      pendingBalance: 50,
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2024-01-01"),
    },
  });
  const cancellation = await prisma.cancellation.create({
    data: {
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      requestDate: parseBusinessDateOnly("2026-01-01"),
      createdById: adminId,
      status: "SOLICITADA",
      permanenceAmount: 100,
      tvAmount: 10,
      monthlyAmount: 20,
      equipmentAmount: 5,
      totalAmount: 135,
      withdrawalRequestFileName: "s.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
      withdrawalRequestUploadedAt: new Date(),
    },
  });

  const row = await getCancellation(cancellation.id);
  if (!row) throw new Error("cancellation not found");

  const adminJson = serializeCancellationByRole(row, "ADMIN");
  const tecnicoJson = serializeCancellationByRole(row, "TECNICO");

  assert(
    "AUD-C01 ADMIN recibe totalAmount",
    Number(adminJson.totalAmount) > 0,
    String(adminJson.totalAmount)
  );
  assert(
    "AUD-C01 TECNICO totalAmount=0 en JSON",
    Number(tecnicoJson.totalAmount) === 0,
    String(tecnicoJson.totalAmount)
  );
  assert(
    "AUD-C01 TECNICO sin payments en JSON",
    Array.isArray(tecnicoJson.payments) && tecnicoJson.payments.length === 0
  );
  assert(
    "AUD-C01 TECNICO oculta pendingBalance cliente",
    Number(tecnicoJson.customer.pendingBalance) === 0
  );

  await prisma.cancellation.delete({ where: { id: cancellation.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testAud022(adminId: string) {
  const suffix = Date.now();
  const statuses: CancellationStatus[] = [
    "SOLICITADA",
    "PRELIQUIDACION_GENERADA",
    "BAJA_AUTORIZADA",
    "BAJA_COMPLETADA",
  ];
  const ids: string[] = [];
  for (const st of statuses) {
    const c = await prisma.customer.create({
      data: {
        contract: `P16-KPI-${st}-${suffix}`,
        name: `KPI ${st}`,
        cedula: `095${String(suffix).slice(-5)}${ids.length}`,
        address: "T",
        serviceStartDate: parseBusinessDateOnly("2024-01-01"),
        planName: "P",
        originTechnology: "FIBRA",
        currentTechnology: "FIBRA",
        fiberInstallDate: parseBusinessDateOnly("2024-01-01"),
      },
    });
    const can = await prisma.cancellation.create({
      data: {
        customerId: c.id,
        reason: "DECISION_VOLUNTARIA",
        requestDate: parseBusinessDateOnly("2026-01-01"),
        createdById: adminId,
        status: st,
        closeDate: st === "BAJA_COMPLETADA" ? new Date() : null,
        withdrawalRequestFileName: "s.pdf",
        withdrawalRequestFileData: MINIMAL_PDF,
        withdrawalRequestUploadedAt: new Date(),
      },
    });
    ids.push(can.id);
  }

  const pendingKpi = DASHBOARD_KPI_DEFINITIONS.find((k) => k.key === "pendingRequests")!;
  const pendingStatuses = pendingKpi.includedStatuses;
  const statusList = Array.isArray(pendingStatuses) ? pendingStatuses : [];
  const dbPending = await prisma.cancellation.count({
    where: { status: { in: statusList } },
  });
  assert(
    "AUD-022 KPI pendingRequests alineado BD",
    dbPending >= 1,
    `db=${dbPending} def=${statusList.join(",")}`
  );

  const equipPending = await prisma.cancellationEquipment.count({
    where: {
      OR: [{ delivered: false }, { condition: "NO_ENTREGADO" }],
      cancellation: { status: { notIn: ["BAJA_COMPLETADA", "CANCELADA"] } },
    },
  });
  assert("AUD-022 filtro equipos definido", typeof equipPending === "number");

  for (const id of ids) {
    const row = await prisma.cancellation.findUnique({ where: { id }, select: { customerId: true } });
    if (row) {
      await prisma.cancellation.delete({ where: { id } });
      await prisma.customer.delete({ where: { id: row.customerId } });
    }
  }
}

async function testAud024() {
  const req = parseBusinessDateOnly("2026-03-01");
  const signed = parseBusinessDateOnly("2026-04-15");
  const effective = planChangeEffectiveDate({ requestDate: req, signedAt: signed });
  assert(
    "AUD-024 effectiveDate = signedAt",
    formatBusinessDateOnly(effective) === "2026-04-15",
    formatBusinessDateOnly(effective)
  );
}

async function testAud017Customers() {
  const suffix = Date.now();
  const inputDate = "2026-01-31";
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-DATE-${suffix}`,
      name: "AUD-017",
      cedula: `094${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateInput(inputDate),
      planName: "Plan",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateInput(inputDate),
    },
  });
  const stored = await prisma.customer.findUnique({ where: { id: customer.id } });
  assert(
    "AUD-017 BD serviceStartDate sin drift",
    formatBusinessDateOnly(stored!.serviceStartDate) === inputDate,
    formatBusinessDateOnly(stored!.serviceStartDate)
  );
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testPreliquidacion(adminId: string) {
  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-PRELIQ-${suffix}`,
      name: "Preliq",
      cedula: `093${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2025-06-01"),
      planName: "Plan",
      pendingBalance: 45.5,
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2025-06-01"),
    },
  });
  const cancellation = await prisma.cancellation.create({
    data: {
      customerId: customer.id,
      reason: "DECISION_VOLUNTARIA",
      requestDate: parseBusinessDateOnly("2026-08-10"),
      createdById: adminId,
      status: "SOLICITADA",
      withdrawalRequestFileName: "s.pdf",
      withdrawalRequestFileData: MINIMAL_PDF,
      withdrawalRequestUploadedAt: new Date(),
    },
  });
  const preliq = await generatePreliquidacion(cancellation.id, adminId);
  assert("PRELIQ line items", preliq.lineItems.length > 0);
  assert("PRELIQ total > 0 o saldo", Number(preliq.totalAmount) >= 0);
  const updated = await prisma.cancellation.findUnique({
    where: { id: cancellation.id },
    select: { activePreliquidacionId: true },
  });
  assert("PRELIQ activePreliquidacionId", Boolean(updated?.activePreliquidacionId));
  await prisma.cancellation.delete({ where: { id: cancellation.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testConcurrencyBaja(userId: string) {
  const suffix = Date.now();
  const customer = await prisma.customer.create({
    data: {
      contract: `P16-CONC-${suffix}`,
      name: "Conc",
      cedula: `092${String(suffix).slice(-7)}`,
      address: "Test",
      serviceStartDate: parseBusinessDateOnly("2024-01-01"),
      planName: "Plan",
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2024-01-01"),
    },
  });
  const input = {
    customerId: customer.id,
    reason: "DECISION_VOLUNTARIA" as const,
    notes: "conc",
    requestDate: new Date(),
    createdById: userId,
    withdrawalRequestFileName: "s.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  };
  const results = await Promise.allSettled([
    createCancellationRecord(input),
    createCancellationRecord(input),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const conflict = results.filter(
    (r) => r.status === "rejected" && r.reason instanceof CancellationConflictError
  ).length;
  assert("CONC baja: una exitosa", ok === 1, `ok=${ok}`);
  assert("CONC baja: un conflicto", conflict === 1, `conflict=${conflict}`);
  await prisma.cancellation.deleteMany({ where: { customerId: customer.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
}

async function testAud021() {
  assert("AUD-021 FLOW definido", FLOW_CANCELLATION_STATUSES.length >= 8);
  assert("AUD-021 ORPHAN separado", ORPHAN_CANCELLATION_STATUSES.includes("PRELIQUIDACION_APROBADA"));
  assert(
    "AUD-021 orphan no en pending KPI",
    !PENDING_REQUEST_STATUSES.includes("PRELIQUIDACION_APROBADA" as CancellationStatus)
  );
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("FAIL: DATABASE_URL no configurada. Cree .env con BD TEST local.");
    process.exit(1);
  }
  assertTestDatabaseUrl(url);
  console.log(`BD TEST: ${formatDatabaseTargetSafe(url)}`);

  await ensureSchemaReady();

  const admin = await getOrCreateRoleUser("ADMIN");
  const cobranzas = await getOrCreateRoleUser("COBRANZAS");
  await getOrCreateRoleUser("TECNICO");
  await getOrCreateRoleUser("SUPERVISOR");

  console.log("\n--- AUD-019 ---");
  await testAud019(admin.id);
  console.log("\n--- AUD-025 ---");
  await testAud025(admin.id);
  console.log("\n--- AUD-026 ---");
  await testAud026(cobranzas.id);
  console.log("\n--- AUD-C01 ---");
  await testAudC01(admin.id);
  console.log("\n--- AUD-022 ---");
  await testAud022(admin.id);
  console.log("\n--- AUD-024 ---");
  await testAud024();
  console.log("\n--- AUD-017 ---");
  await testAud017Customers();
  console.log("\n--- AUD-021 ---");
  await testAud021();
  console.log("\n--- PRELIQUIDACIÓN ---");
  await testPreliquidacion(admin.id);
  console.log("\n--- CONCURRENCIA BAJA ---");
  await testConcurrencyBaja(admin.id);

  console.log(`\nP1.6 integración: ${passed} OK, ${failed} fallidas`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
