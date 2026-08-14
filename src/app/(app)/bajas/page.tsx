import Link from "next/link";
import { listCancellations } from "@/lib/services/cancellations";
import { STATUS_LABELS, REASON_LABELS, COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isDatabaseConnected } from "@/lib/db-status";
import {
  getPreliquidacionListStatus,
  PRELIQUIDACION_LIST_LABELS,
} from "@/lib/preliquidacion-display";

const PRELIQ_BADGE: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-900",
  ENVIADA: "bg-blue-100 text-blue-900",
  APROBADA: "bg-teal-100 text-teal-900",
  RECHAZADA: "bg-red-100 text-red-900",
};

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

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Preliquidación</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {dbOk && !loadError ? (
                    <span>
                      No hay solicitudes de baja registradas.
                      <br />
                      <span className="mt-2 inline-block text-sm">
                        Primero cree un cliente en{" "}
                        <Link href="/clientes" className="font-semibold text-teal-600 hover:underline">
                          Clientes
                        </Link>
                        {canCreate && (
                          <>
                            {" "}
                            y luego pulse{" "}
                            <Link href="/bajas/nueva" className="font-semibold text-teal-600 hover:underline">
                              Iniciar baja
                            </Link>
                          </>
                        )}
                        .
                      </span>
                    </span>
                  ) : (
                    "No se pudieron cargar las solicitudes."
                  )}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const preliqKey = getPreliquidacionListStatus(
                  r.status,
                  r.activePreliquidacion?.status
                );
                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.customer.name}</p>
                      <p className="text-xs text-slate-500">{r.customer.contract}</p>
                    </td>
                    <td className="px-4 py-3">{r.requestDate.toLocaleDateString("es-VE")}</td>
                    <td className="px-4 py-3 text-xs">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRELIQ_BADGE[preliqKey]}`}
                      >
                        {PRELIQUIDACION_LIST_LABELS[preliqKey]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatUsd(Number(r.totalAmount))}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/bajas/${r.id}#preliquidacion`}
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        Ver preliquidación →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
