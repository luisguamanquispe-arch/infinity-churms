/**
 * Tests AUD-017 business dates (Ecuador, sin desplazamiento UTC).
 */
import {
  parseBusinessDateOnly,
  formatBusinessDateOnly,
  endOfBusinessDateOnly,
  formatBusinessDateFromApi,
  businessDateToday,
  BusinessDateError,
} from "@/lib/business-date";
import { differenceInMonths } from "date-fns";

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

assert("parse 2024-01-15 mantiene día", formatBusinessDateOnly(parseBusinessDateOnly("2024-01-15")) === "2024-01-15");
assert(
  "toISOString no cambia día de negocio",
  parseBusinessDateOnly("2024-03-31").toISOString().startsWith("2024-03-31")
);
assert(
  "fin de mes marzo",
  formatBusinessDateOnly(parseBusinessDateOnly("2024-03-31")) === "2024-03-31"
);
assert(
  "año bisiesto 29 feb",
  formatBusinessDateOnly(parseBusinessDateOnly("2024-02-29")) === "2024-02-29"
);
assert(
  "differenceInMonths consistente",
  differenceInMonths(parseBusinessDateOnly("2024-03-01"), parseBusinessDateOnly("2024-01-15")) === 1
);

try {
  parseBusinessDateOnly("2024-02-30");
  assert("rechaza fecha inválida", false);
} catch (e) {
  assert("rechaza fecha inválida", e instanceof BusinessDateError);
}

const end = endOfBusinessDateOnly("2024-06-30");
assert("rango fin de mes", end.getTime() > parseBusinessDateOnly("2024-06-30").getTime());

for (const d of ["2026-01-01", "2026-01-31", "2026-02-28", "2026-12-31"]) {
  assert(`cliente fecha ${d} sin drift`, formatBusinessDateOnly(parseBusinessDateOnly(d)) === d);
}

assert(
  "formatBusinessDateFromApi ISO",
  formatBusinessDateFromApi("2026-01-15T00:00:00.000Z") === "2026-01-15"
);
assert(
  "businessDateToday formato",
  /^\d{4}-\d{2}-\d{2}$/.test(formatBusinessDateOnly(businessDateToday()))
);

console.log("\nBusiness date tests OK");
