/**
 * Valida que scripts de prueba/destructivos locales apunten solo a BD TEST.
 * Nunca imprime password ni DATABASE_URL completa.
 */
import { databaseHostLabel } from "@/lib/database-url";

export const TEST_DATABASE_GUARD_MESSAGE =
  "REFUSED: test suite cannot run against non-test database";

export type DatabaseTargetMeta = {
  protocol: string;
  host: string;
  port: string;
  database: string;
  user: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const BLOCKED_HOST_FRAGMENTS = [
  "render.com",
  "neon.tech",
  "supabase.co",
  "amazonaws.com",
  "azure.com",
  "digitalocean.com",
  "elephantsql.com",
  "cockroachlabs.cloud",
];

export function parseDatabaseTarget(url: string): DatabaseTargetMeta {
  const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "https://"));
  return {
    protocol: url.startsWith("postgresql") ? "postgresql" : "postgres",
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "").split("?")[0],
    user: decodeURIComponent(parsed.username || ""),
  };
}

/**
 * Exige localhost + nombre de BD que contenga "test".
 * Protege contra ejecución accidental contra Render/producción o infinity_hoteles.
 */
export function assertTestDatabaseAllowed(url?: string): DatabaseTargetMeta {
  const raw = url?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error("DATABASE_URL is required for test scripts");
  }

  const meta = parseDatabaseTarget(raw);
  const host = meta.host.toLowerCase();
  const db = meta.database.toLowerCase();

  if (BLOCKED_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) {
    throw new Error(`${TEST_DATABASE_GUARD_MESSAGE} (external host: ${meta.host})`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`${TEST_DATABASE_GUARD_MESSAGE} (host must be localhost, got ${meta.host})`);
  }

  if (!db.includes("test")) {
    throw new Error(
      `${TEST_DATABASE_GUARD_MESSAGE} (database name must contain 'test', got ${meta.database})`
    );
  }

  return meta;
}

export function formatDatabaseTargetSafe(url?: string): string {
  const raw = url?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) return "(no DATABASE_URL)";
  try {
    const meta = parseDatabaseTarget(raw);
    return `${meta.user}@${meta.host}:${meta.port}/${meta.database}`;
  } catch {
    return databaseHostLabel(raw);
  }
}
