/**
 * Parses .env or .env.txt and prints only non-secret connection metadata.
 */
import { loadTestEnv } from "./load-test-env";
import { databaseHostLabel } from "../src/lib/database-url";

const { loadedFrom } = loadTestEnv();

if (loadedFrom.length === 0) {
  console.log(JSON.stringify({ error: "NO_ENV_FILE" }));
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.log(JSON.stringify({ error: "NO_DATABASE_URL", files: loadedFrom }));
  process.exit(1);
}

let parsed: URL;
try {
  parsed = new URL(dbUrl.replace(/^postgresql:/, "https:"));
} catch {
  console.log(JSON.stringify({ error: "INVALID_DATABASE_URL" }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    files: loadedFrom,
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, ""),
    user: parsed.username,
    hostLabel: databaseHostLabel(dbUrl),
    hasJwt: Boolean(process.env.JWT_SECRET?.trim()),
    hasSeed: Boolean(process.env.SEED_DEFAULT_PASSWORD?.trim()),
  })
);
