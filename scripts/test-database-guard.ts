/**
 * Tests estáticos de protección TEST vs producción (sin BD).
 */
import {
  TEST_DATABASE_GUARD_MESSAGE,
  assertTestDatabaseAllowed,
  parseDatabaseTarget,
} from "../src/lib/test-database-guard";

function assert(name: string, ok: boolean) {
  if (!ok) {
    console.error(`✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function expectRefused(url: string) {
  try {
    assertTestDatabaseAllowed(url);
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(TEST_DATABASE_GUARD_MESSAGE);
  }
}

const localTest = parseDatabaseTarget(
  "postgresql://postgres:secret@localhost:5432/infinity_bajas_test"
);
assert("parse host", localTest.host === "localhost");
assert("parse port", localTest.port === "5432");
assert("parse database", localTest.database === "infinity_bajas_test");
assert("parse user", localTest.user === "postgres");
assert("parse no expone password en meta", !JSON.stringify(localTest).includes("secret"));

assert("permite localhost + _test", (() => {
  try {
    assertTestDatabaseAllowed("postgresql://postgres:x@127.0.0.1:5432/infinity_bajas_test");
    return true;
  } catch {
    return false;
  }
})());

assert("bloquea Render", expectRefused("postgresql://u:p@dpg-abc.oregon-postgres.render.com/infinity_bajas"));
assert(
  "bloquea infinity_hoteles local",
  expectRefused("postgresql://infinity:x@localhost:5432/infinity_hoteles")
);
assert(
  "bloquea localhost sin test en nombre",
  expectRefused("postgresql://postgres:x@localhost:5432/infinity_bajas")
);
assert(
  "bloquea host externo",
  expectRefused("postgresql://u:p@db.example.com:5432/infinity_bajas_test")
);

console.log("\nTest database guard OK");
