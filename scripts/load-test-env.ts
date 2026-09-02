/**
 * Carga .env / .env.local / .env.txt en process.env para scripts tsx de TEST.
 * No sobrescribe variables ya definidas en el entorno (mismo criterio que dotenv).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");

export function parseEnvFileContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export function loadTestEnv(): { loadedFrom: string[] } {
  const candidates = [".env", ".env.local", ".env.txt"];
  const loadedFrom: string[] = [];
  const merged: Record<string, string> = {};

  for (const name of candidates) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    Object.assign(merged, parseEnvFileContent(readFileSync(path, "utf8")));
    loadedFrom.push(name);
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return { loadedFrom };
}

/** Side-effect import: cargar env al importar el módulo. */
loadTestEnv();
