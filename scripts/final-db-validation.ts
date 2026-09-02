import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const seedEmails = ["admin@infinity.net", "supervisor@infinity.net", "cobranzas@infinity.net"];

  for (const email of seedEmails) {
    const count = await prisma.user.count({ where: { email } });
    console.log(`User ${email}: count=${count} ${count === 1 ? "OK" : "DUPLICATE"}`);
  }

  const docSeq = await prisma.documentSequence.findMany();
  console.log("DocumentSequence rows:", docSeq.length);
  for (const row of docSeq) {
    console.log(`  ${row.key}: value=${row.value}`);
  }

  const nonBcryptUsers = await prisma.user.findMany({
    where: { NOT: { password: { startsWith: "$2" } } },
    select: { email: true, role: true, active: true },
  });
  console.log("Users without bcrypt hash prefix:", nonBcryptUsers.length);
  for (const u of nonBcryptUsers) {
    console.log(`  ${u.email} (${u.role}) active=${u.active}`);
  }

  const cancellationTables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'Cancellation%'
    ORDER BY tablename
  `;
  console.log("Cancellation tables:", cancellationTables.map((t) => t.tablename).join(", "));

  const dupActiveCancellations = await prisma.$queryRaw<{ customerId: string; cnt: bigint }[]>`
    SELECT "customerId", COUNT(*) AS cnt
    FROM "Cancellation"
    WHERE "status" NOT IN ('BAJA_COMPLETADA', 'CANCELADA')
    GROUP BY "customerId"
    HAVING COUNT(*) > 1
  `;
  console.log("Duplicate active cancellations per customer:", dupActiveCancellations.length);

  const structuralDupIndexes = await prisma.$queryRaw<{ indexname: string; cnt: bigint }[]>`
    SELECT indexname, COUNT(*) AS cnt
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%\\_key' ESCAPE '\\'
    GROUP BY indexname
    HAVING COUNT(*) > 1
  `;
  console.log("Duplicate index names:", structuralDupIndexes.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
