import type { PrismaClient } from "@prisma/client";

export async function clearBusinessData(prisma: PrismaClient) {
  const deleted = {
    payments: (await prisma.cancellationPayment.deleteMany()).count,
    charges: (await prisma.cancellationCharge.deleteMany()).count,
    cancellationEquipment: (await prisma.cancellationEquipment.deleteMany()).count,
    cancellations: (await prisma.cancellation.deleteMany()).count,
    customerEquipment: (await prisma.customerEquipment.deleteMany()).count,
    customers: (await prisma.customer.deleteMany()).count,
    auditLogs: (await prisma.auditLog.deleteMany()).count,
  };

  await prisma.documentSequence.updateMany({ data: { value: 0 } });

  return deleted;
}
