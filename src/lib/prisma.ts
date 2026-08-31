import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const options: ConstructorParameters<typeof PrismaClient>[0] = {
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  };

  try {
    options.datasources = { db: { url: getDatabaseUrl() } };
  } catch {
    // Sin DATABASE_URL (p. ej. build local): Prisma usa schema.prisma env().
  }

  return new PrismaClient(options);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
