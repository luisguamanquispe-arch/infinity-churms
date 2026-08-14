import Link from "next/link";
import { listCancellations } from "@/lib/services/cancellations";
import { COLORS } from "@/lib/constants";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isDatabaseConnected } from "@/lib/db-status";
import { BajasListPanel } from "@/components/bajas/bajas-list-panel";

export default async function BajasPage() {
  const session = await getSession();
  const canCreate = session ? hasPermission(session.role, "cancellations:create") : false;

  const dbOk = await isDatabaseConnected();
  let rows: Awaited<ReturnType<typeof listCancellations>> = [];
  let loadError = false;

  if (dbOk) {
    try {
      rows = await listCancellations();
    } catch {
      loadError = true;
    }
  }

  const initialRows = rows.map((r) => ({
    id: r.id,
    requestDate: r.requestDate.toISOString(),
    reason: r.reason,
    status: r.status,
    totalAmount: String(r.totalAmount),
    customer: r.customer,
    activePreliquidacion: r.activePreliquidacion,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Solicitudes de Baja</h1>
          <p className="mt-1 text-sm text-slate-600">
            Toda baja requiere preliquidación aprobada por el cliente antes de continuar.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/bajas/nueva"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: COLORS.brand }}
          >
            Iniciar baja
          </Link>
        )}
      </header>

      {!dbOk && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          No hay conexión con PostgreSQL. Verifique que DATABASE_URL esté configurada en el servidor y ejecute{" "}
          <code className="rounded bg-red-100 px-1">npm run render:deploy</code> o{" "}
          <code className="rounded bg-red-100 px-1">npm run db:seed</code>.
        </p>
      )}

      {loadError && dbOk && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Error al cargar las bajas. Es posible que falte una migración de base de datos. Vuelva a desplegar la
          aplicación o contacte al administrador.
        </p>
      )}

      <BajasListPanel
        canCreate={canCreate}
        dbOk={dbOk}
        initialRows={initialRows}
        loadError={loadError}
      />
    </div>
  );
}
