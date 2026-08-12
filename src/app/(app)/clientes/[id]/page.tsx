import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { customerHasCancellation } from "@/lib/services/cancellations";
import { getBajaEligibility } from "@/lib/services/collections";
import { CustomerDetailView } from "@/components/clientes/customer-detail";
import { isPrelegalOverdue } from "@/lib/services/overdue";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClienteDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { equipment: true },
  });
  if (!customer) notFound();

  const hasCancellation = await customerHasCancellation(id);
  const eligibility = await getBajaEligibility(id);

  const [equipmentTariffs] = await Promise.all([
    prisma.equipmentTariff.findMany(),
  ]);

  const detail = {
    ...customer,
    phone: customer.phone,
    serviceStartDate: customer.serviceStartDate.toISOString(),
    pendingBalance: String(customer.pendingBalance),
    overdueSince: customer.overdueSince?.toISOString() ?? null,
    inCollectionWhitelist: customer.inCollectionWhitelist,
    assignedAgentUserId: customer.assignedAgentUserId,
    assignedAgentName: customer.assignedAgentName,
    originTechnology: customer.originTechnology,
    currentTechnology: customer.currentTechnology,
    fiberInstallDate: customer.fiberInstallDate?.toISOString() ?? null,
    fiberMigrationDate: customer.fiberMigrationDate?.toISOString() ?? null,
    migrationReviewRequired: customer.migrationReviewRequired,
    tvStreamingSince: customer.tvStreamingSince?.toISOString() ?? null,
    hasCancellation,
    eligibility,
    prelegalOverdue: isPrelegalOverdue({
      pendingBalance: Number(customer.pendingBalance),
      overdueSince: customer.overdueSince,
    }),
  };

  return (
    <CustomerDetailView
      initial={detail}
      canCreateBaja={hasPermission(session.role, "cancellations:create")}
      equipmentTariffs={equipmentTariffs.map((t) => ({
        type: t.type,
        notReturnedUsd: Number(t.notReturnedUsd),
      }))}
    />
  );
}
