import { prisma } from "@/lib/prisma";
import { customerHasCancellation } from "@/lib/services/cancellations";
import type { CollectionResult } from "@prisma/client";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function listCollectionActions(customerId: string) {
  return prisma.collectionAction.findMany({
    where: { customerId },
    orderBy: [{ actionDate: "desc" }, { createdAt: "desc" }],
    include: { user: { select: { name: true, role: true } } },
  });
}

export async function getCustomerForCollection(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      equipment: true,
      collectionActions: {
        orderBy: [{ actionDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  if (!customer) return null;

  const hasCancellation = await customerHasCancellation(customerId);
  const eligibility = await getBajaEligibility(customerId);

  return { customer, hasCancellation, eligibility };
}

export async function getBajaEligibility(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { allowed: false, blockers: ["Cliente no encontrado"] };
  }

  const blockers: string[] = [];
  const actions = await prisma.collectionAction.findMany({
    where: { customerId },
    orderBy: [{ actionDate: "desc" }, { createdAt: "desc" }],
  });

  if (await customerHasCancellation(customerId)) {
    blockers.push("El cliente ya tiene una baja registrada");
  }

  if (customer.openTechnicalClaim) {
    blockers.push("Existe un reclamo técnico abierto");
  }

  const hasPaymentResult = actions.some((a) => a.result === "PAGO");
  if (hasPaymentResult) {
    blockers.push("Existe un pago registrado en gestión de cobranza — finalice la gestión");
  }

  const today = startOfDay(new Date());
  const activePromise = actions.find(
    (a) =>
      a.result === "PROMESA_DE_PAGO" &&
      a.promiseDate &&
      startOfDay(a.promiseDate) >= today
  );
  if (activePromise) {
    blockers.push(
      `Promesa de pago vigente hasta ${activePromise.promiseDate!.toLocaleDateString("es-VE")}`
    );
  }

  const latest = actions[0];
  if (latest?.result === "CONVENIO") {
    blockers.push("Existe un convenio activo");
  }

  return { allowed: blockers.length === 0, blockers };
}

export async function createCollectionAction(
  customerId: string,
  userId: string,
  data: {
    actionDate?: string;
    managementType: string;
    result: string;
    notes?: string;
    nextFollowUpDate?: string;
    promiseDate?: string;
    promiseAmount?: number;
    promiseNotes?: string;
    attachmentName?: string;
    attachmentData?: string;
    photoName?: string;
    photoData?: string;
  }
) {
  if (data.result === "PROMESA_DE_PAGO") {
    if (!data.promiseDate || data.promiseAmount === undefined || Number.isNaN(data.promiseAmount)) {
      throw new Error("PROMISE_REQUIRED");
    }
  }

  const maxFileSize = 500_000;
  if (data.attachmentData && data.attachmentData.length > maxFileSize) {
    throw new Error("ATTACHMENT_TOO_LARGE");
  }
  if (data.photoData && data.photoData.length > maxFileSize) {
    throw new Error("PHOTO_TOO_LARGE");
  }

  return prisma.collectionAction.create({
    data: {
      customerId,
      userId,
      actionDate: data.actionDate ? new Date(data.actionDate) : new Date(),
      managementType: data.managementType as never,
      result: data.result as CollectionResult,
      notes: data.notes?.trim() || null,
      nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
      promiseDate: data.promiseDate ? new Date(data.promiseDate) : null,
      promiseAmount: data.promiseAmount ?? null,
      promiseNotes: data.promiseNotes?.trim() || null,
      attachmentName: data.attachmentName || null,
      attachmentData: data.attachmentData || null,
      photoName: data.photoName || null,
      photoData: data.photoData || null,
    },
    include: { user: { select: { name: true, role: true } } },
  });
}
