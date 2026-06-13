import { getCancellation } from "@/lib/services/cancellations";
import { CancellationDetail } from "@/components/bajas/cancellation-detail";
import { getCancellationPermissions } from "@/lib/cancellation-permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GestionarBajaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  const row = await getCancellation(id);
  if (!row) notFound();

  const detail = {
    ...row,
    requestDate: row.requestDate.toISOString(),
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
    />
  );
}
