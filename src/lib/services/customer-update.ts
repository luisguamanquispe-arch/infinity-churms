import { prisma } from "@/lib/prisma";
import { formatCustomerPayload, validateCustomerInput, extractPlanFields } from "@/lib/customer-form";
import { resolveOverdueSinceOnBalanceChange } from "@/lib/services/overdue";
import { resolveCollectionAgent } from "@/lib/services/collections";
import type { Customer, EquipmentType, Prisma, ServiceTechnology } from "@prisma/client";

export type CustomerEquipmentInput = {
  id?: string;
  type: string;
  serial?: string;
  brand?: string;
  model?: string;
};

export type CustomerPatchBody = {
  contract?: string;
  name?: string;
  cedula?: string;
  address?: string;
  zone?: string;
  phone?: string | null;
  planName?: string;
  planSpeedMbps?: number | string | null;
  planMonthlyUsd?: number | string | null;
  offeredPlanName?: string | null;
  offeredPlanSpeedMbps?: number | string | null;
  offeredPlanMonthlyUsd?: number | string | null;
  status?: string;
  serviceStartDate?: string;
  originTechnology?: string;
  currentTechnology?: string;
  fiberInstallDate?: string | null;
  fiberMigrationDate?: string | null;
  migrationReviewRequired?: boolean;
  hasTvStreaming?: boolean;
  tvStreamingSince?: string | null;
  pendingBalance?: number;
  overdueSince?: string | null;
  openTechnicalClaim?: boolean;
  inCollectionWhitelist?: boolean;
  assignedAgentUserId?: string | null;
  equipment?: CustomerEquipmentInput[];
};

function parseTechnology(value: string | undefined): ServiceTechnology | undefined {
  if (value === undefined) return undefined;
  return value === "RADIOENLACE" ? "RADIOENLACE" : "FIBRA";
}

