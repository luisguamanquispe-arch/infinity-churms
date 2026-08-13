import { addMonths, differenceInMonths } from "date-fns";
import type { PlanChangeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextAddendumNumber } from "@/lib/acta-number";
import { generateAdendumPdf } from "@/lib/pdf-adendum";

const ACTIVE_BLOCKING_STATUSES: PlanChangeStatus[] = [
  "BORRADOR",
  "PENDIENTE_DE_FIRMA",
  "FIRMADO",
];

export async function getTariffConfig() {
  const row = await prisma.tariffConfig.findFirst();
  return (
    row ?? {
      permanenceMonths: 18,
      installCostUsd: 200,
      tvMonthlyUsd: 2,
      addendumDeclarationText: null,
    }
  );
}

export async function listActiveServicePlans() {
  return prisma.servicePlan.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { speedMbps: "asc" }],
  });
}

export async function getCustomerPlanContext(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { activeServicePlan: true },
  });
  if (!customer) return null;

  const config = await getTariffConfig();
  const now = new Date();
  const permanenceStart =
    customer.contractPermanenceStart ?? customer.serviceStartDate;
  const permanenceEnd =
    customer.contractPermanenceEnd ??
    addMonths(permanenceStart, config.permanenceMonths);

  const monthsCompleted = Math.max(0, differenceInMonths(now, permanenceStart));
  const monthsRemaining = Math.max(
    0,
    differenceInMonths(permanenceEnd, now)
  );

  const pendingChange = await prisma.planChange.findFirst({
    where: {
      customerId,
      status: { in: ACTIVE_BLOCKING_STATUSES },
    },
    orderBy: { requestDate: "desc" },
  });

  return {
    customer: {
      id: customer.id,
      contract: customer.contract,
      name: customer.name,
      cedula: customer.cedula,
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
      status: customer.status,
      serviceStartDate: customer.serviceStartDate,
    },
    currentPlan: {
      planName: customer.planName,
      speedMbps: customer.planSpeedMbps,
      monthlyUsd: customer.planMonthlyUsd ? Number(customer.planMonthlyUsd) : null,
      permanenceStart,
      permanenceEnd,
      monthsCompleted,
      monthsRemaining,
      activeServicePlanId: customer.activeServicePlanId,
    },
    pendingChange: pendingChange
      ? { id: pendingChange.id, status: pendingChange.status, addendumNumber: pendingChange.addendumNumber }
      : null,
    permanenceMonths: config.permanenceMonths,
  };
}

export async function validateCustomerForPlanChange(customerId: string) {
  const ctx = await getCustomerPlanContext(customerId);
  if (!ctx) return { ok: false as const, error: "Cliente no encontrado" };
  if (ctx.customer.status !== "ACTIVO") {
    return { ok: false as const, error: "El cliente debe estar activo para cambiar de plan." };
  }
  if (ctx.pendingChange) {
    return {
      ok: false as const,
      error: `Ya existe un cambio de plan en curso (${ctx.pendingChange.status}).`,
    };
  }
  return { ok: true as const, ctx };
}

export async function createPlanChange(params: {
  customerId: string;
  newPlanId: string;
  approvedMonthlyUsd?: number;
  discountReason?: string;
  userId: string;
  discountAuthorizedById?: string;
}) {
  const validation = await validateCustomerForPlanChange(params.customerId);
  if (!validation.ok) throw new Error(validation.error);

  const { ctx } = validation;
  const newPlan = await prisma.servicePlan.findFirst({
    where: { id: params.newPlanId, active: true },
  });
  if (!newPlan) throw new Error("Plan no válido o inactivo.");

  const standardUsd = Number(newPlan.monthlyUsd);
  const approvedUsd = params.approvedMonthlyUsd ?? standardUsd;
  if (approvedUsd <= 0) throw new Error("Precio inválido.");
  if (approvedUsd < standardUsd && !params.discountReason?.trim()) {
    throw new Error("Debe indicar el motivo del descuento especial.");
  }
  if (approvedUsd < standardUsd && !params.discountAuthorizedById) {
    throw new Error("Se requiere autorización para aplicar descuento.");
  }

  const previousMonthly =
    ctx.currentPlan.monthlyUsd ??
    (ctx.currentPlan.speedMbps ? 0 : Number(newPlan.monthlyUsd));

  const config = await getTariffConfig();

  return prisma.planChange.create({
    data: {
      customerId: params.customerId,
      status: "BORRADOR",
      previousPlanName: ctx.currentPlan.planName,
      previousSpeedMbps: ctx.currentPlan.speedMbps,
      previousMonthlyUsd: previousMonthly,
      previousPermanenceStart: ctx.currentPlan.permanenceStart,
      previousPermanenceEnd: ctx.currentPlan.permanenceEnd,
      previousPlanId: ctx.currentPlan.activeServicePlanId,
      newPlanId: newPlan.id,
      newPlanName: newPlan.name,
      newSpeedMbps: newPlan.speedMbps,
      newMonthlyUsd: approvedUsd,
      standardMonthlyUsd: standardUsd,
      discountReason: params.discountReason?.trim() || null,
      discountAuthorizedById: params.discountAuthorizedById ?? null,
      discountAuthorizedAt: params.discountAuthorizedById ? new Date() : null,
      permanenceMonths: config.permanenceMonths,
      originalContractDate: ctx.customer.serviceStartDate,
      createdById: params.userId,
    },
    include: {
      customer: { select: { contract: true, name: true } },
      createdBy: { select: { name: true } },
      newPlan: true,
    },
  });
}

