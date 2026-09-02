/**
 * Verificación estática/lógica de correcciones AUD-007–015 (sin BD).
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

/** Réplica de la lógica de equipmentAmount en recalculateCancellation */
function mergeEquipmentTotal(
  equipment: { chargeAmount?: unknown }[],
  storedEquipmentAmount: number,
  liq: { permanenceAmount: number; tvAmount: number; monthlyAmount: number; otherAmount: number }
) {
  const equipmentFromItems = equipment.reduce((sum, e) => sum + Number(e.chargeAmount ?? 0), 0);
  const equipmentAmount =
    equipmentFromItems > 0 ? equipmentFromItems : storedEquipmentAmount;
  const totalAmount =
    Math.round(
      (liq.permanenceAmount + liq.tvAmount + liq.monthlyAmount + liq.otherAmount + equipmentAmount) *
        100
    ) / 100;
  return { equipmentAmount, totalAmount };
}

// AUD-007: equipment route passes cancellationId
const equipmentRoute = read("src/app/api/cancellations/[id]/equipment/route.ts");
assert(
  "AUD-007 PATCH equipment pasa cancellationId al servicio",
  equipmentRoute.includes("}, cancellationId)") &&
    equipmentRoute.includes('const { id: cancellationId } = await ctx.params')
);
assert(
  "AUD-007 servicio valida WRONG_CANCELLATION",
  read("src/lib/services/cancellations.ts").includes('throw new Error("WRONG_CANCELLATION")')
);

// AUD-008: save_signature permission
const cancelRoute = read("src/app/api/cancellations/[id]/route.ts");
assert(
  "AUD-008 save_signature exige cancellations:acta_send",
  cancelRoute.includes('requirePermission("cancellations:acta_send")')
);

// AUD-009: recalculate preserves equipment
const merged = mergeEquipmentTotal(
  [{ chargeAmount: 50 }, { chargeAmount: 30 }],
  0,
  { permanenceAmount: 44.44, tvAmount: 0, monthlyAmount: 10, otherAmount: 0 }
);
assert("AUD-009 equipmentAmount suma cargos de equipos", merged.equipmentAmount === 80);
assert("AUD-009 total incluye equipos", merged.totalAmount === 134.44);
const fallback = mergeEquipmentTotal([], 25, {
  permanenceAmount: 10,
  tvAmount: 0,
  monthlyAmount: 0,
  otherAmount: 0,
});
assert("AUD-009 conserva equipmentAmount almacenado si no hay cargos", fallback.equipmentAmount === 25);

// AUD-010: idempotency in computeFinalLiquidation
const preliqService = read("src/lib/services/preliquidaciones.ts");
assert(
  "AUD-010 computeFinalLiquidation retorna existingFinal",
  preliqService.includes("existingFinal") && preliqService.includes("duplicate")
);

// AUD-011: optimistic lock advance_status
assert(
  "AUD-011 advance_status usa updateMany con status actual",
  cancelRoute.includes("updateMany") && cancelRoute.includes("status: current.status")
);

// AUD-012: payment transaction
const paymentRoute = read("src/app/api/cancellations/[id]/payment/route.ts");
assert(
  "AUD-012 pago en transacción con updateMany",
  paymentRoute.includes("$transaction") && paymentRoute.includes("INVALID_STATUS")
);

// AUD-013: snapshot resilient
const resolver = read("src/lib/permanence-config-resolver.ts");
assert(
  "AUD-013 snapshot con try/catch si live config inválido",
  resolver.includes("try {") && resolver.includes('source: "TARIFF_DEFAULT"')
);

// AUD-014: PDF/audit permissions
const preliqRoute = read("src/app/api/cancellations/[id]/preliquidacion/route.ts");
const preliqGet = preliqRoute.match(/export async function GET[\s\S]*?^}/m)?.[0] ?? "";
assert(
  "AUD-014 GET preliquidación exige preliquidate_view (JSON y PDF)",
  preliqGet.includes('"cancellations:preliquidate_view"') &&
    preliqGet.indexOf('"cancellations:preliquidate_view"') < preliqGet.indexOf("listPreliquidaciones")
);
assert(
  "AUD-014 acta PDF exige acta_send",
  read("src/app/api/cancellations/[id]/acta/route.ts").includes('"cancellations:acta_send"')
);
assert(
  "AUD-014 audit exige preliquidate_view o close",
  read("src/app/api/cancellations/[id]/audit/route.ts").includes(
    '"cancellations:preliquidate_view"'
  )
);

// AUD-015: closed equipment guard
assert(
  "AUD-015 updateEquipmentItem bloquea baja cerrada",
  read("src/lib/services/cancellations.ts").includes('throw new Error("CLOSED")')
);

// Cliente no puede imponer total en token approve
const tokenRoute = read("src/app/api/baja/preliquidacion/[token]/route.ts");
assert(
  "Preliquidación token no lee total del body",
  !tokenRoute.includes("body.totalAmount") && tokenRoute.includes("Number(preliq.totalAmount)")
);

console.log("\nVerificación AUD-007–015 completada.");
