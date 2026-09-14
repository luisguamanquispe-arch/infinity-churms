/**
 * TEST-ONLY — barreras deterministas para auditoría approve ↔ charge.
 * Inactivo salvo `process.env.TEST_CONCURRENCY_TX_BARRIER === "1"` (lo activa el script de audit).
 */

export type ConcurrencyBarrierScenario = "C1_APPROVE_WINS" | "C2_CHARGE_WINS";

export type ConcurrencyBarrierTraceEvent =
  | "approve_locks_acquired"
  | "charge_lock_attempt"
  | "charge_locks_acquired";

let activeScenario: ConcurrencyBarrierScenario | null = null;
const trace: ConcurrencyBarrierTraceEvent[] = [];

let approveLockedPromise: Promise<void>;
let approveLockedResolve: (() => void) | null = null;

let chargeMayAttemptPromise: Promise<void>;
let chargeMayAttemptResolve: (() => void) | null = null;

let releaseApprovePromise: Promise<void>;
let releaseApproveResolve: (() => void) | null = null;

let releaseChargePromise: Promise<void>;
let releaseChargeResolve: (() => void) | null = null;

function resetBarrierPromises() {
  approveLockedPromise = new Promise((resolve) => {
    approveLockedResolve = resolve;
  });
  chargeMayAttemptPromise = new Promise((resolve) => {
    chargeMayAttemptResolve = resolve;
  });
  releaseApprovePromise = new Promise((resolve) => {
    releaseApproveResolve = resolve;
  });
  releaseChargePromise = new Promise((resolve) => {
    releaseChargeResolve = resolve;
  });
}

resetBarrierPromises();

export function activateConcurrencyBarrier(scenario: ConcurrencyBarrierScenario) {
  activeScenario = scenario;
  trace.length = 0;
  resetBarrierPromises();
  process.env.TEST_CONCURRENCY_TX_BARRIER = "1";
}

export function deactivateConcurrencyBarrier() {
  activeScenario = null;
  delete process.env.TEST_CONCURRENCY_TX_BARRIER;
}

export function getConcurrencyBarrierTrace(): readonly ConcurrencyBarrierTraceEvent[] {
  return trace;
}

export function releaseApproveCommitBarrier() {
  releaseApproveResolve?.();
}

export function releaseChargeCommitBarrier() {
  releaseChargeResolve?.();
}

export function waitForApproveLocksAcquired(): Promise<void> {
  return approveLockedPromise;
}

export async function waitForChargeLockAttempt(timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!trace.includes("charge_lock_attempt")) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("TIMEOUT waiting charge_lock_attempt");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

export async function waitForChargeLocksAcquired(timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!trace.includes("charge_locks_acquired")) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("TIMEOUT waiting charge_locks_acquired");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Tras FOR UPDATE en approve (Cancellation → Preliquidacion). */
export async function onApproveLocksAcquired(): Promise<void> {
  if (!activeScenario) return;
  if (activeScenario === "C1_APPROVE_WINS") {
    trace.push("approve_locks_acquired");
    approveLockedResolve?.();
    chargeMayAttemptResolve?.();
    await releaseApprovePromise;
  }
}

/** Antes de intentar lock en add_charge (misma orden Cancellation → Preliquidacion). */
export async function beforeChargeLockAttempt(): Promise<void> {
  if (!activeScenario) return;
  if (activeScenario === "C1_APPROVE_WINS") {
    await approveLockedPromise;
    await chargeMayAttemptPromise;
    trace.push("charge_lock_attempt");
  }
}

/** Tras adquirir locks en add_charge; mantiene la transacción abierta en C2. */
export async function afterChargeLocksAcquired(): Promise<void> {
  if (!activeScenario) return;
  if (activeScenario === "C2_CHARGE_WINS") {
    trace.push("charge_locks_acquired");
    await releaseChargePromise;
  }
}
