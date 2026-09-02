import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TERMINAL_CANCELLATION_STATUSES } from "@/lib/services/cancellations";

/**
 * Un Customer tiene un único contrato/servicio.
 * Si completó al menos una baja y no tiene otra baja activa, pasa a INACTIVO.
 */
export async function syncCustomerStatusAfterCancellationCompleted(
  customerId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const activeCount = await tx.cancellation.count({
    where: {
      customerId,
      status: { notIn: TERMINAL_CANCELLATION_STATUSES },
    },
  });
  if (activeCount > 0) return { updated: false };

  const completedCount = await tx.cancellation.count({
    where: { customerId, status: "BAJA_COMPLETADA" },
  });
  if (completedCount === 0) return { updated: false };

  const result = await tx.customer.updateMany({
    where: {
      id: customerId,
      status: { in: ["ACTIVO", "SUSPENDIDO"] },
    },
    data: { status: "INACTIVO" },
  });

  return { updated: result.count > 0 };
}
