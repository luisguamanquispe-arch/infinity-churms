/**
 * Autorización por rol — prueba HTTP contra dev server o skip.
 */
import "./load-test-env";

const BASE = process.env.API_TEST_BASE?.trim() || "http://localhost:3000";

type Case = { role: string; path: string; method?: string; expect: number; label: string };

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  const cookie = res.headers.get("set-cookie");
  return cookie ? cookie.split(";")[0] : null;
}

async function fetchStatus(cookie: string | null, path: string, method = "GET"): Promise<number> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, redirect: "manual" });
  return res.status;
}

async function main() {
  const password = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (!password) {
    console.log("SKIP: SEED_DEFAULT_PASSWORD no configurada");
    process.exit(0);
  }

  try {
    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error("dev server not running");
  } catch {
    console.log("SKIP: servidor no disponible en", BASE);
    process.exit(0);
  }

  const adminCookie = await login("admin@infinity.net", password);
  const supervisorCookie = await login("supervisor@infinity.net", password);
  const cobranzasCookie = await login("cobranzas@infinity.net", password);

  if (!adminCookie || !supervisorCookie || !cobranzasCookie) {
    console.error("FAIL: login seed users");
    process.exit(1);
  }

  const cases: Case[] = [
    { role: "ADMIN", path: "/api/users", expect: 200, label: "users list" },
    { role: "ADMIN", path: "/api/config/tariffs", expect: 200, label: "tariffs" },
    { role: "SUPERVISOR", path: "/api/users", expect: 403, label: "users forbidden" },
    { role: "SUPERVISOR", path: "/api/cancellations", expect: 200, label: "cancellations list" },
    { role: "COBRANZAS", path: "/api/users", expect: 403, label: "users forbidden" },
    { role: "COBRANZAS", path: "/api/cancellations", expect: 200, label: "cancellations list" },
    { role: "COBRANZAS", path: "/api/reports", expect: 200, label: "reports" },
  ];

  const cookies: Record<string, string | null> = {
    ADMIN: adminCookie,
    SUPERVISOR: supervisorCookie,
    COBRANZAS: cobranzasCookie,
  };

  let ok = 0;
  for (const c of cases) {
    const status = await fetchStatus(cookies[c.role], c.path, c.method);
    const pass = status === c.expect;
    console.log(`${pass ? "✓" : "✗"} ${c.role} ${c.label}: ${status} (expected ${c.expect})`);
    if (pass) ok++;
    else process.exitCode = 1;
  }

  // Sin auth
  const unauth = await fetchStatus(null, "/api/cancellations");
  const unauthOk = unauth === 307 || unauth === 401 || unauth === 302;
  console.log(`${unauthOk ? "✓" : "✗"} sin auth /api/cancellations: ${unauth}`);
  if (unauthOk) ok++;

  console.log(`\nAuthorization: ${ok}/${cases.length + 1} OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
