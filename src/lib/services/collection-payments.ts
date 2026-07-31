import { prisma } from "@/lib/prisma";

export async function listCollectionPayments(customerId: string) {
  return prisma.collectionPayment.findMany({
    where: { customerId },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: { user: { select: { name: true } } },
  });
}

export async function registerCollectionPayment(
  customerId: string,
  userId: string,
  data: {
    paymentDate: string;
    amount: number;
    fenixDocument: string;
    paymentMethod?: string;
    notes?: string;
  }
) {
  const fenixDocument = data.fenixDocument.trim();
  if (!fenixDocument) throw new Error("FENIX_REQUIRED");
  if (!data.amount || data.amount <= 0) throw new Error("AMOUNT_REQUIRED");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("NOT_FOUND");

  const currentBalance = Number(customer.pendingBalance);
  if (currentBalance <= 0 && customer.inCollectionWhitelist) {
    throw new Error("ALREADY_PAID");
  }

  const payment = await prisma.collectionPayment.create({
    data: {
      customerId,
      userId,
      paymentDate: new Date(data.paymentDate),
      amount: data.amount,
      fenixDocument,
      paymentMethod: data.paymentMethod?.trim() || null,
      notes: data.notes?.trim() || null,
    },
    include: { user: { select: { name: true } } },
  });

  const newBalance = Math.max(0, Math.round((currentBalance - data.amount) * 100) / 100);
  const paidInFull = newBalance <= 0;

  const updatedCustomer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      pendingBalance: newBalance,
      overdueSince: paidInFull ? null : customer.overdueSince,
      inCollectionWhitelist: paidInFull,
    },
  });

  return {
    payment,
    customer: updatedCustomer,
    paidInFull,
    remainingBalance: newBalance,
  };
}

export function totalPaid(payments: { amount: unknown }[]) {
  return Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
}
