import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function normalizeSearchQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Condición Prisma para búsqueda insensible en campos del cliente. */
export function buildCustomerSearchWhere(q: string): Prisma.CustomerWhereInput {
  const trimmed = normalizeSearchQuery(q);
  if (!trimmed) return {};

  const cedulaDigits = normalizeDigits(trimmed);
  const terms: Prisma.CustomerWhereInput[] = [
    { name: { contains: trimmed, mode: "insensitive" } },
    { contract: { contains: trimmed, mode: "insensitive" } },
    { cedula: { contains: trimmed, mode: "insensitive" } },
    { phone: { contains: trimmed, mode: "insensitive" } },
    { address: { contains: trimmed, mode: "insensitive" } },
    { zone: { contains: trimmed, mode: "insensitive" } },
    { email: { contains: trimmed, mode: "insensitive" } },
    { planName: { contains: trimmed, mode: "insensitive" } },
    { assignedAgentName: { contains: trimmed, mode: "insensitive" } },
    {
      equipment: {
        some: {
          OR: [
            { serial: { contains: trimmed, mode: "insensitive" } },
            { brand: { contains: trimmed, mode: "insensitive" } },
            { model: { contains: trimmed, mode: "insensitive" } },
          ],
        },
      },
    },
  ];

  if (cedulaDigits.length >= 3 && cedulaDigits !== trimmed) {
    terms.push({ cedula: { contains: cedulaDigits, mode: "insensitive" } });
  }

  return { OR: terms };
}

export interface SearchCustomersOptions {
  q?: string;
  limit?: number;
  morosoOnly?: boolean;
  zone?: string;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function searchCustomers(options: SearchCustomersOptions = {}) {
  const q = options.q ? normalizeSearchQuery(options.q) : "";
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const where: Prisma.CustomerWhereInput = {
    ...(q ? buildCustomerSearchWhere(q) : {}),
    ...(options.morosoOnly ? { pendingBalance: { gt: 0 } } : {}),
    ...(options.zone ? { zone: options.zone } : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      equipment: true,
      cancellations: { select: { id: true, status: true } },
    },
    orderBy: [{ name: "asc" }, { contract: "asc" }],
    take: limit,
  });

  return customers.map((c) => ({
    ...c,
    hasCancellation: c.cancellations.length > 0,
    cancellations: undefined,
  }));
}
