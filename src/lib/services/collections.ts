import { prisma } from "@/lib/prisma";
import { customerHasCancellation } from "@/lib/services/cancellations";
import type { CollectionResult } from "@prisma/client";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const agentUserSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
} as const;

export async function listCollectionAgentUsers() {
  return prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["COBRANZAS", "ADMIN"] },
    },
    orderBy: [{ name: "asc" }],
    select: agentUserSelect,
  });
}

export async function resolveCollectionAgent(agentUserId: string) {
  const agent = await prisma.user.findFirst({
    where: {
      id: agentUserId,
      active: true,
      role: { in: ["COBRANZAS", "ADMIN"] },
    },
    select: agentUserSelect,
  });
  if (!agent) throw new Error("AGENT_INVALID");
  return agent;
}

export interface CustomerAgentStage {
  agentUserId: string;
  agentName: string;
  firstActionDate: string;
  lastActionDate: string;
  gestionesCount: number;
}

export async function getCustomerAgentHistory(customerId: string): Promise<CustomerAgentStage[]> {
  const actions = await prisma.collectionAction.findMany({
    where: { customerId },
    orderBy: [{ actionDate: "asc" }, { createdAt: "asc" }],
    select: {
      agentUserId: true,
      agentName: true,
      actionDate: true,
    },
  });

  const stages: CustomerAgentStage[] = [];
  for (const action of actions) {
    const last = stages[stages.length - 1];
    if (last && last.agentUserId === action.agentUserId) {
      last.lastActionDate = action.actionDate.toISOString();
      last.gestionesCount += 1;
      continue;
    }
    stages.push({
      agentUserId: action.agentUserId,
      agentName: action.agentName,
      firstActionDate: action.actionDate.toISOString(),
      lastActionDate: action.actionDate.toISOString(),
      gestionesCount: 1,
    });
  }

  return stages;
}

export async function listCollectionActions(customerId: string) {
  return prisma.collectionAction.findMany({
    where: { customerId },
    orderBy: [{ actionDate: "desc" }, { createdAt: "desc" }],
    include: {
      user: { select: { name: true, role: true } },
      agent: { select: { name: true, role: true } },
    },
  });
}

export async function getCustomerForCollection(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      equipment: true,
      assignedAgent: { select: agentUserSelect },
      collectionActions: {
        orderBy: [{ actionDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  if (!customer) return null;

  const hasCancellation = await customerHasCancellation(customerId);
  const eligibility = await getBajaEligibility(customerId);
  const agentHistory = await getCustomerAgentHistory(customerId);

  return { customer, hasCancellation, eligibility, agentHistory };
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

  if (customer.inCollectionWhitelist) {
    blockers.push("Cliente en lista blanca (cuenta al día)");
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

async function syncCustomerAssignedAgent(
  customerId: string,
  agentUserId: string,
  agentName: string
) {
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      assignedAgentUserId: agentUserId,
      assignedAgentName: agentName,
    },
  });
}

export async function createCollectionAction(
  customerId: string,
  userId: string,
  data: {
    agentUserId?: string;
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

  const agent = await resolveCollectionAgent(data.agentUserId ?? userId);

  const action = await prisma.collectionAction.create({
    data: {
      customerId,
      userId,
      agentUserId: agent.id,
      agentName: agent.name,
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
    include: {
      user: { select: { name: true, role: true } },
      agent: { select: { name: true, role: true } },
    },
  });

  await syncCustomerAssignedAgent(customerId, agent.id, agent.name);

  return action;
}
