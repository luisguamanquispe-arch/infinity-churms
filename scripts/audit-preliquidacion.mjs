import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('CancellationPreliquidacion', 'PreliquidacionLineItem', 'PreliquidacionApprovalToken', 'Cancellation')
  `;
  console.log("TABLES:", tables);

  const cancellations = await prisma.cancellation.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      activePreliquidacionId: true,
      createdAt: true,
      customer: { select: { contract: true, name: true } },
      _count: { select: { preliquidaciones: true } },
    },
  });
  console.log("\nRECENT CANCELLATIONS:");
  console.log(JSON.stringify(cancellations, null, 2));

  for (const c of cancellations) {
    const preliqs = await prisma.cancellationPreliquidacion.findMany({
      where: { cancellationId: c.id },
      include: {
        lineItems: true,
        _count: { select: { lineItems: true } },
      },
    });
    console.log(`\nPreliquidaciones for ${c.id} (${c.customer?.contract}):`);
    console.log(JSON.stringify(preliqs, null, 2));
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