export async function prepareCustomerUpdate(
  existing: Customer,
  patch: CustomerPatchBody
): Promise<{ data: Prisma.CustomerUncheckedUpdateInput; error?: string }> {
  const formatted = formatCustomerPayload({
    contract: patch.contract ?? existing.contract,
    name: patch.name ?? existing.name,
    cedula: patch.cedula ?? existing.cedula,
    address: patch.address ?? existing.address,
    zone: patch.zone ?? existing.zone,
    planName: patch.planName ?? existing.planName,
    phone: patch.phone ?? existing.phone ?? undefined,
    equipment: patch.equipment,
  });

  const validationError = validateCustomerInput(formatted);
  if (validationError) return { data: {}, error: validationError };

  if (formatted.contract !== existing.contract) {
    const duplicate = await prisma.customer.findUnique({
      where: { contract: formatted.contract },
    });
    if (duplicate && duplicate.id !== existing.id) {
      return { data: {}, error: "Ya existe un cliente con ese número de contrato" };
    }
  }

  const originTechnology =
    parseTechnology(patch.originTechnology) ?? existing.originTechnology;
  const currentTechnology =
    parseTechnology(patch.currentTechnology) ?? existing.currentTechnology;

  if (
    patch.hasTvStreaming ||
    (patch.hasTvStreaming === undefined && existing.hasTvStreaming)
  ) {
    const tvSince = patch.tvStreamingSince ?? existing.tvStreamingSince?.toISOString().slice(0, 10);
    const hasTv = patch.hasTvStreaming ?? existing.hasTvStreaming;
    if (hasTv && !tvSince) {
      return { data: {}, error: "Indique la fecha de inicio del soporte de Streams" };
    }
  }

  if (
    originTechnology === "RADIOENLACE" &&
    currentTechnology === "FIBRA" &&
    !(patch.fiberMigrationDate ?? existing.fiberMigrationDate)
  ) {
    return {
      data: {},
      error: "Indique la fecha de migración a fibra para clientes migrados de radioenlace",
    };
  }

  const data: Prisma.CustomerUncheckedUpdateInput = {
    contract: formatted.contract,
    name: formatted.name,
    cedula: formatted.cedula,
    address: formatted.address,
    zone: formatted.zone,
    planName: formatted.planName,
    phone: formatted.phone,
    ...extractPlanFields({
      planSpeedMbps: patch.planSpeedMbps ?? existing.planSpeedMbps,
      planMonthlyUsd:
        patch.planMonthlyUsd ??
        (existing.planMonthlyUsd != null ? Number(existing.planMonthlyUsd) : null),
      offeredPlanName: patch.offeredPlanName ?? existing.offeredPlanName,
      offeredPlanSpeedMbps: patch.offeredPlanSpeedMbps ?? existing.offeredPlanSpeedMbps,
      offeredPlanMonthlyUsd:
        patch.offeredPlanMonthlyUsd ??
        (existing.offeredPlanMonthlyUsd != null ? Number(existing.offeredPlanMonthlyUsd) : null),
    }),
  };

  if (patch.status !== undefined) {
    data.status = patch.status.trim().toUpperCase() || "ACTIVO";
  }
  if (patch.serviceStartDate !== undefined) {
    data.serviceStartDate = new Date(patch.serviceStartDate);
  }
  if (patch.originTechnology !== undefined) {
    data.originTechnology = originTechnology;
  }
  if (patch.currentTechnology !== undefined) {
    data.currentTechnology = currentTechnology;
  }
  if (patch.fiberInstallDate !== undefined) {
    data.fiberInstallDate = patch.fiberInstallDate ? new Date(patch.fiberInstallDate) : null;
  }
  if (patch.fiberMigrationDate !== undefined) {
    const migrationDate = patch.fiberMigrationDate ? new Date(patch.fiberMigrationDate) : null;
    data.fiberMigrationDate = migrationDate;
    if (migrationDate && originTechnology === "RADIOENLACE") {
      data.currentTechnology = "FIBRA";
      if (patch.fiberInstallDate === undefined && !existing.fiberInstallDate) {
        data.fiberInstallDate = migrationDate;
      }
      data.migrationReviewRequired = false;
    }
  }
  if (patch.migrationReviewRequired !== undefined) {
    data.migrationReviewRequired = Boolean(patch.migrationReviewRequired);
  } else if (
    originTechnology === "RADIOENLACE" &&
    currentTechnology === "FIBRA" &&
    !(patch.fiberMigrationDate ?? existing.fiberMigrationDate)
  ) {
    data.migrationReviewRequired = true;
  }

  if (patch.hasTvStreaming !== undefined) {
    data.hasTvStreaming = Boolean(patch.hasTvStreaming);
    if (!patch.hasTvStreaming) data.tvStreamingSince = null;
  }
  if (patch.tvStreamingSince !== undefined) {
    const hasTv = patch.hasTvStreaming ?? existing.hasTvStreaming;
    data.tvStreamingSince =
      hasTv && patch.tvStreamingSince ? new Date(patch.tvStreamingSince) : null;
  }

  if (patch.pendingBalance !== undefined) {
    data.pendingBalance = patch.pendingBalance;
    const newBalance = Number(patch.pendingBalance);
    data.overdueSince = resolveOverdueSinceOnBalanceChange(
      Number(existing.pendingBalance),
      newBalance,
      existing.overdueSince
    );
    if (newBalance > 0) {
      data.inCollectionWhitelist = false;
    } else if (newBalance <= 0) {
      data.inCollectionWhitelist = true;
      data.overdueSince = null;
    }
  }
  if (patch.overdueSince !== undefined) {
    data.overdueSince = patch.overdueSince ? new Date(patch.overdueSince) : null;
  }
  if (patch.inCollectionWhitelist !== undefined) {
    data.inCollectionWhitelist = Boolean(patch.inCollectionWhitelist);
  }
  if (patch.openTechnicalClaim !== undefined) {
    data.openTechnicalClaim = Boolean(patch.openTechnicalClaim);
  }

  if (patch.assignedAgentUserId !== undefined) {
    if (!patch.assignedAgentUserId) {
      data.assignedAgentUserId = null;
      data.assignedAgentName = null;
    } else {
      try {
        const agent = await resolveCollectionAgent(patch.assignedAgentUserId);
        data.assignedAgentUserId = agent.id;
        data.assignedAgentName = agent.name;
      } catch {
        return { data: {}, error: "Agente de cobranza no válido" };
      }
    }
  }

  return { data };
}

export async function syncCustomerEquipment(
  customerId: string,
  equipment: CustomerEquipmentInput[] | undefined,
  formattedEquipment: ReturnType<typeof formatCustomerPayload>["equipment"]
) {
  if (!equipment) return;

  const existing = await prisma.customerEquipment.findMany({ where: { customerId } });
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set<string>();

  for (let i = 0; i < equipment.length; i++) {
    const row = equipment[i];
    const fmt = formattedEquipment[i];
    if (!row.type) continue;

    const payload = {
      type: row.type as EquipmentType,
      serial: fmt?.serial?.trim() || null,
      brand: fmt?.brand?.trim() || null,
      model: fmt?.model?.trim() || null,
    };

    if (row.id && existingIds.has(row.id)) {
      await prisma.customerEquipment.update({ where: { id: row.id }, data: payload });
      keptIds.add(row.id);
    } else {
      const created = await prisma.customerEquipment.create({
        data: { customerId, ...payload },
      });
      keptIds.add(created.id);
    }
  }

  const toRemove = existing.filter((e) => !keptIds.has(e.id));
  for (const item of toRemove) {
    const inUse = await prisma.cancellationEquipment.findFirst({
      where: { equipmentId: item.id },
    });
    if (!inUse) {
      await prisma.customerEquipment.delete({ where: { id: item.id } });
    }
  }
}
