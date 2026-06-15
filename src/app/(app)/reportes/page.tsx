"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/liquidation";
import { STATUS_LABELS, INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL } from "@/lib/constants";

interface EquipoRow {
  contract: string;
  customerName: string;
  cedula: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  delivered: boolean;
  condition: string | null;
  cancellationStatus: string;
}

interface CausaRow {
  id: string;
  contract: string;
  customerName: string;
  reasonLabel: string;
  closeDate: string | null;
  totalAmount: string;
  planName: string;
}

export default function ReportesPage() {
  const [bajas, setBajas] = useState<unknown[]>([]);
  const [equipos, setEquipos] = useState<{ recovered: number; damaged: number; lost: number; items: EquipoRow[] }>({ recovered: 0, damaged: 0, lost: 0, items: [] });
  const [valores, setValores] = useState<Record<string, number>>({});
  const [causas, setCausas] = useState<{ rows: CausaRow[]; byReason: { label: string; count: number }[] } | null>(null);
  const [role, setRole] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((u) => setRole(u.role ?? ""));
    fetch("/api/reports?type=bajas").then((r) => r.json()).then(setBajas);
    fetch("/api/reports?type=equipos").then((r) => r.json()).then(setEquipos);
    fetch("/api/reports?type=valores").then((r) => r.json()).then(setValores);
    fetch("/api/reports?type=causas")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCausas);
  }, []);

  const isGerencia = role === "ADMIN" || role === "SUPERVISOR";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[#0B1F3A]">Reportes</h1>

      {isGerencia && causas && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Análisis de causas de retiro (bajas cerradas)</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {causas.byReason.map((r) => (
              <div key={r.label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xl font-bold">{r.count}</p>
                <p className="text-xs text-slate-600">{r.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Contrato</th>
                  <th>Cliente</th>
                  <th>Plan</th>
                  <th>Motivo</th>
                  <th>Cierre</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {causas.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 font-medium">{r.contract}</td>
                    <td>{r.customerName}</td>
                    <td>{r.planName}</td>
                    <td>{r.reasonLabel}</td>
                    <td>{r.closeDate ? new Date(r.closeDate).toLocaleDateString("es-VE") : "—"}</td>
                    <td>{formatUsd(Number(r.totalAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Equipos recuperados por contrato / cliente</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Kpi label="Recuperados (bueno)" value={equipos.recovered ?? 0} />
          <Kpi label="Dañados" value={equipos.damaged ?? 0} />
          <Kpi label="No entregados" value={equipos.lost ?? 0} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Contrato</th>
                <th>Cliente</th>
                <th>Cédula</th>
                <th>Equipo</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Serie</th>
                <th>Estado</th>
                <th>Baja</th>
              </tr>
            </thead>
            <tbody>
              {(equipos.items ?? []).map((i, idx) => (
                <tr key={`${i.contract}-${i.type}-${idx}`} className="border-t">
                  <td className="py-2 font-medium">{i.contract}</td>
                  <td>{i.customerName}</td>
                  <td>{i.cedula}</td>
                  <td>{i.type}</td>
                  <td>{i.brand ?? "—"}</td>
                  <td>{i.model ?? "—"}</td>
                  <td>{i.serial ?? "—"}</td>
                  <td>{i.delivered ? (i.condition ?? "BUENO") : "NO ENTREGADO"}</td>
                  <td>{STATUS_LABELS[i.cancellationStatus] ?? i.cancellationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Valores recuperados</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Line label={INSTALLATION_PRORATION_LABEL} value={formatUsd(valores.permanence ?? 0)} />
          <Line label={STREAMS_SUPPORT_LABEL} value={formatUsd(valores.tv ?? 0)} />
          <Line label="Mensualidades" value={formatUsd(valores.monthly ?? 0)} />
          <Line label="Total" value={formatUsd(valores.total ?? 0)} />
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Reporte de bajas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Contrato</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(bajas as { id: string; customer: { name: string; contract: string }; requestDate: string; totalAmount: string; status: string }[]).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.customer?.contract}</td>
                  <td>{r.customer?.name}</td>
                  <td>{new Date(r.requestDate).toLocaleDateString("es-VE")}</td>
                  <td>{formatUsd(Number(r.totalAmount))}</td>
                  <td>{STATUS_LABELS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span>{label}</span><span className="font-medium">{value}</span></div>;
}
