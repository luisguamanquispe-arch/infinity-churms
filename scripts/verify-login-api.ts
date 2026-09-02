import "dotenv/config";

async function main() {
  const password = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (!password) {
    console.error("SEED_DEFAULT_PASSWORD not set — skipping login API test");
    process.exit(1);
  }

  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@infinity.net", password }),
  });

  const body = await res.json().catch(() => ({}));
  const cookie = res.headers.get("set-cookie");

  console.log("Login API status:", res.status);
  console.log("User role:", body.user?.role ?? "(none)");
  console.log("Auth cookie set:", cookie ? "yes" : "no");

  if (res.status !== 200) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
