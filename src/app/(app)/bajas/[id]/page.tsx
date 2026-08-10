import { getCancellation, getPermanencePreviewForCustomer } from "@/lib/services/cancellations";
import { CancellationDetail } from "@/components/bajas/cancellation-detail";
import { getCancellationPermissions } from "@/lib/cancellation-permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { serializePermanenceSummary } from "@/lib/permanence";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GestionarBajaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await getCancellation(id);
  if (!row) notFound();

  const permanenceRaw = await getPermanencePreviewForCustomer(row.customerId, row.requestDate);
  const permanenceSummary = serializePermanenceSummary(permanenceRaw);

  const detail = {
    ...row,
    requestDate: row.requestDate.toISOString(),
    permanenceStartDate: row.permanenceStartDate?.toISOString() ?? null,
    originTechnology: row.originTechnology,
    currentTechnology: row.currentTechnology,
    fiberInstallPending: row.fiberInstallPending,
    permanenceAmount: String(row.permanenceAmount),
    tvAmount: String(row.tvAmount),
    monthlyAmount: String(row.monthlyAmount),
    equipmentAmount: String(row.equipmentAmount),
    otherAmount: String(row.otherAmount),
    totalAmount: String(row.totalAmount),
    customer: {
      ...row.customer,
      serviceStartDate: row.customer.serviceStartDate.toISOString(),
      pendingBalance: String(row.customer.pendingBalance),
      originTechnology: row.customer.originTechnology,
      currentTechnology: row.customer.currentTechnology,
      fiberInstallDate: row.customer.fiberInstallDate?.toISOString() ?? null,
      fiberMigrationDate: row.customer.fiberMigrationDate?.toISOString() ?? null,
      migrationReviewRequired: row.customer.migrationReviewRequired,
      tvStreamingSince: row.customer.tvStreamingSince?.toISOString() ?? null,
    },
    equipment: row.equipment,
    charges: row.charges.map((c) => ({ ...c, amount: String(c.amount) })),
    payments: row.payments.map((p) => ({
      ...p,
      amountPaid: String(p.amountPaid),
      paymentDate: p.paymentDate.toISOString(),
    })),
  };

  return (
    <CancellationDetail
      initial={detail}
      permissions={getCancellationPermissions(session.role)}
      permanenceSummary={permanenceSummary}
    />
  );
}
