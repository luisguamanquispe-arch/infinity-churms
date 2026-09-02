/**
 * Checks if DATABASE_URL password may need URL encoding (no secrets printed).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const NEEDS_ENCODING = /[@#%/:?&=]/;
const root = join(import.meta.dirname, "..");
const file = existsSync(join(root, ".env"))
  ? ".env"
  : existsSync(join(root, ".env.txt"))
    ? ".env.txt"
    : null;

if (!file) {
  console.log(JSON.stringify({ error: "NO_ENV_FILE" }));
  process.exit(1);
}

const vars: Record<string, string> = {};
for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  vars[t.slice(0, eq).trim()] = val;
}

const raw = vars.DATABASE_URL ?? "";
let password = "";
try {
  const u = new URL(raw.replace(/^postgresql:/, "https:"));
  password = decodeURIComponent(u.password);
} catch {
  console.log(JSON.stringify({ error: "INVALID_DATABASE_URL_FORMAT" }));
  process.exit(1);
}

const specialInPassword = NEEDS_ENCODING.test(password);
const ambiguousAtInUrl =
  !raw.includes("%40") && (raw.match(/@/g)?.length ?? 0) > 1;

console.log(
  JSON.stringify({
    file,
    passwordEmpty: password.length === 0,
    specialCharsNeedEncoding: specialInPassword,
    ambiguousAtSeparator: ambiguousAtInUrl,
    recommendation: specialInPassword || ambiguousAtInUrl
      ? "URL-encode password special chars (@ # % / : ? & =)"
      : "none",
  })
);
