"use client";

import { useEffect, useState } from "react";
import { COLORS, OPERATION_TYPE_LABELS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface Row {
  id: string;
  operationType: string;
  status: string;
  signedAt: string | null;
  requestDate: string;
  previousPlanName: string;
  newPlanName: string;
  previousMonthlyUsd: string;
  newMonthlyUsd: string;
  newPermanenceEnd: string | null;
  addendumNumber: string | null;
  hasIdentitySelfie?: boolean;
  customer: { name: string; contract: string };
}

export function RenewalsReportSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [operationType, setOperationType] = useState("all");

  function load() {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (dateFrom) q.set("dateFrom", dateFrom);
    if (dateTo) q.set("dateTo", dateTo);
    if (operationType) q.set("operationType", operationType);
    fetch(`/api/reports/renewals?${q}`)
      .then((r) => r.json())
      .then(setRows);
  }

  useEffect(() => {
    load();
  }, []);

  function exportFile(format: "pdf" | "csv") {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (dateFrom) q.set("dateFrom", dateFrom);
    if (dateTo) q.set("dateTo", dateTo);
    if (operationType) q.set("operationType", operationType);
    q.set("format", format);
    window.open(`/api/reports/renewals?${q}`, "_blank");
  }

  return (
    <section className="rounded-xl border bg-white p-5 space-y-4">
      <h2 className="font-semibold" style={{ color: COLORS.navy }}>
        Renovaciones contractuales
      </h2>
      <div className="flex flex-wrap gap-2">
        <select value={operationType} onChange={(e) => setOperationType(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="all">Todas las renovaciones</option>
          <option value="RENOVACION">Solo renovación</option>
          <option value="RENOVACION_CAMBIO_PLAN">Renovación + cambio de plan</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">Estado</option>
          {Object.entries(PLAN_CHANGE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" />
        <button type="button" onClick={load} className="rounded-lg px-3 py-1.5 text-sm text-white" style={{ backgroundColor: COLORS.brand }}>
          Filtrar
        </button>
        <button type="button" onClick={() => exportFile("pdf")} className="rounded-lg border px-3 py-1.5 text-sm">
          Exportar PDF
        </button>
        <button type="button" onClick={() => exportFile("csv")} className="rounded-lg border px-3 py-1.5 text-sm">
          Exportar Excel/CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">Cliente</th>
              <th>Tipo</th>
              <th>Plan ant.</th>
              <th>Plan nuevo</th>
              <th>Precio</th>
              <th>Firma</th>
              <th>Fin permanencia</th>
              <th>Estado</th>
              <th>Documento</th>
              <th>Selfie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2">{r.customer.name}<br /><span className="text-xs text-slate-500">{r.customer.contract}</span></td>
                <td>{OPERATION_TYPE_LABELS[r.operationType] ?? r.operationType}</td>
                <td>{r.previousPlanName}</td>
                <td>{r.newPlanName}</td>
                <td>{formatUsd(Number(r.newMonthlyUsd))}</td>
                <td>{new Date(r.signedAt ?? r.requestDate).toLocaleDateString("es-VE")}</td>
                <td>{r.newPermanenceEnd ? new Date(r.newPermanenceEnd).toLocaleDateString("es-VE") : "—"}</td>
                <td>{PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status}</td>
                <td>{r.addendumNumber ?? "—"}</td>
                <td>
                  {r.hasIdentitySelfie ? (
                    <a
                      href={`/api/plan-changes/${r.id}/adendum`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-teal-700 hover:underline"
                    >
                      Ver PDF
                    </a>
                  ) : (
                    "No"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
