import { prisma } from "@/lib/prisma";
import { parseBusinessDateInput } from "@/lib/business-date";

export class CollectionPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionPaymentError";
  }
}

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
  if (!fenixDocument) throw new CollectionPaymentError("FENIX_REQUIRED");
  if (!data.amount || data.amount <= 0) throw new CollectionPaymentError("AMOUNT_REQUIRED");
  if (!Number.isFinite(data.amount)) throw new CollectionPaymentError("AMOUNT_INVALID");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.collectionPayment.findFirst({
      where: { customerId, fenixDocument },
      include: { user: { select: { name: true } } },
    });
    if (existing) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new CollectionPaymentError("NOT_FOUND");
      return {
        payment: existing,
        customer,
        paidInFull: Number(customer.pendingBalance) <= 0,
        remainingBalance: Number(customer.pendingBalance),
        idempotent: true as const,
      };
    }

    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new CollectionPaymentError("NOT_FOUND");

    const currentBalance = Number(customer.pendingBalance);
    if (currentBalance <= 0 && customer.inCollectionWhitelist) {
      throw new CollectionPaymentError("ALREADY_PAID");
    }

    const newBalance = Math.max(0, Math.round((currentBalance - data.amount) * 100) / 100);
    const paidInFull = newBalance <= 0;

    const balanceUpdate = await tx.customer.updateMany({
      where: { id: customerId, pendingBalance: customer.pendingBalance },
      data: {
        pendingBalance: newBalance,
        overdueSince: paidInFull ? null : customer.overdueSince,
        inCollectionWhitelist: paidInFull ? false : customer.inCollectionWhitelist,
      },
    });
    if (balanceUpdate.count === 0) {
      throw new CollectionPaymentError("CONCURRENT_BALANCE_UPDATE");
    }

    const payment = await tx.collectionPayment.create({
      data: {
        customerId,
        userId,
        paymentDate: parseBusinessDateInput(data.paymentDate),
        amount: data.amount,
        fenixDocument,
        paymentMethod: data.paymentMethod?.trim() || null,
        notes: data.notes?.trim() || null,
      },
      include: { user: { select: { name: true } } },
    });

    const updatedCustomer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!updatedCustomer) throw new CollectionPaymentError("NOT_FOUND");

    return {
      payment,
      customer: updatedCustomer,
      paidInFull,
      remainingBalance: newBalance,
      idempotent: false as const,
    };
  });
}

export function totalPaid(payments: { amount: unknown }[]) {
  return Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
}
