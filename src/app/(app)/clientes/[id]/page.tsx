import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { customerHasCancellation } from "@/lib/services/cancellations";
import { getBajaEligibility } from "@/lib/services/collections";
import { prisma } from "@/lib/prisma";
import { CustomerDetailView } from "@/components/clientes/customer-detail";

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

  const detail = {
    ...customer,
    serviceStartDate: customer.serviceStartDate.toISOString(),
    pendingBalance: String(customer.pendingBalance),
    tvStreamingSince: customer.tvStreamingSince?.toISOString() ?? null,
    hasCancellation,
    eligibility,
  };

  return (
    <CustomerDetailView
      initial={detail}
      canCreateBaja={hasPermission(session.role, "cancellations:create")}
    />
  );
}
