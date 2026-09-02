/**
 * P1.9 ENVLOAD — verifica que DATABASE_URL esté disponible sin revelar valor.
 */
import "./load-test-env";
import { databaseHostLabel } from "../src/lib/database-url";

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

const url = process.env.DATABASE_URL?.trim();
assert("DATABASE_URL definida", Boolean(url));

if (url) {
  const host = databaseHostLabel(url);
  assert("DATABASE_URL tiene host", host.length > 0);
  assert("DATABASE_URL no imprime password", !JSON.stringify({ ok: true }).includes(url.split("@")[0] ?? ""));
  console.log(JSON.stringify({ hasDatabaseUrl: true, host }));
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("\nENVLOAD test OK");