export async function confirmPlanChange(id: string) {
  const pc = await prisma.planChange.findUnique({ where: { id } });
  if (!pc) throw new Error("Cambio de plan no encontrado.");
  if (pc.status !== "BORRADOR") throw new Error("Solo se puede confirmar un borrador.");

  const now = new Date();
  const permanenceEnd = addMonths(now, pc.permanenceMonths);
  const addendumNumber = pc.addendumNumber ?? (await nextAddendumNumber());

  return prisma.planChange.update({
    where: { id },
    data: {
      status: "PENDIENTE_DE_FIRMA",
      confirmedAt: now,
      addendumNumber,
      newPermanenceStart: now,
      newPermanenceEnd: permanenceEnd,
    },
  });
}

export async function signPlanChange(params: {
  id: string;
  signatureName: string;
  signatureCedula: string;
  signatureImageData: string;
  signatureConsent: boolean;
  signatureIp?: string;
  processedByName: string;
}) {
  const pc = await prisma.planChange.findUnique({
    where: { id: params.id },
    include: { customer: true, createdBy: { select: { name: true } } },
  });
  if (!pc) throw new Error("Cambio de plan no encontrado.");
  if (pc.status !== "PENDIENTE_DE_FIRMA") {
    throw new Error("El adendum debe estar pendiente de firma.");
  }
  if (!params.signatureConsent) throw new Error("Debe aceptar el consentimiento de firma.");
  if (!params.signatureName.trim()) throw new Error("Nombre del firmante requerido.");
  if (!params.signatureImageData.startsWith("data:image")) {
    throw new Error("Firma inválida.");
  }

  const signedAt = new Date();
  const permanenceStart = signedAt;
  const permanenceEnd = addMonths(signedAt, pc.permanenceMonths);

  const config = await getTariffConfig();
  const signedPdf = generateAdendumPdf({
    planChange: {
      ...pc,
      signedAt,
      newPermanenceStart: permanenceStart,
      newPermanenceEnd: permanenceEnd,
      clientSignatureName: params.signatureName.trim(),
      clientSignatureCedula: params.signatureCedula.trim(),
      signatureImageData: params.signatureImageData,
    },
    customer: pc.customer,
    declarationText: config.addendumDeclarationText,
    processedByName: params.processedByName,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const signed = await tx.planChange.update({
      where: { id: params.id },
      data: {
        status: "FIRMADO",
        signedAt,
        newPermanenceStart: permanenceStart,
        newPermanenceEnd: permanenceEnd,
        clientSignatureName: params.signatureName.trim(),
        clientSignatureCedula: params.signatureCedula.trim(),
        signatureImageData: params.signatureImageData,
        signatureConsent: true,
        signatureIp: params.signatureIp ?? null,
        signedPdfData: signedPdf.toString("base64"),
      },
    });

    const activated = await tx.planChange.update({
      where: { id: params.id },
      data: {
        status: "ACTIVO",
        activatedAt: signedAt,
      },
    });

    await tx.customer.update({
      where: { id: pc.customerId },
      data: {
        planName: pc.newPlanName,
        planSpeedMbps: pc.newSpeedMbps,
        planMonthlyUsd: pc.newMonthlyUsd,
        activeServicePlanId: pc.newPlanId,
        contractPermanenceStart: permanenceStart,
        contractPermanenceEnd: permanenceEnd,
      },
    });

    return activated;
  });

  return updated;
}

export async function cancelPlanChange(id: string) {
  const pc = await prisma.planChange.findUnique({ where: { id } });
  if (!pc) throw new Error("Cambio de plan no encontrado.");
  if (!["BORRADOR", "PENDIENTE_DE_FIRMA"].includes(pc.status)) {
    throw new Error("No se puede cancelar en este estado.");
  }
  return prisma.planChange.update({
    where: { id },
    data: { status: "CANCELADO", cancelledAt: new Date() },
  });
}

