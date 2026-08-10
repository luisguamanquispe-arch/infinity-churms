import { prisma } from "@/lib/prisma";
import type { ServiceTechnology } from "@prisma/client";

export const MIGRATION_EVENT_TYPE = "MIGRACION_TECNOLOGICA";

export async function listTechnologyEvents(customerId: string) {
  return prisma.customerTechnologyEvent.findMany({
    where: { customerId },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    include: { user: { select: { name: true } } },
  });
}

export async function registerFiberMigration(
  customerId: string,
  userId: string,
  data: {
    fiberMigrationDate: string;
    notes?: string;
  }
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("NOT_FOUND");

  const migrationDate = new Date(data.fiberMigrationDate);
  if (Number.isNaN(migrationDate.getTime())) throw new Error("DATE_INVALID");

  const fromTechnology = customer.currentTechnology;
  if (fromTechnology === "FIBRA" && customer.originTechnology === "FIBRA") {
    throw new Error("ALREADY_FIBRA");
  }

  const toTechnology: ServiceTechnology = "FIBRA";
  const notes = data.notes?.trim() || "Cliente migrado de radioenlace a fibra.";

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      originTechnology: customer.originTechnology === "FIBRA" ? "FIBRA" : "RADIOENLACE",
      currentTechnology: toTechnology,
      fiberMigrationDate: migrationDate,
      fiberInstallDate: customer.fiberInstallDate ?? migrationDate,
      migrationReviewRequired: false,
    },
  });

  await prisma.customerTechnologyEvent.create({
    data: {
      customerId,
      userId,
      eventType: MIGRATION_EVENT_TYPE,
      fromTechnology,
      toTechnology,
      eventDate: migrationDate,
      notes,
    },
  });

  return updated;
}

export async function updateCustomerTechnologyFields(
  customerId: string,
  data: {
    originTechnology?: ServiceTechnology;
    currentTechnology?: ServiceTechnology;
    fiberInstallDate?: string | null;
    fiberMigrationDate?: string | null;
    migrationReviewRequired?: boolean;
  }
) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("NOT_FOUND");

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(data.originTechnology !== undefined
        ? { originTechnology: data.originTechnology }
        : {}),
      ...(data.currentTechnology !== undefined
        ? { currentTechnology: data.currentTechnology }
        : {}),
      ...(data.fiberInstallDate !== undefined
        ? {
            fiberInstallDate: data.fiberInstallDate
              ? new Date(data.fiberInstallDate)
              : null,
          }
        : {}),
      ...(data.fiberMigrationDate !== undefined
        ? {
            fiberMigrationDate: data.fiberMigrationDate
              ? new Date(data.fiberMigrationDate)
              : null,
          }
        : {}),
      ...(data.migrationReviewRequired !== undefined
        ? { migrationReviewRequired: data.migrationReviewRequired }
        : {}),
    },
  });
}
