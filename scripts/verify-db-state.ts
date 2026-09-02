import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%\\_key' ESCAPE '\\'
    ORDER BY indexname
  `;
  const fkeys = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE contype = 'f' ORDER BY conname
  `;
  const users = await prisma.user.count();

  console.log("Tables:", tables.length);
  console.log("Unique indexes (_key):", indexes.length);
  console.log("Foreign keys:", fkeys.length);
  console.log("Users:", users);

  const expectedKeys = [
    "CancellationPreliquidacion_cancellationId_version_key",
    "PreliquidacionApprovalToken_tokenHash_key",
    "Cancellation_activePreliquidacionId_key",
    "PlanChange_addendumNumber_key",
    "PlanChangeSignatureToken_tokenHash_key",
    "CancellationActaSignatureToken_tokenHash_key",
  ];
  const indexNames = new Set(indexes.map((i) => i.indexname));
  for (const key of expectedKeys) {
    console.log(`${key}: ${indexNames.has(key) ? "OK" : "MISSING"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