export async function voidPlanChange(id: string, userId: string, reason: string) {
  const pc = await prisma.planChange.findUnique({ where: { id } });
  if (!pc) throw new Error("Cambio de plan no encontrado.");
  if (!["ACTIVO", "FIRMADO"].includes(pc.status)) {
    throw new Error("Solo se pueden anular cambios activos o firmados.");
  }
  if (!reason.trim()) throw new Error("Motivo de anulación requerido.");

  return prisma.planChange.update({
    where: { id },
    data: {
      status: "ANULADO",
      voidedAt: new Date(),
      voidedById: userId,
      voidReason: reason.trim(),
    },
  });
}

export async function getPlanChange(id: string) {
  return prisma.planChange.findUnique({
    where: { id },
    include: {
      customer: true,
      newPlan: true,
      previousPlan: true,
      createdBy: { select: { id: true, name: true } },
      discountAuthorizedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
}

export async function listPlanChanges(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  customerId?: string;
  previousPlanId?: string;
  newPlanId?: string;
  signed?: string;
}) {
  const where: Prisma.PlanChangeWhereInput = {};

  if (filters?.status) where.status = filters.status as PlanChangeStatus;
  if (filters?.userId) where.createdById = filters.userId;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.previousPlanId) where.previousPlanId = filters.previousPlanId;
  if (filters?.newPlanId) where.newPlanId = filters.newPlanId;
  if (filters?.dateFrom || filters?.dateTo) {
    where.requestDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }
  if (filters?.signed === "true") where.signedAt = { not: null };
  if (filters?.signed === "false") where.signedAt = null;

  return prisma.planChange.findMany({
    where,
    include: {
      customer: { select: { contract: true, name: true, cedula: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { requestDate: "desc" },
  });
}

export async function getContractHistory(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      contract: true,
      serviceStartDate: true,
      planName: true,
      planSpeedMbps: true,
      planMonthlyUsd: true,
      contractPermanenceStart: true,
      contractPermanenceEnd: true,
    },
  });
  if (!customer) return null;

  const changes = await prisma.planChange.findMany({
    where: {
      customerId,
      status: { in: ["FIRMADO", "ACTIVO", "ANULADO"] },
    },
    orderBy: { signedAt: "asc" },
    include: {
      createdBy: { select: { name: true } },
    },
  });

  const originalEnd =
    customer.contractPermanenceStart && !changes.length
      ? customer.contractPermanenceEnd
      : addMonths(
          customer.serviceStartDate,
          (await getTariffConfig()).permanenceMonths
        );

  return {
    originalContract: {
      type: "CONTRATO_ORIGINAL" as const,
      contractNumber: customer.contract,
      date: customer.serviceStartDate,
      planName: changes[0]?.previousPlanName ?? customer.planName,
      speedMbps: changes[0]?.previousSpeedMbps ?? customer.planSpeedMbps,
      monthlyUsd: changes[0]
        ? Number(changes[0].previousMonthlyUsd)
        : customer.planMonthlyUsd
          ? Number(customer.planMonthlyUsd)
          : null,
      permanenceStart: customer.serviceStartDate,
      permanenceEnd: originalEnd,
    },
    addendums: changes.map((c, i) => ({
      type: "ADENDUM" as const,
      sequence: i + 1,
      addendumNumber: c.addendumNumber,
      id: c.id,
      date: c.signedAt ?? c.confirmedAt,
      planName: c.newPlanName,
      speedMbps: c.newSpeedMbps,
      monthlyUsd: Number(c.newMonthlyUsd),
      permanenceStart: c.newPermanenceStart,
      permanenceEnd: c.newPermanenceEnd,
      status: c.status,
      signedBy: c.clientSignatureName,
      processedBy: c.createdBy.name,
      hasPdf: !!c.signedPdfData,
    })),
  };
}

export async function getActivePlanChangePermanence(customerId: string) {
  return prisma.planChange.findFirst({
    where: { customerId, status: "ACTIVO" },
    orderBy: { activatedAt: "desc" },
    select: {
      newPermanenceStart: true,
      newPermanenceEnd: true,
      addendumNumber: true,
      signedAt: true,
      newPlanName: true,
    },
  });
}

export async function generateAdendumPdfForChange(id: string, processedByName?: string) {
  const pc = await prisma.planChange.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!pc) throw new Error("Cambio de plan no encontrado.");

  const config = await getTariffConfig();
  return generateAdendumPdf({
    planChange: pc,
    customer: pc.customer,
    declarationText: config.addendumDeclarationText,
    processedByName,
  });
}
