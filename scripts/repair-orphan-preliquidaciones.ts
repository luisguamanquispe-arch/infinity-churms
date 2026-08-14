/**
 * Repara bajas en etapa pre-aprobación que no tienen preliquidación.
 * Uso: DATABASE_URL=... npx tsx scripts/repair-orphan-preliquidaciones.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureActivePreliquidacion } from "../src/lib/services/preliquidaciones";

const prisma = new PrismaClient();

const PRE_APPROVAL = [
  "SOLICITADA",
  "PRELIQUIDACION_EN_PROCESO",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
  "EN_REVISION",
] as const;

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No hay usuario ADMIN activo");

  const orphans = await prisma.cancellation.findMany({
    where: {
      status: { in: [...PRE_APPROVAL] },
      activePreliquidacionId: null,
      preliquidaciones: { none: {} },
    },
    select: { id: true, customer: { select: { contract: true } } },
  });

  console.log(`Bajas huérfanas sin preliquidación: ${orphans.length}`);
  for (const c of orphans) {
    try {
      const preliq = await ensureActivePreliquidacion(c.id, admin.id);
      console.log(`OK ${c.customer.contract} → preliquidación V${preliq.version} (${preliq.id})`);
    } catch (e) {
      console.error(`FAIL ${c.customer.contract}:`, e instanceof Error ? e.message : e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
