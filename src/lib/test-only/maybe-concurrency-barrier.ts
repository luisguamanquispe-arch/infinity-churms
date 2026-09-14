/**
 * TEST-ONLY entry — no-op en producción normal.
 */

export async function maybeConcurrencyBarrier(
  point: "approve_locked" | "charge_before_lock" | "charge_locked"
): Promise<void> {
  if (process.env.TEST_CONCURRENCY_TX_BARRIER !== "1") return;
  const mod = await import("@/lib/test-only/concurrency-transaction-barrier");
  if (point === "approve_locked") await mod.onApproveLocksAcquired();
  if (point === "charge_before_lock") await mod.beforeChargeLockAttempt();
  if (point === "charge_locked") await mod.afterChargeLocksAcquired();
}
