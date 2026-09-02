/**
 * AUD-027 — tests estáticos de serial de equipo (sin PostgreSQL).
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  assertNoDuplicateSerialsInPayload,
  EquipmentSerialConflictError,
  isEquipmentSerialConflict,
  isPrismaUniqueViolation,
  normalizeEquipmentSerial,
} from "../src/lib/equipment-serial";

const root = join(import.meta.dirname, "..");

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

assert("serial válido normaliza a mayúsculas", normalizeEquipmentSerial("abc123") === "ABC123");
assert("serial con espacios se recorta", normalizeEquipmentSerial("  abc123  ") === "ABC123");
assert("abc123 y ABC123 equivalentes", normalizeEquipmentSerial("abc123") === normalizeEquipmentSerial("ABC123"));
assert("serial NULL → null", normalizeEquipmentSerial(null) === null);
assert("serial vacío → null", normalizeEquipmentSerial("") === null);
assert("serial solo espacios → null", normalizeEquipmentSerial("   ") === null);

try {
  assertNoDuplicateSerialsInPayload(["ABC123", "abc123"]);
  assert("payload duplicado rechazado", false);
} catch (e) {
  assert("payload duplicado rechazado", e instanceof EquipmentSerialConflictError);
}

assertNoDuplicateSerialsInPayload(["ABC123", "XYZ999", null, ""]);
assert("payload serial distinto OK", true);

assert(
  "P2002 serial mapeado a conflicto",
  isEquipmentSerialConflict({ code: "P2002", meta: { target: ["serial"] } })
);
assert(
  "P2002 otro campo no es conflicto serial",
  !isPrismaUniqueViolation({ code: "P2002", meta: { target: ["contract"] } }, "serial")
);

const customerUpdate = readFileSync(join(root, "src/lib/services/customer-update.ts"), "utf8");
assert("syncCustomerEquipment valida unicidad", customerUpdate.includes("assertUniqueEquipmentSerial"));
assert("syncCustomerEquipment detecta duplicados en payload", customerUpdate.includes("assertNoDuplicateSerialsInPayload"));

const cancellations = readFileSync(join(root, "src/lib/services/cancellations.ts"), "utf8");
assert("addCancellationEquipment normaliza serial", cancellations.includes("normalizeEquipmentSerial(data.serial)"));
assert("addCancellationEquipment valida unicidad", cancellations.includes("assertUniqueEquipmentSerial(serial)"));

const customersRoute = readFileSync(join(root, "src/app/api/customers/route.ts"), "utf8");
assert("POST cliente valida serial único", customersRoute.includes("assertUniqueEquipmentSerial"));

const pendingSql = readFileSync(
  join(root, "prisma/pending-migrations/AUD-027-equipment-serial-unique.sql"),
  "utf8"
);
assert("migración pendiente con índice parcial", pendingSql.includes("CustomerEquipment_serial_unique"));
assert("migración bloquea si hay duplicados", pendingSql.includes("existen seriales duplicados"));

console.log("\nAUD-027 equipment serial tests OK");
