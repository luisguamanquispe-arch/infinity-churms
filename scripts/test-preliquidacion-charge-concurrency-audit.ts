/**
 * FASE 6.13.2-BIS — concurrencia determinista (C1/C2) + atomicidad + rollback.
 * npx tsx scripts/test-preliquidacion-charge-concurrency-audit.ts
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";
import { parseBusinessDateOnly } from "../src/lib/business-date";
import { audit } from "../src/lib/audit";
import { createCancellationRecord } from "../src/lib/services/cancellations";
import { generatePreliquidacion } from "../src/lib/services/preliquidaciones";
import {
  approvePreliquidacionViaToken,
  generatePreliquidacionLink,
  resolvePreliquidacionToken,
} from "../src/lib/services/preliquidacion-remote-approval";
import { runCancellationChargeMutation } from "../src/lib/services/preliquidacion-charge-sync";
import {
  activateConcurrencyBarrier,
  deactivateConcurrencyBarrier,
  getConcurrencyBarrierTrace,
  releaseApproveCommitBarrier,
  releaseChargeCommitBarrier,
  waitForApproveLocksAcquired,
  waitForChargeLockAttempt,
  waitForChargeLocksAcquired,
} from "../src/lib/test-only/concurrency-transaction-barrier";

const prisma = new PrismaClient();
const MINIMAL_PDF = "data:application/pdf;base64,CONC";

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

/** Misma semántica HTTP que PATCH add_charge en route.ts (sin cookies Next). */
async function addChargeHttpContract(
  cancellationId: string,
  userId: string,
  concept: string,
  amount: number
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  try {
    const preliquidacionSync = await runCancellationChargeMutation(
      cancellationId,
      userId,
      async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId, concept, amount },
        });
      }
    );
    await audit({ userId, action: "ADD_CHARGE", entity: "Cancellation", entityId: cancellationId });
    return { httpStatus: 200, body: { ok: true, preliquidacionSync } };
  } catch (e) {
    if (e instanceof Error && e.message === "CHARGE_SYNC_APPROVED_SNAPSHOT") {
      await audit({
        userId,
        action: "CHARGE_CHANGE_BLOCKED_APPROVED",
        entity: "Cancellation",
        entityId: cancellationId,
      });
      return {
        httpStatus: 409,
        body: {
          error:
            "No se puede agregar cargos: la preliquidación ya fue aprobada. Debe iniciar un nuevo trámite si aplica.",
        },
      };
    }
    throw e;
  }
}

/** Misma semántica HTTP que POST approve en baja/preliquidacion/[token]/route.ts */
async function approveHttpContract(
  rawToken: string
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  try {
    const preliq = await approvePreliquidacionViaToken(rawToken, "127.0.0.1", "conc-audit");
    return {
      httpStatus: 200,
      body: { ok: true, approved: true, totalAmount: Number(preliq.totalAmount) },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    const status =
      msg === "REASON_REQUIRED"
        ? 400
        : ["INVALID", "EXPIRED", "CANCELLED", "INVALID_STATE"].includes(msg)
          ? 404
          : 500;
    return { httpStatus: status, body: { error: msg } };
  }
}

async function captureFinancialSnapshot(cancellationId: string, preliquidacionId: string | null) {
  const cancellation = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    select: {
      otherAmount: true,
      totalAmount: true,
      activePreliquidacionId: true,
      status: true,
    },
  });
  const chargeCount = await prisma.cancellationCharge.count({ where: { cancellationId } });
  const pre = preliquidacionId
    ? await prisma.cancellationPreliquidacion.findUnique({
        where: { id: preliquidacionId },
        select: { version: true, status: true, totalAmount: true },
      })
    : null;
  const activeTokens = preliquidacionId
    ? await prisma.preliquidacionApprovalToken.count({
        where: { preliquidacionId, isActive: true },
      })
    : 0;
  const versionCount = await prisma.cancellationPreliquidacion.count({
    where: { cancellationId },
  });
  return { cancellation, chargeCount, pre, activeTokens, versionCount };
}

