"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COLORS, OPERATION_TYPE_LABELS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface PlanChangeRow {
  id: string;
  operationType: string;
  addendumNumber: string | null;
  status: string;
  requestDate: string;
  signedAt: string | null;
  previousPlanName: string;
  newPlanName: string;
  previousMonthlyUsd: string;
  newMonthlyUsd: string;
  customer: { contract: string; name: string };
}

export default function GestionContractualPage() {
  const [rows, setRows] = useState<PlanChangeRow[]>([]);
  const [status, setStatus] = useState("");
  const [operationType, setOperationType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (operationType) q.set("operationType", operationType);
    const qs = q.toString();
    fetch(`/api/plan-changes${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, [status, operationType]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: COLORS.navy }}>
            Gestión Contractual
          </h1>
          <p className="text-sm text-slate-500">Cambios de plan y renovaciones de contrato</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cambio-plan/por-renovar"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: COLORS.brand, color: COLORS.brand }}
          >
            Clientes por renovar
          </Link>
          <Link
            href="/cambio-plan/nuevo"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: COLORS.brand }}
          >
            Nueva gestión contractual
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={operationType}
          onChange={(e) => setOperationType(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(OPERATION_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(PLAN_CHANGE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3">Fecha firma / solicitud</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plan anterior</th>
              <th className="px-4 py-3">Nuevo plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No hay operaciones contractuales registradas.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    {new Date(r.signedAt ?? r.requestDate).toLocaleDateString("es-VE")}
                  </td>
                  <td className="px-4 py-3">
                    {OPERATION_TYPE_LABELS[r.operationType] ?? r.operationType}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.customer.name}</div>
                    <div className="text-xs text-slate-500">{r.customer.contract}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.previousPlanName}
                    <div className="text-xs text-slate-500">{formatUsd(Number(r.previousMonthlyUsd))}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.newPlanName}
                    <div className="text-xs text-slate-500">{formatUsd(Number(r.newMonthlyUsd))}</div>
                  </td>
                  <td className="px-4 py-3">{PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status}</td>
                  <td className="px-4 py-3">{r.addendumNumber ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/cambio-plan/${r.id}`} className="text-sm font-medium" style={{ color: COLORS.brand }}>
                      Ver
                    </Link>
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
