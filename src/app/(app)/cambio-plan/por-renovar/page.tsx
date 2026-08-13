"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { ELIGIBILITY_LABELS, type CustomerContractSummary } from "@/lib/contract-eligibility";

const FILTERS = [
  { value: "elegibles", label: "Elegibles" },
  { value: "todos", label: "Todos" },
  { value: "por_vencer", label: "Por vencer" },
  { value: "vencidos", label: "Vencidos" },
  { value: "permanencia_cumplida", label: "Permanencia cumplida" },
  { value: "pendiente", label: "Renovación pendiente" },
  { value: "renovados", label: "Renovados" },
];

export default function ClientesPorRenovarPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("elegibles");
  const [rows, setRows] = useState<CustomerContractSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/contractual/eligible-customers?filter=${filter}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
        else setError(data.error ?? "Error al cargar");
      })
      .finally(() => setLoading(false));
  }, [filter]);

  async function startRenewal(customerId: string, withPlanChange: boolean) {
    const operationType = withPlanChange ? "RENOVACION_CAMBIO_PLAN" : "RENOVACION";
    router.push(`/cambio-plan/nuevo?customerId=${customerId}&operationType=${operationType}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/cambio-plan" className="text-sm text-slate-500 hover:underline">← Volver</Link>
        <h1 className="text-2xl font-bold" style={{ color: COLORS.navy }}>Clientes por renovar</h1>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f.value ? "text-white" : "border bg-white text-slate-600"
            }`}
            style={filter === f.value ? { backgroundColor: COLORS.brand } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Inicio</th>
              <th className="px-4 py-3">Fin</th>
              <th className="px-4 py-3">Días rest.</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Alerta</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Sin resultados.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.customerId} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.contract} · {r.cedula}</div>
                  </td>
                  <td className="px-4 py-3">{r.planName}</td>
                  <td className="px-4 py-3">{r.monthlyUsd != null ? formatUsd(r.monthlyUsd) : "—"}</td>
                  <td className="px-4 py-3">{new Date(r.permanenceStart).toLocaleDateString("es-VE")}</td>
                  <td className="px-4 py-3">{new Date(r.permanenceEnd).toLocaleDateString("es-VE")}</td>
                  <td className="px-4 py-3">{r.daysRemaining}</td>
                  <td className="px-4 py-3">{ELIGIBILITY_LABELS[r.eligibilityStatus]}</td>
                  <td className="px-4 py-3">
                    {r.renewalAlert ? (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {r.renewalAlert}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {r.pendingOperationId ? (
                        <Link
                          href={`/cambio-plan/${r.pendingOperationId}`}
                          className="text-xs font-medium"
                          style={{ color: COLORS.brand }}
                        >
                          Ver pendiente
                        </Link>
                      ) : r.eligibleForRenewal ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startRenewal(r.customerId, false)}
                            className="text-xs font-medium underline"
                            style={{ color: COLORS.brand }}
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            onClick={() => startRenewal(r.customerId, true)}
                            className="text-xs font-medium underline text-slate-600"
                          >
                            Renovar + plan
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