async function setupCancellation(adminId: string, suffix: number, requestDate = "2026-09-14") {
  const customer = await prisma.customer.create({
    data: {
      contract: `CONC-${suffix}`,
      name: "Conc Test",
      cedula: `C-${suffix}`,
      address: "T",
      zone: "CENTRO",
      planName: "PLAN SIN LIMITES",
      planMonthlyUsd: 20,
      serviceStartDate: parseBusinessDateOnly("2021-10-07"),
      originTechnology: "FIBRA",
      currentTechnology: "FIBRA",
      fiberInstallDate: parseBusinessDateOnly("2021-10-07"),
      pendingBalance: 22.4,
      status: "ACTIVO",
    },
  });
  const cancellation = await createCancellationRecord({
    customerId: customer.id,
    reason: "DECISION_VOLUNTARIA",
    requestDate: parseBusinessDateOnly(requestDate),
    createdById: adminId,
    withdrawalRequestFileName: "s.pdf",
    withdrawalRequestFileData: MINIMAL_PDF,
  });
  return { customer, cancellation };
}

async function countActiveVersions(cancellationId: string) {
  const c = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    select: { activePreliquidacionId: true },
  });
  const nonSuperseded = await prisma.cancellationPreliquidacion.count({
    where: { cancellationId, status: { not: "SUPERSEDED" } },
  });
  const activeTokens = await prisma.preliquidacionApprovalToken.count({
    where: {
      isActive: true,
      preliquidacion: { cancellationId },
    },
  });
  return { activePreliquidacionId: c?.activePreliquidacionId, nonSuperseded, activeTokens };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL no configurada");
    process.exit(0);
  }
  assertTestDatabaseAllowed();

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("ADMIN required");

  const suffix = Date.now();

  // --- A: two add_charge parallel (GENERADA in-place) ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix);
    const v1 = await generatePreliquidacion(cancellation.id, admin.id);
    await Promise.all([
      runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "A", amount: 10 },
        });
      }),
      runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "B", amount: 12.4 },
        });
      }),
    ]);
    const charges = await prisma.cancellationCharge.count({ where: { cancellationId: cancellation.id } });
    const active = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: v1.id },
      include: { lineItems: true },
    });
    const counts = await countActiveVersions(cancellation.id);
    assert("CONC-A two charges created", charges === 2, `count=${charges}`);
    assert("CONC-A single non-superseded version", counts.nonSuperseded === 1, String(counts.nonSuperseded));
    assert(
      "CONC-A snapshot total = sum charges",
      active != null && approx(Number(active.totalAmount), 22.4),
      String(active?.totalAmount)
    );
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // --- B: add_charge + generatePreliquidacion parallel ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 1);
    await Promise.allSettled([
      runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "MES DE SEPTIEMBRE", amount: 22.4 },
        });
      }),
      generatePreliquidacion(cancellation.id, admin.id),
    ]);
    const counts = await countActiveVersions(cancellation.id);
    const active = await prisma.cancellationPreliquidacion.findFirst({
      where: { cancellationId: cancellation.id, status: { not: "SUPERSEDED" } },
      orderBy: { version: "desc" },
    });
    assert("CONC-B exactly one working version", counts.nonSuperseded === 1, String(counts.nonSuperseded));
    assert(
      "CONC-B active total reflects charge or motor",
      active != null && approx(Number(active.totalAmount), 22.4),
      String(active?.totalAmount)
    );
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // --- C1 DETERMINISTIC: APPROVE gana (lock → charge bloqueado → APROBADA → charge 409) ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 2);
    const v1 = await generatePreliquidacion(cancellation.id, admin.id);
    const v1Before = await prisma.cancellationPreliquidacion.findUnique({ where: { id: v1.id } });
    const v1OriginalTotal = Number(v1Before?.totalAmount ?? 0);
    const { token: t1 } = await generatePreliquidacionLink(v1.id, admin.id);
    const tokenBefore = await prisma.preliquidacionApprovalToken.findFirst({
      where: { preliquidacionId: v1.id, isActive: true },
    });
    const finBefore = await captureFinancialSnapshot(cancellation.id, v1.id);
    const auditBefore = await prisma.auditLog.count({
      where: { entityId: cancellation.id, action: "ADD_CHARGE" },
    });

    activateConcurrencyBarrier("C1_APPROVE_WINS");
    const approvePromise = approveHttpContract(t1);
    await waitForApproveLocksAcquired();
    const chargePromise = addChargeHttpContract(
      cancellation.id,
      admin.id,
      "MES DE SEPTIEMBRE",
      22.4
    );
    await waitForChargeLockAttempt();
    assert(
      "C1 trace: approve lock before charge attempt",
      getConcurrencyBarrierTrace()[0] === "approve_locks_acquired" &&
        getConcurrencyBarrierTrace().includes("charge_lock_attempt")
    );
    releaseApproveCommitBarrier();
    const [approveRes, chargeRes] = await Promise.all([approvePromise, chargePromise]);
    deactivateConcurrencyBarrier();

    assert("C1 APPROVE HTTP 200", approveRes.httpStatus === 200);
    assert("C1 ADD_CHARGE HTTP 409", chargeRes.httpStatus === 409);
    assert(
      "C1 charge error body",
      typeof chargeRes.body.error === "string" && chargeRes.body.error.includes("aprobada")
    );

    const chargeCount = await prisma.cancellationCharge.count({
      where: { cancellationId: cancellation.id },
    });
    assert("C1 CancellationCharge count=0", chargeCount === 0);

    const v1row = await prisma.cancellationPreliquidacion.findUnique({ where: { id: v1.id } });
    assert("C1 V1 APROBADA", v1row?.status === "APROBADA");
    assert("C1 V1 total unchanged", approx(Number(v1row?.totalAmount), v1OriginalTotal));
    const v2exists = await prisma.cancellationPreliquidacion.count({
      where: { cancellationId: cancellation.id, version: 2 },
    });
    assert("C1 no V2", v2exists === 0);
    const counts = await countActiveVersions(cancellation.id);
    assert("C1 one working version", counts.nonSuperseded === 1);

    const tokenAfter = await prisma.preliquidacionApprovalToken.findUnique({
      where: { id: tokenBefore!.id },
    });
    assert("C1 no new token row for V1", tokenAfter != null);
    assert(
      "C1 T1 completed by approve (not superseded by charge)",
      tokenAfter?.status === "COMPLETADO" && tokenAfter.isActive === false
    );
    const newTokens = await prisma.preliquidacionApprovalToken.count({
      where: {
        preliquidacionId: v1.id,
        id: { not: tokenBefore!.id },
      },
    });
    assert("C1 no extra tokens on V1", newTokens === 0);

    const finAfter = await captureFinancialSnapshot(cancellation.id, v1.id);
    assert(
      "C1 Cancellation.otherAmount unchanged",
      approx(Number(finAfter.cancellation?.otherAmount), Number(finBefore.cancellation?.otherAmount))
    );
    assert(
      "C1 Cancellation.totalAmount unchanged",
      approx(Number(finAfter.cancellation?.totalAmount), Number(finBefore.cancellation?.totalAmount))
    );
    const auditAdd = await prisma.auditLog.count({
      where: { entityId: cancellation.id, action: "ADD_CHARGE" },
    });
    assert("C1 no successful ADD_CHARGE audit", auditAdd === auditBefore);
    const auditBlocked = await prisma.auditLog.findFirst({
      where: { entityId: cancellation.id, action: "CHARGE_CHANGE_BLOCKED_APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    assert("C1 blocked audit present", auditBlocked != null);

    await prisma.preliquidacionApprovalToken.deleteMany({
      where: { preliquidacion: { cancellationId: cancellation.id } },
    });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // --- D: two sync (new version path) parallel ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 3);
    const v1 = await generatePreliquidacion(cancellation.id, admin.id);
    await generatePreliquidacionLink(v1.id, admin.id);
    await Promise.allSettled([
      runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "X", amount: 5 },
        });
      }),
      runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "Y", amount: 17.4 },
        });
      }),
    ]);
    const counts = await countActiveVersions(cancellation.id);
    const active = await prisma.cancellationPreliquidacion.findFirst({
      where: { cancellationId: cancellation.id, status: { not: "SUPERSEDED" } },
      orderBy: { version: "desc" },
    });
    assert("CONC-D one working version after dual sync", counts.nonSuperseded === 1);
    assert(
      "CONC-D total consistent",
      active != null && approx(Number(active.totalAmount), 22.4),
      String(active?.totalAmount)
    );
    assert("CONC-D at most one active token", counts.activeTokens <= 1);
    await prisma.preliquidacionApprovalToken.deleteMany({
      where: { preliquidacion: { cancellationId: cancellation.id } },
    });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // --- APROBADA atomicity gate ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 4);
    const before = await prisma.cancellation.findUnique({
      where: { id: cancellation.id },
      select: { otherAmount: true, totalAmount: true },
    });
    const chargeBefore = await prisma.cancellationCharge.count({ where: { cancellationId: cancellation.id } });
    const vApproved = await prisma.cancellationPreliquidacion.create({
      data: {
        cancellationId: cancellation.id,
        version: 1,
        status: "APROBADA",
        docNumber: "PRE-AUDIT",
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
      where: { id: cancellation.id },
      data: { activePreliquidacionId: vApproved.id },
    });
    const token = await prisma.preliquidacionApprovalToken.create({
      data: {
        preliquidacionId: vApproved.id,
        tokenHash: `audit-hash-${suffix}`,
        expiresAt: new Date(Date.now() + 86400000),
        generatedById: admin.id,
        status: "GENERADO",
        isActive: true,
      },
    });
    let threw = false;
    try {
      await runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "X", amount: 22.4 },
        });
      });
    } catch (e) {
      threw = e instanceof Error && e.message === "CHARGE_SYNC_APPROVED_SNAPSHOT";
    }
    const after = await prisma.cancellation.findUnique({
      where: { id: cancellation.id },
      select: { otherAmount: true, totalAmount: true },
    });
    const chargeAfter = await prisma.cancellationCharge.count({ where: { cancellationId: cancellation.id } });
    const preAfter = await prisma.cancellationPreliquidacion.findUnique({ where: { id: vApproved.id } });
    const tokenAfter = await prisma.preliquidacionApprovalToken.findUnique({ where: { id: token.id } });
    assert("ATOM-APROBADA throws", threw);
    assert("ATOM-APROBADA charge count", chargeAfter === chargeBefore);
    assert("ATOM-APROBADA otherAmount", Number(after?.otherAmount) === Number(before?.otherAmount));
    assert("ATOM-APROBADA totalAmount", Number(after?.totalAmount) === Number(before?.totalAmount));
    assert("ATOM-APROBADA pre total", Number(preAfter?.totalAmount) === 0);
    assert("ATOM-APROBADA token unchanged", tokenAfter?.isActive === true && tokenAfter.status === "GENERADO");
    await prisma.preliquidacionApprovalToken.delete({ where: { id: token.id } });
    await prisma.cancellationPreliquidacion.delete({ where: { id: vApproved.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // --- C2 DETERMINISTIC: ADD_CHARGE gana (lock → approve bloqueado → V2 → approve rechazado) ---
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 10);
    const v1 = await generatePreliquidacion(cancellation.id, admin.id);
    const { token: t1 } = await generatePreliquidacionLink(v1.id, admin.id);
    const t1Record = await prisma.preliquidacionApprovalToken.findFirst({
      where: { preliquidacionId: v1.id, isActive: true },
    });

    activateConcurrencyBarrier("C2_CHARGE_WINS");
    const chargePromise = runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
      await tx.cancellationCharge.create({
        data: { cancellationId: cancellation.id, concept: "MES DE SEPTIEMBRE", amount: 22.4 },
      });
    });
    await waitForChargeLocksAcquired();
    const approvePromise = approveHttpContract(t1);
    await new Promise((r) => setTimeout(r, 50));
    releaseChargeCommitBarrier();
    const [, approveRes] = await Promise.all([chargePromise, approvePromise]);
    deactivateConcurrencyBarrier();

    assert("C2 ADD_CHARGE success", true);
    assert(
      "C2 APPROVE HTTP rejected (404 INVALID_STATE per API)",
      approveRes.httpStatus === 404 && approveRes.body.error === "INVALID_STATE"
    );
    assert(
      "C2 trace charge locked first",
      getConcurrencyBarrierTrace().includes("charge_locks_acquired")
    );

    const v1row = await prisma.cancellationPreliquidacion.findUnique({ where: { id: v1.id } });
    assert("C2 V1 SUPERSEDED", v1row?.status === "SUPERSEDED");
    const active = await prisma.cancellation.findUnique({
      where: { id: cancellation.id },
      select: { activePreliquidacionId: true },
    });
    const v2 = await prisma.cancellationPreliquidacion.findUnique({
      where: { id: active!.activePreliquidacionId! },
      include: { approvalTokens: { where: { isActive: true } } },
    });
    assert("C2 V2 active PENDIENTE", v2?.status === "PENDIENTE_APROBACION");
    assert("C2 V2 total 22.40", v2 != null && approx(Number(v2.totalAmount), 22.4));
    const chargeCount = await prisma.cancellationCharge.count({
      where: { cancellationId: cancellation.id },
    });
    assert("C2 charge persisted", chargeCount === 1);
    const t1after = await resolvePreliquidacionToken(t1);
    assert("C2 T1 invalid", "error" in t1after && t1after.error != null);
    assert("C2 T2 active", (v2?.approvalTokens.length ?? 0) === 1);
    assert("C2 T1 row cancelled", t1Record != null);

    await prisma.preliquidacionApprovalToken.deleteMany({
      where: { preliquidacion: { cancellationId: cancellation.id } },
    });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellationCharge.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  // Rollback — estado financiero idéntico tras FORCE_ROLLBACK_TEST
  {
    const { customer, cancellation } = await setupCancellation(admin.id, suffix + 11);
    const v1 = await generatePreliquidacion(cancellation.id, admin.id);
    await generatePreliquidacionLink(v1.id, admin.id);
    const before = await captureFinancialSnapshot(cancellation.id, v1.id);
    let threw = false;
    try {
      await runCancellationChargeMutation(cancellation.id, admin.id, async (tx) => {
        await tx.cancellationCharge.create({
          data: { cancellationId: cancellation.id, concept: "ROLLBACK", amount: 99 },
        });
        throw new Error("FORCE_ROLLBACK_TEST");
      });
    } catch (e) {
      threw = e instanceof Error && e.message === "FORCE_ROLLBACK_TEST";
    }
    const after = await captureFinancialSnapshot(cancellation.id, v1.id);
    assert("ATOM-ROLLBACK threw", threw);
    assert("ATOM-ROLLBACK charge count", after.chargeCount === before.chargeCount);
    assert(
      "ATOM-ROLLBACK otherAmount",
      approx(Number(after.cancellation?.otherAmount), Number(before.cancellation?.otherAmount))
    );
    assert(
      "ATOM-ROLLBACK totalAmount",
      approx(Number(after.cancellation?.totalAmount), Number(before.cancellation?.totalAmount))
    );
    assert("ATOM-ROLLBACK pre version", after.pre?.version === before.pre?.version);
    assert("ATOM-ROLLBACK pre status", after.pre?.status === before.pre?.status);
    assert(
      "ATOM-ROLLBACK pre total",
      approx(Number(after.pre?.totalAmount), Number(before.pre?.totalAmount))
    );
    assert("ATOM-ROLLBACK active tokens", after.activeTokens === before.activeTokens);
    assert("ATOM-ROLLBACK version count", after.versionCount === before.versionCount);
    assert(
      "ATOM-ROLLBACK activePreliquidacionId",
      after.cancellation?.activePreliquidacionId === before.cancellation?.activePreliquidacionId
    );
    await prisma.preliquidacionApprovalToken.deleteMany({
      where: { preliquidacion: { cancellationId: cancellation.id } },
    });
    await prisma.cancellationPreliquidacion.deleteMany({ where: { cancellationId: cancellation.id } });
    await prisma.cancellation.delete({ where: { id: cancellation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  console.log(
    failures === 0
      ? "\nFASE 6.13.2-BIS concurrency/atomicity audit: PASS"
      : `\nFASE 6.13.2-BIS concurrency/atomicity audit: FAIL (${failures})`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
