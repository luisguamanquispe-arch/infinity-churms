/**
 * Ensures infinity_bajas_test exists and verifies connection.
 */
import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed, formatDatabaseTargetSafe } from "../src/lib/test-database-guard";

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  throw new Error("DATABASE_URL requerida — configure .env local");
}

const target = assertTestDatabaseAllowed(dbUrl);
const resolvedDbUrl = dbUrl;
const database = target.database;

function adminUrl() {
  return resolvedDbUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
}

async function main() {
  console.log(
    JSON.stringify({
      target: formatDatabaseTargetSafe(resolvedDbUrl),
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
    })
  );

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl() } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    console.log(JSON.stringify({ created: true, database }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      console.log(JSON.stringify({ created: false, database, note: "already_exists" }));
    } else {
      throw e;
    }
  } finally {
    await admin.$disconnect();
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(JSON.stringify({ connected: true }));
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(JSON.stringify({ connected: false, error: msg }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
