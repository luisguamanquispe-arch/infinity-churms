import type { PreliquidacionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { nextPreliquidacionNumber } from "@/lib/acta-number";
import { recalculateCancellationInTx } from "@/lib/services/cancellations";
import {
  buildPreliquidacionLines,
  summarizeLiquidationLines,
} from "@/lib/services/baja-liquidation";
import type { PreliquidacionLineInput } from "@/lib/services/preliquidaciones";
import { generatePreliquidacionLinkInTx } from "@/lib/services/preliquidacion-remote-approval";

const SYNC_IN_PLACE_STATUSES: PreliquidacionStatus[] = ["GENERADA", "RECHAZADA"];
const NEW_VERSION_STATUSES: PreliquidacionStatus[] = ["ENVIADA", "PENDIENTE_APROBACION"];

export type PreliquidacionSyncMode = "none" | "in_place" | "new_version";

export interface PreliquidacionSyncResult {
  mode: PreliquidacionSyncMode;
  fromVersion?: number;
  toVersion?: number;
  preliquidacionId?: string;
  previousPreliquidacionId?: string;
  tokensInvalidated?: number;
  linkRegenerated?: boolean;
}

export type ChargeMutateFn = (tx: Prisma.TransactionClient) => Promise<void>;

function summarizeLines(lines: PreliquidacionLineInput[]) {
  const summary = summarizeLiquidationLines(lines);
  return {
    permanenceAmount: summary.permanenceAmount,
    tvAmount: summary.tvAmount,
    monthlyAmount: summary.monthlyAmount,
    equipmentAmount: summary.equipmentAmount,
    otherAmount: summary.otherAmount,
    creditsAmount: summary.creditsAmount,
    subtotal: summary.subtotal,
    totalAmount: summary.total,
  };
}

/** Bloquea Cancellation y preliquidación activa (orden fijo: Cancellation → Preliquidacion). */
export async function lockContractualCancellationState(
  tx: Prisma.TransactionClient,
  cancellationId: string
): Promise<{ activePreliquidacionId: string | null }> {
  const rows = await tx.$queryRaw<{ id: string; activePreliquidacionId: string | null }[]>`
    SELECT id, "activePreliquidacionId" FROM "Cancellation" WHERE id = ${cancellationId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error("NOT_FOUND");
  if (row.activePreliquidacionId) {
    await tx.$queryRaw`
      SELECT id FROM "CancellationPreliquidacion" WHERE id = ${row.activePreliquidacionId} FOR UPDATE
    `;
  }
  return { activePreliquidacionId: row.activePreliquidacionId };
}

async function getActivePreliquidacionForSyncTx(
  tx: Prisma.TransactionClient,
  cancellationId: string,
  activePreliquidacionId: string | null
) {
  if (activePreliquidacionId) {
    return tx.cancellationPreliquidacion.findUnique({
      where: { id: activePreliquidacionId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  }
  return tx.cancellationPreliquidacion.findFirst({
    where: { cancellationId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

function assertPreliquidacionChargeAllowed(
  active: { status: PreliquidacionStatus } | null
) {
  if (active?.status === "APROBADA") {
    throw new Error("CHARGE_SYNC_APPROVED_SNAPSHOT");
  }
}

export async function assertCancellationChargeMutationAllowed(cancellationId: string) {
  const active = await prisma.cancellation.findUnique({
    where: { id: cancellationId },
    include: { activePreliquidacion: true },
  });
  if (active?.activePreliquidacion?.status === "APROBADA") {
    throw new Error("CHARGE_SYNC_APPROVED_SNAPSHOT");
  }
  const fallback = await prisma.cancellationPreliquidacion.findFirst({
    where: { cancellationId, status: { not: "SUPERSEDED" } },
    orderBy: { version: "desc" },
  });
  assertPreliquidacionChargeAllowed(fallback);
}

async function cancelActiveTokens(
  tx: Prisma.TransactionClient,
  preliquidacionId: string
): Promise<number> {
  const result = await tx.preliquidacionApprovalToken.updateMany({
    where: {
      preliquidacionId,
      isActive: true,
      status: { in: ["GENERADO", "ENVIADO", "ABIERTO"] },
    },
    data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
  });
  return result.count;
}

async function applySummaryToCancellation(
  tx: Prisma.TransactionClient,
  cancellationId: string,
  summary: ReturnType<typeof summarizeLines>,
  cancellationStatus?: string
) {
  await tx.cancellation.update({
    where: { id: cancellationId },
    data: {
      totalAmount: summary.totalAmount,
      permanenceAmount: summary.permanenceAmount,
      tvAmount: summary.tvAmount,
      monthlyAmount: summary.monthlyAmount,
      equipmentAmount: summary.equipmentAmount,
      otherAmount: summary.otherAmount,
      ...(cancellationStatus ? { status: cancellationStatus as never } : {}),
    },
  });
}

async function refreshSnapshotInPlaceTx(
  tx: Prisma.TransactionClient,
  cancellationId: string,
  preliquidacionId: string,
  preliquidacionStatus: PreliquidacionStatus,
  lines: PreliquidacionLineInput[],
  summary: ReturnType<typeof summarizeLines>
) {
  await tx.preliquidacionLineItem.deleteMany({ where: { preliquidacionId } });
  if (lines.length > 0) {
    await tx.preliquidacionLineItem.createMany({
      data: lines.map((l) => ({
        preliquidacionId,
        category: l.category,
        concept: l.concept,
        amount: l.amount,
        sortOrder: l.sortOrder,
        metadata: l.metadata ?? null,
      })),
    });
  }
  await tx.cancellationPreliquidacion.update({
    where: { id: preliquidacionId },
    data: { ...summary, status: preliquidacionStatus },
  });
  const cancellationStatus =
    preliquidacionStatus === "RECHAZADA" ? "PRELIQUIDACION_RECHAZADA" : "PRELIQUIDACION_GENERADA";
  await applySummaryToCancellation(tx, cancellationId, summary, cancellationStatus);
}

async function supersedeAndCreateVersionTx(
  tx: Prisma.TransactionClient,
  cancellationId: string,
  userId: string,
  previous: { id: string; version: number; status: PreliquidacionStatus },
  lines: PreliquidacionLineInput[],
  summary: ReturnType<typeof summarizeLines>,
  docNumber: string
) {
  await tx.cancellationPreliquidacion.update({
    where: { id: previous.id },
    data: { status: "SUPERSEDED" },
  });
  const tokensInvalidated = await cancelActiveTokens(tx, previous.id);
  const newVersion = previous.version + 1;

  const created = await tx.cancellationPreliquidacion.create({
    data: {
      cancellationId,
      version: newVersion,
      status: "GENERADA",
      docNumber,
      ...summary,
      createdById: userId,
      lineItems: {
        create: lines.map((l) => ({
          category: l.category,
          concept: l.concept,
          amount: l.amount,
          sortOrder: l.sortOrder,
          metadata: l.metadata ?? null,
        })),
      },
    },
  });

  await tx.cancellation.update({
    where: { id: cancellationId },
    data: {
      activePreliquidacionId: created.id,
      status: "PRELIQUIDACION_GENERADA",
      totalAmount: summary.totalAmount,
      permanenceAmount: summary.permanenceAmount,
      tvAmount: summary.tvAmount,
      monthlyAmount: summary.monthlyAmount,
      equipmentAmount: summary.equipmentAmount,
      otherAmount: summary.otherAmount,
    },
  });

  let linkRegenerated = false;
  if (NEW_VERSION_STATUSES.includes(previous.status)) {
    await generatePreliquidacionLinkInTx(tx, created.id, userId, cancellationId);
    linkRegenerated = true;
  }

  return {
    createdId: created.id,
    newVersion,
    tokensInvalidated,
    linkRegenerated,
  };
}

async function syncPreliquidacionAfterChargeChangeInTx(
  tx: Prisma.TransactionClient,
  cancellationId: string,
  userId: string,
  lockedActiveId: string | null
): Promise<PreliquidacionSyncResult> {
  const active = await getActivePreliquidacionForSyncTx(tx, cancellationId, lockedActiveId);
  if (!active) {
    return { mode: "none" };
  }
  assertPreliquidacionChargeAllowed(active);
  if (active.status === "SUPERSEDED") {
    return { mode: "none" };
  }

  const lines = await buildPreliquidacionLines(cancellationId, { db: tx });
  const summary = summarizeLines(lines);

  if (SYNC_IN_PLACE_STATUSES.includes(active.status)) {
    await refreshSnapshotInPlaceTx(
      tx,
      cancellationId,
      active.id,
      active.status,
      lines,
      summary
    );
    return {
      mode: "in_place",
      fromVersion: active.version,
      toVersion: active.version,
      preliquidacionId: active.id,
    };
  }

  if (NEW_VERSION_STATUSES.includes(active.status)) {
    const docNumber = await nextPreliquidacionNumber();
    const { createdId, newVersion, tokensInvalidated, linkRegenerated } =
      await supersedeAndCreateVersionTx(
        tx,
        cancellationId,
        userId,
        { id: active.id, version: active.version, status: active.status },
        lines,
        summary,
        docNumber
      );
    return {
      mode: "new_version",
      fromVersion: active.version,
      toVersion: newVersion,
      preliquidacionId: createdId,
      previousPreliquidacionId: active.id,
      tokensInvalidated,
      linkRegenerated,
    };
  }

  return { mode: "none" };
}

/**
 * Mutación atómica: cargo + recálculo + snapshot (+ token en la misma transacción DB).
 */
export async function runCancellationChargeMutation(
  cancellationId: string,
  userId: string,
  mutate: ChargeMutateFn
): Promise<PreliquidacionSyncResult | null> {
  const syncResult = await prisma.$transaction(
    async (tx) => {
      const { maybeConcurrencyBarrier } = await import("@/lib/test-only/maybe-concurrency-barrier");
      await maybeConcurrencyBarrier("charge_before_lock");
      const { activePreliquidacionId } = await lockContractualCancellationState(tx, cancellationId);
      await maybeConcurrencyBarrier("charge_locked");
      const active = await getActivePreliquidacionForSyncTx(
        tx,
        cancellationId,
        activePreliquidacionId
      );
      assertPreliquidacionChargeAllowed(active);

      await mutate(tx);
      await recalculateCancellationInTx(tx, cancellationId);

      return syncPreliquidacionAfterChargeChangeInTx(
        tx,
        cancellationId,
        userId,
        activePreliquidacionId
      );
    },
    { timeout: 60_000 }
  );

  if (syncResult.mode === "in_place") {
    await audit({
      userId,
      action: "PRELIQUIDACION_SYNCED",
      entity: "CancellationPreliquidacion",
      entityId: syncResult.preliquidacionId,
      detail: `in_place V${syncResult.toVersion} total synced`,
    });
  } else if (syncResult.mode === "new_version") {
    await audit({
      userId,
      action: "PRELIQUIDACION_SUPERSEDED_CHARGE_SYNC",
      entity: "CancellationPreliquidacion",
      entityId: syncResult.preliquidacionId,
      detail: `V${syncResult.fromVersion}→V${syncResult.toVersion}`,
    });
    if ((syncResult.tokensInvalidated ?? 0) > 0) {
      await audit({
        userId,
        action: "PRELIQUIDACION_TOKEN_CANCELLED",
        entity: "CancellationPreliquidacion",
        entityId: syncResult.previousPreliquidacionId,
        detail: `count=${syncResult.tokensInvalidated}`,
      });
    }
  }

  return syncResult.mode === "none" ? null : syncResult;
}

/**
 * Tras cambios en cobranza del cliente (CollectionCharge / pagos), recalcula bajas abiertas
 * y sincroniza snapshots de preliquidación activos (misma atomicidad que mutación de cargos).
 */
export async function syncPreliquidacionesAfterCustomerCollectionChange(
  customerId: string,
  actorUserId: string
) {
  const { recalculateCancellation } = await import("@/lib/services/cancellations");
  const cancellations = await prisma.cancellation.findMany({
    where: {
      customerId,
      status: { not: "BAJA_COMPLETADA" },
    },
    select: { id: true, activePreliquidacionId: true },
  });

  for (const row of cancellations) {
    await recalculateCancellation(row.id);
    try {
      await runCancellationChargeMutation(row.id, actorUserId, async () => {});
    } catch (e) {
      if (e instanceof Error && e.message === "CHARGE_SYNC_APPROVED_SNAPSHOT") continue;
      throw e;
    }
  }
}
