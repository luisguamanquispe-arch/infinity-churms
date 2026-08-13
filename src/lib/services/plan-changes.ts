import { addMonths, differenceInMonths } from "date-fns";
import type { PlanChangeStatus, Prisma, ContractOperationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextContractDocumentNumber } from "@/lib/acta-number";
import { generateContractDocumentPdf } from "@/lib/pdf-contract-document";
import { buildCustomerContractSummary, isEligibleForRenewal } from "@/lib/contract-eligibility";

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
      signatureLinkExpiryHours: 24,
      whatsappSignatureMessage: null,
      renewalDeclarationText: null,
      renewalMinMonthsCompleted: 18,
      earlyRenewalEnabled: true,
      earlyRenewalDaysBefore: 30,
      renewalAlertDays60: 60,
      renewalAlertDays30: 30,
      renewalAlertDays15: 15,
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

export async function validateCustomerForContractOperation(
  customerId: string,
  operationType: ContractOperationType = "CAMBIO_PLAN"
) {
  const ctx = await getCustomerPlanContext(customerId);
  if (!ctx) return { ok: false as const, error: "Cliente no encontrado" };
  if (ctx.customer.status !== "ACTIVO") {
    return { ok: false as const, error: "El cliente debe estar activo." };
  }
  if (ctx.pendingChange) {
    return {
      ok: false as const,
      error: `Ya existe una operación contractual en curso (${ctx.pendingChange.status}).`,
    };
  }

  if (operationType !== "CAMBIO_PLAN") {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        planChanges: {
          where: { status: { in: ACTIVE_BLOCKING_STATUSES } },
          select: { id: true, status: true, operationType: true, activatedAt: true },
        },
      },
    });
    if (!customer) return { ok: false as const, error: "Cliente no encontrado" };
    const summary = await buildCustomerContractSummary(customer);
    if (!summary.eligibleForRenewal) {
      return {
        ok: false as const,
        error: `Cliente no elegible para renovación (${summary.eligibilityStatus}).`,
      };
    }
  }

  return { ok: true as const, ctx };
}

/** @deprecated use validateCustomerForContractOperation */
export async function validateCustomerForPlanChange(customerId: string) {
  return validateCustomerForContractOperation(customerId, "CAMBIO_PLAN");
}

