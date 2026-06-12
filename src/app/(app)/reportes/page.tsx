"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/liquidation";
import { STATUS_LABELS } from "@/lib/constants";

export default function ReportesPage() {
  const [bajas, setBajas] = useState<unknown[]>([]);
  const [equipos, setEquipos] = useState<Record<string, number>>({});
  const [valores, setValores] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/reports?type=bajas").then((r) => r.json()).then(setBajas);
    fetch("/api/reports?type=equipos").then((r) => r.json()).then(setEquipos);
    fetch("/api/reports?type=valores").then((r) => r.json()).then(setValores);
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[#0B1F3A]">Reportes</h1>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Equipos recuperados</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Kpi label="Recuperados" value={equipos.recovered ?? 0} />
          <Kpi label="Dañados" value={equipos.damaged ?? 0} />
          <Kpi label="Perdidos" value={equipos.lost ?? 0} />
          <Kpi label="ONU" value={equipos.onu ?? 0} />
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Valores recuperados</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Line label="Permanencia" value={formatUsd(valores.permanence ?? 0)} />
          <Line label="TV" value={formatUsd(valores.tv ?? 0)} />
          <Line label="Equipos" value={formatUsd(valores.equipment ?? 0)} />
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
                <th className="py-2">Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(bajas as { id: string; customer: { name: string }; requestDate: string; totalAmount: string; status: string }[]).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.customer?.name}</td>
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
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
