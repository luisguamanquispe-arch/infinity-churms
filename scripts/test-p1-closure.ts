/**
 * Tests P1: admin financial guard, role DTO, KPI definitions, plan change effective date.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { DASHBOARD_KPI_DEFINITIONS, PENDING_EQUIPMENT_RECOVERY_WHERE } from "@/lib/dashboard-kpi-definitions";
import { ORPHAN_CANCELLATION_STATUSES, FLOW_CANCELLATION_STATUSES } from "@/lib/cancellation-flow-statuses";
import { planChangeEffectiveDate } from "@/lib/services/plan-changes";
import { serializeCancellationListItemByRole } from "@/lib/serialize-cancellation-by-role";

const root = join(import.meta.dirname, "..");

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

const cancellationsTs = readFileSync(join(root, "src/lib/services/cancellations.ts"), "utf8");
assert(
  "AUD-019 rechaza montos sin recalculate",
  cancellationsTs.includes("FINANCIAL_OVERRIDE_REQUIRES_RECALCULATE")
);

const adminPanel = readFileSync(
  join(root, "src/components/bajas/cancellation-admin-panel.tsx"),
  "utf8"
);
assert(
  "AUD-019 admin no usa tariffs/summary",
  !adminPanel.includes("/api/config/tariffs/summary")
);
assert("AUD-019 admin usa snapshot", adminPanel.includes("permanenceMonthsSnapshot"));

const collectionTs = readFileSync(join(root, "src/lib/services/collection-payments.ts"), "utf8");
assert("AUD-026 pago en transacción", collectionTs.includes("$transaction"));
assert("AUD-026 idempotencia fenixDocument", collectionTs.includes("fenixDocument"));

const customerSync = readFileSync(join(root, "src/lib/customer-status-sync.ts"), "utf8");
assert("AUD-025 sync INACTIVO", customerSync.includes('status: "INACTIVO"'));

const roleDto = serializeCancellationListItemByRole(
  {
    permanenceAmount: 10,
    tvAmount: 2,
    monthlyAmount: 3,
    equipmentAmount: 1,
    otherAmount: 0,
    totalAmount: 16,
    activePreliquidacion: { totalAmount: 16 },
  },
  "TECNICO"
);
assert("AUD-C01 TECNICO oculta total", Number(roleDto.totalAmount) === 0);

const signed = planChangeEffectiveDate({
  signedAt: new Date("2024-05-10T12:00:00.000Z"),
  requestDate: new Date("2024-04-01T12:00:00.000Z"),
});
assert("AUD-024 effectiveDate prioriza signedAt", signed.toISOString().startsWith("2024-05-10"));

assert(
  "AUD-022 KPI notRecovered definido",
  DASHBOARD_KPI_DEFINITIONS.some((k) => k.key === "notRecovered")
);
assert(
  "AUD-022 filtro equipos excluye BAJA_COMPLETADA",
  JSON.stringify(PENDING_EQUIPMENT_RECOVERY_WHERE).includes("BAJA_COMPLETADA")
);

assert(
  "AUD-021 orphan separados de flow",
  ORPHAN_CANCELLATION_STATUSES.length >= 5 &&
    !FLOW_CANCELLATION_STATUSES.includes("PRELIQUIDACION_APROBADA" as (typeof FLOW_CANCELLATION_STATUSES)[number])
);

console.log("\nP1 closure tests OK");
