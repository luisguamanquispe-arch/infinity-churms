/**
 * Updates DATABASE_URL password in .env without printing secrets.
 * Usage: npx tsx scripts/set-env-database-password.ts <newPassword>
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  console.error("NO_ENV");
  process.exit(1);
}

const newPassword = process.argv[2];
if (!newPassword) {
  console.error("MISSING_PASSWORD_ARG");
  process.exit(1);
}

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
let updated = false;
const out = lines.map((line) => {
  if (!line.startsWith("DATABASE_URL=")) return line;
  const raw = line.slice("DATABASE_URL=".length).trim();
  let val = raw;
  const quoted =
    (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
  if (quoted) val = val.slice(1, -1);
  const u = new URL(val.replace(/^postgresql:/, "https:"));
  u.password = encodeURIComponent(newPassword);
  const rebuilt = `postgresql://${u.username}:${u.password}@${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}${u.search}`;
  updated = true;
  return `DATABASE_URL="${rebuilt}"`;
});

if (!updated) {
  console.error("NO_DATABASE_URL_LINE");
  process.exit(1);
}

writeFileSync(envPath, out.join("\n") + (out[out.length - 1]?.endsWith("\n") ? "" : "\n"), "utf8");
console.log("ENV_PASSWORD_UPDATED");
