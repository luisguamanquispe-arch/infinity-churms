import "./load-test-env";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseAllowed, formatDatabaseTargetSafe } from "../src/lib/test-database-guard";

async function main() {
  const target = assertTestDatabaseAllowed();
  console.log(
    JSON.stringify({
      target: formatDatabaseTargetSafe(),
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
    })
  );

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    const admin = await prisma.user.findFirst({ where: { email: "admin@infinity.net" } });
    console.log(JSON.stringify({ connected: true, hasAdminSeed: Boolean(admin) }));
    if (!admin) {
      console.log(JSON.stringify({ warning: "Run npm run db:bootstrap-test or db:seed" }));
      process.exitCode = 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(JSON.stringify({ connected: false, error: msg }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