export async function createPlanChange(params: {
  customerId: string;
  newPlanId: string;
  approvedMonthlyUsd?: number;
  discountReason?: string;
  userId: string;
  discountAuthorizedById?: string;
}) {
  const validation = await validateCustomerForContractOperation(params.customerId, "CAMBIO_PLAN");
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
      operationType: "CAMBIO_PLAN",
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

export async function createContractRenewal(params: {
  customerId: string;
  operationType: "RENOVACION" | "RENOVACION_CAMBIO_PLAN";
  newPlanId?: string;
  approvedMonthlyUsd?: number;
  discountReason?: string;
  userId: string;
  discountAuthorizedById?: string;
}) {
  const validation = await validateCustomerForContractOperation(
    params.customerId,
    params.operationType
  );
  if (!validation.ok) throw new Error(validation.error);

  const { ctx } = validation;
  const config = await getTariffConfig();

  let newPlanId = params.newPlanId ?? ctx.currentPlan.activeServicePlanId;
  let newPlanName = ctx.currentPlan.planName;
  let newSpeedMbps = ctx.currentPlan.speedMbps ?? 0;
  let standardUsd = ctx.currentPlan.monthlyUsd ?? 0;

  if (params.operationType === "RENOVACION_CAMBIO_PLAN") {
    if (!params.newPlanId) throw new Error("Debe seleccionar el nuevo plan.");
    const newPlan = await prisma.servicePlan.findFirst({
      where: { id: params.newPlanId, active: true },
    });
    if (!newPlan) throw new Error("Plan no válido o inactivo.");
    newPlanId = newPlan.id;
    newPlanName = newPlan.name;
    newSpeedMbps = newPlan.speedMbps;
    standardUsd = Number(newPlan.monthlyUsd);
  } else if (ctx.currentPlan.activeServicePlanId) {
    const currentPlan = await prisma.servicePlan.findUnique({
      where: { id: ctx.currentPlan.activeServicePlanId },
    });
    if (currentPlan) {
      newPlanId = currentPlan.id;
      newPlanName = currentPlan.name;
      newSpeedMbps = currentPlan.speedMbps;
      standardUsd = Number(currentPlan.monthlyUsd);
    }
  }

  const approvedUsd = params.approvedMonthlyUsd ?? standardUsd;
  if (approvedUsd <= 0) throw new Error("Precio inválido.");
  if (approvedUsd < standardUsd && !params.discountReason?.trim()) {
    throw new Error("Debe indicar el motivo del descuento especial.");
  }

  const previousMonthly = ctx.currentPlan.monthlyUsd ?? standardUsd;

  return prisma.planChange.create({
    data: {
      customerId: params.customerId,
      operationType: params.operationType,
      status: "BORRADOR",
      previousPlanName: ctx.currentPlan.planName,
      previousSpeedMbps: ctx.currentPlan.speedMbps,
      previousMonthlyUsd: previousMonthly,
      previousPermanenceStart: ctx.currentPlan.permanenceStart,
      previousPermanenceEnd: ctx.currentPlan.permanenceEnd,
      previousPlanId: ctx.currentPlan.activeServicePlanId,
      newPlanId,
      newPlanName,
      newSpeedMbps,
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
  if (!pc) throw new Error("Operación contractual no encontrada.");
  if (pc.status !== "BORRADOR") throw new Error("Solo se puede confirmar un borrador.");

  const now = new Date();
  const docNumber =
    pc.addendumNumber ?? (await nextContractDocumentNumber(pc.operationType));

  return prisma.planChange.update({
    where: { id },
    data: {
      status: "PENDIENTE_DE_FIRMA",
      confirmedAt: now,
      addendumNumber: docNumber,
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
  signatureUserAgent?: string;
  processedByName: string;
  signatureMode?: "PRESENCIAL" | "REMOTA";
  signedDigitally?: boolean;
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

  if (params.signatureMode === "REMOTA") {
    if (!pc.identitySelfieAt || !pc.identitySelfieData) {
      throw new Error("Selfie de identidad requerida para firma remota.");
    }
    if (!pc.adendumAcceptedAt || !pc.dataConfirmedAt) {
      throw new Error("El cliente debe completar la aceptación antes de firmar.");
    }
  }

  const signedAt = new Date();
  const permanenceStart = signedAt;
  const permanenceEnd = addMonths(signedAt, pc.permanenceMonths);

  const config = await getTariffConfig();
  const signedPdf = generateContractDocumentPdf({
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
    addendumDeclarationText: config.addendumDeclarationText,
    renewalDeclarationText: config.renewalDeclarationText,
    processedByName: params.processedByName,
    digitallySigned: params.signedDigitally ?? params.signatureMode === "REMOTA",
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
        signatureUserAgent: params.signatureUserAgent ?? null,
        signatureMode: params.signatureMode ?? "PRESENCIAL",
        signedDigitally: params.signedDigitally ?? params.signatureMode === "REMOTA",
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
  await prisma.planChangeSignatureToken.updateMany({
    where: { planChangeId: id, isActive: true },
    data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
  });
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

  return prisma.$transaction(async (tx) => {
    if (pc.status === "ACTIVO") {
      const latestActive = await tx.planChange.findFirst({
        where: { customerId: pc.customerId, status: "ACTIVO" },
        orderBy: { activatedAt: "desc" },
      });
      if (latestActive?.id !== pc.id) {
        throw new Error("Solo se puede anular la operación activa más reciente del cliente.");
      }

      await tx.customer.update({
        where: { id: pc.customerId },
        data: {
          planName: pc.previousPlanName,
          planSpeedMbps: pc.previousSpeedMbps,
          planMonthlyUsd: pc.previousMonthlyUsd,
          activeServicePlanId: pc.previousPlanId,
          contractPermanenceStart: pc.previousPermanenceStart,
          contractPermanenceEnd: pc.previousPermanenceEnd,
        },
      });
    }

    return tx.planChange.update({
      where: { id },
      data: {
        status: "ANULADO",
        voidedAt: new Date(),
        voidedById: userId,
        voidReason: reason.trim(),
      },
    });
  });
}

export type PlanChangeAdminUpdate = {
  newPlanId?: string;
  approvedMonthlyUsd?: number;
  discountReason?: string | null;
  notes?: string | null;
  discountAuthorizedById?: string | null;
};

function planChangeNeedsPlanSelection(operationType: ContractOperationType) {
  return operationType === "CAMBIO_PLAN" || operationType === "RENOVACION_CAMBIO_PLAN";
}

export async function updatePlanChange(
  id: string,
  params: PlanChangeAdminUpdate & {
    userId: string;
    canApproveDiscount: boolean;
  }
) {
  const pc = await prisma.planChange.findUnique({ where: { id } });
  if (!pc) throw new Error("Operación contractual no encontrada.");

  const editableFull = pc.status === "BORRADOR";
  const editableLimited = pc.status === "PENDIENTE_DE_FIRMA";
  const notesOnly = ["FIRMADO", "ACTIVO", "ANULADO", "CANCELADO"].includes(pc.status);

  if (!editableFull && !editableLimited && !notesOnly) {
    throw new Error("No se puede editar en este estado.");
  }

  const data: Prisma.PlanChangeUpdateInput = {};
  let invalidateTokens = false;

  if (params.notes !== undefined) {
    data.notes = params.notes?.trim() || null;
  }

  const wantsStructuralChange =
    params.newPlanId !== undefined ||
    params.approvedMonthlyUsd !== undefined ||
    params.discountReason !== undefined;

  if (wantsStructuralChange && !editableFull && !editableLimited) {
    throw new Error("Solo se pueden editar las observaciones en este estado.");
  }

  let standardUsd = Number(pc.standardMonthlyUsd);

  if (params.newPlanId !== undefined && (editableFull || editableLimited)) {
    if (!planChangeNeedsPlanSelection(pc.operationType)) {
      throw new Error("No se puede cambiar el plan en una renovación sin cambio de plan.");
    }
    if (params.newPlanId !== pc.newPlanId) {
      const newPlan = await prisma.servicePlan.findFirst({
        where: { id: params.newPlanId, active: true },
      });
      if (!newPlan) throw new Error("Plan no válido o inactivo.");
      data.newPlan = { connect: { id: newPlan.id } };
      data.newPlanName = newPlan.name;
      data.newSpeedMbps = newPlan.speedMbps;
      standardUsd = Number(newPlan.monthlyUsd);
      data.standardMonthlyUsd = standardUsd;
      invalidateTokens = true;
    }
  }

  if (params.approvedMonthlyUsd !== undefined && (editableFull || editableLimited)) {
    const approvedUsd = params.approvedMonthlyUsd;
    if (approvedUsd <= 0) throw new Error("Precio inválido.");
    const discountReason =
      params.discountReason !== undefined ? params.discountReason : pc.discountReason;
    if (approvedUsd < standardUsd && !discountReason?.trim()) {
      throw new Error("Debe indicar el motivo del descuento especial.");
    }
    if (approvedUsd < standardUsd && !params.canApproveDiscount) {
      throw new Error("Se requiere autorización de supervisor o administrador para aplicar descuento.");
    }
    if (approvedUsd !== Number(pc.newMonthlyUsd)) {
      invalidateTokens = true;
    }
    data.newMonthlyUsd = approvedUsd;
    if (approvedUsd < standardUsd) {
      data.discountReason = discountReason?.trim() || null;
      data.discountAuthorizedBy = { connect: { id: params.userId } };
      data.discountAuthorizedAt = new Date();
    } else {
      data.discountReason = null;
      data.discountAuthorizedBy = { disconnect: true };
      data.discountAuthorizedAt = null;
    }
  } else if (params.discountReason !== undefined && (editableFull || editableLimited)) {
    data.discountReason = params.discountReason?.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("No hay cambios para guardar.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.planChange.update({
      where: { id },
      data,
      include: {
        customer: { select: { contract: true, name: true } },
        createdBy: { select: { name: true } },
        discountAuthorizedBy: { select: { name: true } },
        newPlan: true,
      },
    });

    if (invalidateTokens && editableLimited) {
      await tx.planChangeSignatureToken.updateMany({
        where: { planChangeId: id, isActive: true },
        data: { isActive: false, status: "CANCELADO", cancelledAt: new Date() },
      });
    }

    return row;
  });

  return updated;
}

export async function deletePlanChange(id: string) {
  const pc = await prisma.planChange.findUnique({ where: { id } });
  if (!pc) throw new Error("NOT_FOUND");
  if (!["BORRADOR", "CANCELADO"].includes(pc.status)) {
    throw new Error("Solo se pueden eliminar borradores o solicitudes canceladas.");
  }
  await prisma.planChange.delete({ where: { id } });
  return pc;
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
      signatureTokens: {
        where: { isActive: true },
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: { generatedBy: { select: { name: true } } },
      },
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
  operationType?: string;
  signed?: string;
}) {
  const where: Prisma.PlanChangeWhereInput = {};

  if (filters?.operationType) {
    where.operationType = filters.operationType as ContractOperationType;
  }

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
      type:
        c.operationType === "CAMBIO_PLAN"
          ? ("ADENDUM" as const)
          : ("RENOVACION" as const),
      operationType: c.operationType,
      sequence: i + 1,
      addendumNumber: c.addendumNumber,
      id: c.id,
      date: c.signedAt ?? c.confirmedAt,
      planName: c.newPlanName,
      speedMbps: c.newSpeedMbps,
      monthlyUsd: Number(c.newMonthlyUsd),
      previousPlanName: c.previousPlanName,
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
  if (!pc) throw new Error("Operación no encontrada.");

  const config = await getTariffConfig();
  return generateContractDocumentPdf({
    planChange: pc,
    customer: pc.customer,
    addendumDeclarationText: config.addendumDeclarationText,
    renewalDeclarationText: config.renewalDeclarationText,
    processedByName,
    digitallySigned: pc.signedDigitally,
  });
}
