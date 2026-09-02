/**
 * Validación final de APIs críticas — solo lectura o endpoints de prueba controlados.
 * Requiere dev server en localhost:3000 y SEED_DEFAULT_PASSWORD en .env.
 */
import "dotenv/config";

const BASE = process.env.API_TEST_BASE?.trim() || "http://localhost:3000";

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
}

async function jsonFetch(
  path: string,
  init?: RequestInit & { cookie?: string }
): Promise<{ status: number; body: unknown; setCookie?: string | null }> {
  const headers = new Headers(init?.headers);
  if (init?.cookie) headers.set("Cookie", init.cookie);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") };
}

async function main() {
  const password = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (!password) {
    console.error("SEED_DEFAULT_PASSWORD required");
    process.exit(1);
  }

  // --- Sin autenticación ---
  const health = await jsonFetch("/api/health");
  health.status === 200 ? pass("GET /api/health público", String(health.status)) : fail("GET /api/health", String(health.status));

  const customersUnauth = await jsonFetch("/api/customers");
  customersUnauth.status === 401 || customersUnauth.status === 302 || customersUnauth.status === 307
    ? pass("GET /api/customers sin auth bloqueado", String(customersUnauth.status))
    : fail("GET /api/customers sin auth", `status=${customersUnauth.status}`);

  const cancellationsUnauth = await jsonFetch("/api/cancellations");
  cancellationsUnauth.status === 401 || cancellationsUnauth.status === 302 || cancellationsUnauth.status === 307
    ? pass("GET /api/cancellations sin auth bloqueado", String(cancellationsUnauth.status))
    : fail("GET /api/cancellations sin auth", `status=${cancellationsUnauth.status}`);

  const dashboardUnauth = await jsonFetch("/api/dashboard");
  dashboardUnauth.status === 401 || dashboardUnauth.status === 302 || dashboardUnauth.status === 307
    ? pass("GET /api/dashboard sin auth bloqueado", String(dashboardUnauth.status))
    : fail("GET /api/dashboard sin auth", `status=${dashboardUnauth.status}`);

  // --- Login ---
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@infinity.net", password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const authCookie = setCookie.split(";")[0];

  if (loginRes.status === 200 && loginBody.user?.role === "ADMIN" && authCookie.includes("=")) {
    pass("POST /api/auth/login admin", "200 ADMIN");
  } else {
    fail("POST /api/auth/login admin", `status=${loginRes.status}`);
    printSummary();
    process.exit(1);
  }

  authCookie.includes("HttpOnly") || authCookie.includes("httponly")
    ? pass("Cookie auth httpOnly", "present")
    : fail("Cookie auth httpOnly", "missing flag in Set-Cookie");

  // --- Autenticado admin ---
  const me = await jsonFetch("/api/auth/me", { cookie: authCookie });
  me.status === 200 && (me.body as { email?: string }).email === "admin@infinity.net"
    ? pass("GET /api/auth/me", "200")
    : fail("GET /api/auth/me", String(me.status));

  const customers = await jsonFetch("/api/customers", { cookie: authCookie });
  customers.status === 200 ? pass("GET /api/customers admin", "200") : fail("GET /api/customers admin", String(customers.status));

  const cancellations = await jsonFetch("/api/cancellations", { cookie: authCookie });
  cancellations.status === 200 ? pass("GET /api/cancellations admin", "200") : fail("GET /api/cancellations admin", String(cancellations.status));

  const dashboard = await jsonFetch("/api/dashboard", { cookie: authCookie });
  dashboard.status === 200 ? pass("GET /api/dashboard admin", "200") : fail("GET /api/dashboard admin", String(dashboard.status));

  const tariffs = await jsonFetch("/api/config/tariffs", { cookie: authCookie });
  tariffs.status === 200 ? pass("GET /api/config/tariffs admin", "200") : fail("GET /api/config/tariffs", String(tariffs.status));

  // --- Rol COBRANZAS login ---
  const cobRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cobranzas@infinity.net", password }),
  });
  const cobCookie = (cobRes.headers.get("set-cookie") ?? "").split(";")[0];
  if (cobRes.status === 200) {
    pass("POST /api/auth/login cobranzas", "200");
    const usersAttempt = await jsonFetch("/api/users", { cookie: cobCookie, method: "GET" });
    usersAttempt.status === 403
      ? pass("GET /api/users cobranzas → 403", "403")
      : fail("GET /api/users cobranzas", `expected 403 got ${usersAttempt.status}`);
  } else {
    fail("POST /api/auth/login cobranzas", String(cobRes.status));
  }

  // --- Token inválido ---
  const badToken = await jsonFetch("/api/baja/preliquidacion/invalid-token-test", { method: "GET" });
  badToken.status === 404 || badToken.status === 400 || badToken.status === 401
    ? pass("GET /api/baja/preliquidacion token inválido", String(badToken.status))
    : fail("GET /api/baja/preliquidacion token inválido", String(badToken.status));

  printSummary();
  if (results.some((r) => !r.ok)) process.exit(1);
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  console.log(`\nAPI validation: ${ok}/${results.length} OK`);
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`);
  }
  if (bad.length) console.log("\nFailed:", bad.map((b) => b.name).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
