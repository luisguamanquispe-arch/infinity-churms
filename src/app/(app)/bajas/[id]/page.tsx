import { getCancellation, getPermanencePreviewForCustomer } from "@/lib/services/cancellations";
import { CancellationDetail } from "@/components/bajas/cancellation-detail";
import { getCancellationPermissions } from "@/lib/cancellation-permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { serializePermanenceSummary } from "@/lib/permanence";
import { ensureActivePreliquidacion, getActivePreliquidacion } from "@/lib/services/preliquidaciones";
import { isPreApprovalStatus } from "@/lib/preliquidacion-guards";
import { hasPermission } from "@/lib/permissions";
import { serializeCancellationByRole } from "@/lib/serialize-cancellation-by-role";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GestionarBajaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  // Reparar enlace activePreliquidacionId si existe historial pero el puntero quedó nulo.
  try {
    await getActivePreliquidacion(id);
  } catch (e) {
    console.error(`[bajas/${id}] No se pudo reparar activePreliquidacionId:`, e);
  }

  let row = await getCancellation(id);
  if (!row) notFound();

  let preliquidacionError: string | null = null;

  if (
    isPreApprovalStatus(row.status) &&
    !row.activePreliquidacion &&
    (hasPermission(session.role, "cancellations:preliquidate") ||
      hasPermission(session.role, "cancellations:create"))
  ) {
    try {
      await ensureActivePreliquidacion(id, session.userId);
      row = (await getCancellation(id)) ?? row;
    } catch (e) {
      preliquidacionError =
        e instanceof Error
          ? e.message === "PERMANENCE_INCOMPLETE"
            ? "No se pudo generar la preliquidación: falta información de permanencia del cliente."
            : e.message
          : "Error al generar la preliquidación automáticamente.";
    }
  }

  const detail = serializeCancellationByRole(row, session.role);

  const permanenceRaw = await getPermanencePreviewForCustomer(row.customerId, row.requestDate);
  const permanenceSummary = serializePermanenceSummary(permanenceRaw);

  return (
    <CancellationDetail
      initial={detail}
      permissions={getCancellationPermissions(session.role)}
      permanenceSummary={permanenceSummary}
      preliquidacionError={preliquidacionError}
    />
  );
}
