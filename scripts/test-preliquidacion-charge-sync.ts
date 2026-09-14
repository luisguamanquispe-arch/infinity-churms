/**
 * FASE 6.13 — sincronización CancellationCharge ↔ preliquidación (BD test).
 * npm run test:preliquidacion-charge-sync
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import { createCancellationRecord } from "../src/lib/services/cancellations";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  generatePreliquidacionLink,
  resolvePreliquidacionToken,
} from "../src/lib/services/preliquidacion-remote-approval";
import { runCancellationChargeMutation } from "../src/lib/services/preliquidacion-charge-sync";
import { generatePreliquidacionPdf } from "../src/lib/pdf-preliquidacion";
import { buildLiquidationBreakdownFromInputs } from "../src/lib/services/baja-liquidation";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,SYNC";

let failures = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    failures += 1;
    console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
    return;
  }
  console.log(`✓ ${name}`);
}

function approx(a: number, b: number) {
  return Math.abs(a - b) < 0.011;
}

async function createTestCustomer(suffix: number, planMonthlyUsd = 20) {
  return prisma.customer.create({
    data: {
      contract: `SYNC-1524-${suffix}`,
      name: "CHANO MONTACHANA EDDY SANTIAGO",
      cedula: `1804910667-${suffix}`,
      address: "Test",
      zone: "CENTRO",
      planName: "PLAN SIN LIMITES",
      planMonthlyUsd,
      serviceStartDate: parseBusinessDateOnly("2021-10-07"),
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2021-10-07"),
      pendingBalance: 22.4,
      status: "ACTIVO",
    },
  });
}

async function createTestCancellation(customerId: string, adminId: string, requestDate: string) {
  return createCancellationRecord({
    customerId,
    reason: "DECISION_VOLUNTARIA",
    requestDate: parseBusinessDateOnly(requestDate),
    createdById: adminId,
    withdrawalRequestFileName: "s.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada");
    process.exit(0);
  }
  assertTestDatabaseAllowed();

  const admin = await prisma.user.findFirst({
    where: { active: true, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("ADMIN requerido");

  const suffix = Date.now();
  const customer = await createTestCustomer(suffix);
  let cancellationId = "";

  try {
    const cancellation = await createTestCancellation(customer.id, admin.id, "2026-09-14");
    cancellationId = cancellation.id;

    // TEST 2 — charge before snapshot
    await runCancellationChargeMutation(cancellationId, admin.id, async (tx) => {
      await tx.cancellationCharge.create({
        data: { cancellationId, concept: "MES DE SEPTIEMBRE", amount: 22.4 },
      });
    });
    const preBefore = await generatePreliquidacion(cancellationId, admin.id);
    assert(
      "TEST2 charge before snapshot TOTAL=22.40",
      approx(Number(preBefore.totalAmount), 22.4),
      String(preBefore.totalAmount)
    );
    const other2 = preBefore.lineItems.filter((l) => l.category === "OTRO");
    assert("TEST2 OTHER line", other2.length >= 1 && approx(Number(other2[0].amount), 22.4));

    // TEST 3 — generate 0 then add charge (GENERADA in-place)
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId } });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId } });
    await prisma.cancellation.update({
      where: { id: cancellationId },
      data: { activePreliquidacionId: null },
    });
    const v1zero = await generatePreliquidacion(cancellationId, admin.id);
    assert("TEST3 V1 total 0", approx(Number(v1zero.totalAmount), 0));
    await runCancellationChargeMutation(cancellationId, admin.id, async (tx) => {
      await tx.cancellationCharge.create({
        data: { cancellationId, concept: "MES DE SEPTIEMBRE", amount: 22.4 },
      });
    });
    const v1sync = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: v1zero.id },
      include: { lineItems: true },
    });
    assert(
      "TEST3 GENERADA in-place TOTAL=22.40",
      approx(Number(v1sync?.totalAmount), 22.4),
      String(v1sync?.totalAmount)
    );

    // TEST 1 / 1524 + TEST 4 PENDIENTE_APROBACION
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId } });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId } });
    await prisma.cancellation.update({
      where: { id: cancellationId },
      data: { activePreliquidacionId: null },
    });
    const v1 = await generatePreliquidacion(cancellationId, admin.id);
    const { token: t1 } = await generatePreliquidacionLink(v1.id, admin.id);
    assert("TEST4 V1 PENDIENTE", v1.version === 1);
    const syncRes = await runCancellationChargeMutation(cancellationId, admin.id, async (tx) => {
      await tx.cancellationCharge.create({
        data: { cancellationId, concept: "MES DE SEPTIEMBRE", amount: 22.4 },
      });
    });
    assert("TEST1/4 sync new_version", syncRes?.mode === "new_version");
    assert("TEST4 V1→V2", syncRes?.fromVersion === 1 && syncRes?.toVersion === 2);
    const v1row = await prisma.cancellationPreliquidacion.findUnique({ where: { id: v1.id } });
    const v2 = await prisma.cancellationPreliquidacion.findFirst({
      where: { cancellationId, version: 2 },
      include: { lineItems: true, approvalTokens: { where: { isActive: true } } },
    });
    assert("TEST4 V1 SUPERSEDED", v1row?.status === "SUPERSEDED");
    assert("TEST4 V2 GENERADA/PENDIENTE", v2 != null && v2.status === "PENDIENTE_APROBACION");
    assert(
      "TEST1/1524 TOTAL=22.40",
      v2 != null && approx(Number(v2.totalAmount), 22.4),
      String(v2?.totalAmount)
    );
    const breakdown1524 = buildLiquidationBreakdownFromInputs({
      requestDate: parseBusinessDateOnly("2026-09-14"),
      permanenceStartDate: parseBusinessDateOnly("2021-10-07"),
      hasTvStreaming: false,
      tvStreamingSince: null,
      tariff: { permanenceMonths: 12, installCostUsd: 120, tvMonthlyUsd: 20 },
      monthsCompletedOverride: 12,
      monthlyContractUsd: 20,
      collectionCharges: [],
      collectionPaymentsTotal: 0,
      cancellationCharges: [{ concept: "MES DE SEPTIEMBRE", amount: 22.4 }],
      equipment: [],
      equipmentTariffs: [],
    });
    const nextMonth = breakdown1524.lines.some((l) => l.metadata?.includes("NEXT_MONTH_RULE"));
    assert("TEST1/12 NEXT_MONTH_RULE=0", !nextMonth && approx(breakdown1524.otherAmount, 22.4));
    const t1resolved = await resolvePreliquidacionToken(t1);
    const t1Error = "error" in t1resolved ? t1resolved.error : null;
    assert(
      "TEST4/9 T1 invalid",
      t1Error === "INVALID" || t1Error === "INVALID_STATE" || t1Error === "CANCELLED"
    );
    const t2 = v2?.approvalTokens[0];
    assert("TEST4 T2 active", Boolean(t2?.isActive));
    assert("TEST4 single active token on V2", (v2?.approvalTokens.length ?? 0) === 1);

    // TEST 9 API payload via resolve on new link — regenerate link to get raw token
    const { token: t2rawToken } = await generatePreliquidacionLink(v2!.id, admin.id);
    const pub = await resolvePreliquidacionToken(t2rawToken);
    assert("TEST9 T2 resolves", !("error" in pub && pub.error));
    if ("record" in pub && pub.record) {
      assert(
        "TEST9 public total 22.40",
        approx(Number(pub.record.preliquidacion.totalAmount), 22.4)
      );
    }

    // TEST 8 PDF
    const row = await prisma.cancellation.findUnique({
      where: { id: cancellationId },
      include: { customer: true, equipment: true, charges: true, activePreliquidacion: { include: { lineItems: true } } },
    });
    if (row?.activePreliquidacion) {
      const pdf = generatePreliquidacionPdf({
        docNumber: row.activePreliquidacion.docNumber ?? "PRE-TEST",
        cancellation: row,
        customer: row.customer,
        equipment: row.equipment,
        charges: row.charges,
        reasonLabel: "Test",
        lineItems: row.activePreliquidacion.lineItems.map((l) => ({
          concept: l.concept,
          amount: Number(l.amount),
        })),
        totalOverride: Number(row.activePreliquidacion.totalAmount),
      });
      assert("TEST8 PDF generated", pdf.length > 100);
      assert("TEST8 PDF total override", approx(Number(row.activePreliquidacion.totalAmount), 22.4));
    }

    // TEST 5 APROBADA block
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId } });
    await prisma.cancellationPreliquidacion.updateMany({
      where: { cancellationId },
      data: { status: "SUPERSEDED" },
    });
    const vApproved = await prisma.cancellationPreliquidacion.create({
      data: {
        cancellationId,
        version: 99,
        status: "APROBADA",
        docNumber: "PRE-APPROVED-TEST",
        totalAmount: 0,
        subtotal: 0,
        permanenceAmount: 0,
        tvAmount: 0,
        monthlyAmount: 0,
        equipmentAmount: 0,
        otherAmount: 0,
        creditsAmount: 0,
        createdById: admin.id,
      },
    });
    await prisma.cancellation.update({
      where: { id: cancellationId },
      data: { activePreliquidacionId: vApproved.id },
    });
    let blocked = false;
    try {
      await runCancellationChargeMutation(cancellationId, admin.id, async () => {
        await prisma.cancellationCharge.create({
          data: { cancellationId, concept: "X", amount: 22.4 },
        });
      });
    } catch (e) {
      blocked = e instanceof Error && e.message === "CHARGE_SYNC_APPROVED_SNAPSHOT";
    }
    assert("TEST5 blocked approved", blocked);
    const chargeCount = await prisma.cancellationCharge.count({ where: { cancellationId } });
    assert("TEST5 no partial charge", chargeCount === 0);
    const approvedRow = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: vApproved.id },
    });
    assert("TEST5 V unchanged", approx(Number(approvedRow?.totalAmount), 0));

    // TEST 6 UPDATE (new cancellation)
    const c2 = await createTestCancellation(
      (await createTestCustomer(suffix + 1)).id,
      admin.id,
      "2026-09-14"
    );
    const pv = await generatePreliquidacion(c2.id, admin.id);
    await runCancellationChargeMutation(c2.id, admin.id, async (tx) => {
      await tx.cancellationCharge.create({
        data: { cancellationId: c2.id, concept: "A", amount: 22.4 },
      });
    });
    const ch = await prisma.cancellationCharge.findFirst({ where: { cancellationId: c2.id } });
    await runCancellationChargeMutation(c2.id, admin.id, async (tx) => {
      await tx.cancellationCharge.update({
        where: { id: ch!.id },
        data: { amount: 30 },
      });
    });
    const afterUp = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: pv.id },
      include: { lineItems: true },
    });
    assert("TEST6 OTHER=30", approx(Number(afterUp?.totalAmount), 30));

    // TEST 7 DELETE
    await runCancellationChargeMutation(c2.id, admin.id, async (tx) => {
      await tx.cancellationCharge.delete({ where: { id: ch!.id } });
    });
    const afterDel = await prisma.cancellationPreliquidacion.findUnique({ where: { id: pv.id } });
    assert("TEST7 total 0 after delete", approx(Number(afterDel?.totalAmount), 0));

    await prisma.cancellation.deleteMany({ where: { id: c2.id } });
    await prisma.customer.deleteMany({ where: { contract: { startsWith: `SYNC-1524-${suffix + 1}` } } });

    // TEST 12 FASE 5 day 15 vs 16 (motor only)
    const d15 = buildLiquidationBreakdownFromInputs({
      requestDate: parseBusinessDateOnly("2026-09-15"),
      permanenceStartDate: parseBusinessDateOnly("2021-10-07"),
      hasTvStreaming: false,
      tvStreamingSince: null,
      tariff: { permanenceMonths: 12, installCostUsd: 120, tvMonthlyUsd: 20 },
      monthlyContractUsd: 20,
      collectionCharges: [],
      collectionPaymentsTotal: 0,
      cancellationCharges: [],
      equipment: [],
      equipmentTariffs: [],
    });
    assert("TEST12 day15 no next month", !d15.lines.some((l) => l.metadata?.includes("NEXT_MONTH_RULE")));
    const d16 = buildLiquidationBreakdownFromInputs({
      requestDate: parseBusinessDateOnly("2026-09-16"),
      permanenceStartDate: parseBusinessDateOnly("2021-10-07"),
      hasTvStreaming: false,
      tvStreamingSince: null,
      tariff: { permanenceMonths: 12, installCostUsd: 120, tvMonthlyUsd: 20 },
      monthlyContractUsd: 20,
      collectionCharges: [],
      collectionPaymentsTotal: 0,
      cancellationCharges: [],
      equipment: [],
      equipmentTariffs: [],
    });
    assert("TEST12 day16 next month", d16.lines.some((l) => l.metadata?.includes("NEXT_MONTH_RULE")));

    console.log(failures === 0 ? "\nFASE 6.13 charge-sync: PASS" : `\nFASE 6.13 charge-sync: FAIL (${failures})`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    if (cancellationId) {
      await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId } });
      await prisma.cancellationCharge.deleteMany({ where: { cancellationId } });
      await prisma.cancellation.deleteMany({ where: { id: cancellationId } });
    }
    await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
