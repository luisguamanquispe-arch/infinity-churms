import { prisma } from "@/lib/prisma";

export async function deleteCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, contract: true, name: true },
  });
  if (!customer) throw new Error("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.planChange.deleteMany({ where: { customerId: id } });

    const cancellations = await tx.cancellation.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    for (const cancellation of cancellations) {
      await tx.cancellation.update({
        where: { id: cancellation.id },
        data: { activePreliquidacionId: null },
      });
    }
    await tx.cancellation.deleteMany({ where: { customerId: id } });

    await tx.customer.delete({ where: { id } });
  });

  return customer;
}
