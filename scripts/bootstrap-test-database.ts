/**
 * Bootstrap schema en PostgreSQL TEST vacía (sin prisma db push).
 * Genera SQL desde schema.prisma y ejecuta migrate-deploy.
 *
 * Requiere DATABASE_URL localhost + JWT_SECRET + SEED_DEFAULT_PASSWORD para seed.
 */
import "./load-test-env";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { databaseHostLabel } from "../src/lib/database-url";
import { assertTestDatabaseAllowed } from "../src/lib/test-database-guard";

const root = join(import.meta.dirname, "..");
const bootstrapSql = join(root, "prisma", "bootstrap-test.generated.sql");

function assertLocalTestUrl(url: string) {
  assertTestDatabaseAllowed(url);
  const host = databaseHostLabel(url).toLowerCase();
  if (host.includes("render.com")) {
    throw new Error("BLOCKED: URL de producción");
  }
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL requerida");
  assertLocalTestUrl(url);

  console.log(`Bootstrap TEST en ${databaseHostLabel(url)}`);

  console.log("Generando SQL desde schema.prisma...");
  const sql = execSync(
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    { cwd: root, encoding: "utf8" }
  );
  writeFileSync(bootstrapSql, sql, "utf8");
  console.log(`SQL generado: prisma/bootstrap-test.generated.sql (${sql.length} bytes)`);

  console.log("Ejecutando bootstrap SQL...");
  execSync(`npx prisma db execute --file prisma/bootstrap-test.generated.sql --schema prisma/schema.prisma`, {
    cwd: root,
    stdio: "inherit",
  });

  console.log("Ejecutando migrate-deploy...");
  execSync("npm run db:migrate", { cwd: root, stdio: "inherit" });

  if (process.env.SEED_DEFAULT_PASSWORD?.trim()) {
    console.log("Ejecutando seed...");
    execSync("npm run db:seed", { cwd: root, stdio: "inherit" });
  } else {
    console.log("SKIP seed: SEED_DEFAULT_PASSWORD no definida");
  }

  const prisma = new PrismaClient();
  await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
  await prisma.$disconnect();
  console.log("Bootstrap TEST OK");
}

main().catch((e) => {
  console.error("Bootstrap failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
