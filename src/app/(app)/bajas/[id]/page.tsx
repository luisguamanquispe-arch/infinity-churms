import { getCancellation, getPermanencePreviewForCustomer } from "@/lib/services/cancellations";
import { CancellationDetail } from "@/components/bajas/cancellation-detail";
import { getCancellationPermissions } from "@/lib/cancellation-permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { serializePermanenceSummary } from "@/lib/permanence";
import { ensureActivePreliquidacion } from "@/lib/services/preliquidaciones";
import { isPreApprovalStatus } from "@/lib/preliquidacion-guards";
import { hasPermission } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GestionarBajaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  let row = await getCancellation(id);
  if (!row) notFound();

  if (
    isPreApprovalStatus(row.status) &&
    !row.activePreliquidacion &&
    hasPermission(session.role, "cancellations:preliquidate")
  ) {
    try {
      await ensureActivePreliquidacion(id, session.userId);
      row = (await getCancellation(id)) ?? row;
    } catch {
      // Si falla la auto-generación, la UI permite generar manualmente.
    }
  }

  const { withdrawalRequestFileData: _archivedPdf, ...rowSafe } = row;

  const permanenceRaw = await getPermanencePreviewForCustomer(row.customerId, row.requestDate);
  const permanenceSummary = serializePermanenceSummary(permanenceRaw);

  const detail = {
    ...rowSafe,
    requestDate: row.requestDate.toISOString(),
    closeDate: row.closeDate?.toISOString() ?? null,
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
    withdrawalRequestFileName: row.withdrawalRequestFileName,
    withdrawalRequestUploadedAt: row.withdrawalRequestUploadedAt?.toISOString() ?? null,
    customer: {
      ...row.customer,
      phone: row.customer.phone,
      serviceStartDate: row.customer.serviceStartDate.toISOString(),
      pendingBalance: String(row.customer.pendingBalance),
      planMonthlyUsd: row.customer.planMonthlyUsd != null ? String(row.customer.planMonthlyUsd) : null,
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
    activePreliquidacion: row.activePreliquidacion
      ? {
          ...row.activePreliquidacion,
          totalAmount: String(row.activePreliquidacion.totalAmount),
          creditsAmount: String(row.activePreliquidacion.creditsAmount),
          subtotal: String(row.activePreliquidacion.subtotal),
          rejectedAt: row.activePreliquidacion.rejectedAt?.toISOString() ?? null,
          approvedAt: row.activePreliquidacion.approvedAt?.toISOString() ?? null,
          lineItems: row.activePreliquidacion.lineItems.map((l) => ({
            ...l,
            amount: String(l.amount),
          })),
          approvalTokens: row.activePreliquidacion.approvalTokens.map((t) => ({
            ...t,
            expiresAt: t.expiresAt.toISOString(),
            sentAt: t.sentAt?.toISOString() ?? null,
            openedAt: t.openedAt?.toISOString() ?? null,
          })),
        }
      : null,
    finalLiquidations: row.finalLiquidations.map((fl) => ({
      ...fl,
      totalAmount: String(fl.totalAmount),
      equipmentAdjustment: String(fl.equipmentAdjustment),
      preliquidacionTotal: String(fl.preliquidacionTotal),
      signedAt: fl.signedAt?.toISOString() ?? null,
      clientSignature: fl.clientSignature,
      signatureMode: fl.signatureMode,
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
