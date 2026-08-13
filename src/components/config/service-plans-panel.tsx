"use client";

import { useEffect, useState } from "react";
import { COLORS, DEFAULT_ADDENDUM_DECLARATION } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface ServicePlan {
  id: string;
  name: string;
  speedMbps: number;
  monthlyUsd: string;
  installUsd: string;
  active: boolean;
  sortOrder: number;
}

export function ServicePlansPanel() {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [form, setForm] = useState({
    name: "",
    speedMbps: "",
    monthlyUsd: "",
    installUsd: "0",
  });
  const [msg, setMsg] = useState("");

  function reload() {
    fetch("/api/service-plans")
      .then((r) => r.json())
      .then((data) => (Array.isArray(data) ? setPlans(data) : null));
  }

  useEffect(() => {
    reload();
  }, []);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/service-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        speedMbps: Number(form.speedMbps),
        monthlyUsd: Number(form.monthlyUsd),
        installUsd: Number(form.installUsd),
      }),
    });
    if (!r.ok) {
      setMsg("Error al crear plan");
      return;
    }
    setForm({ name: "", speedMbps: "", monthlyUsd: "", installUsd: "0" });
    setMsg("Plan creado.");
    reload();
  }

  async function toggleActive(plan: ServicePlan) {
    await fetch(`/api/service-plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !plan.active }),
    });
    reload();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold" style={{ color: COLORS.navy }}>
        Catálogo de planes
      </h2>
      {msg && <p className="text-sm text-teal-700">{msg}</p>}
      <form onSubmit={createPlan} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <input
          required
          placeholder="Nombre (ej. 400 Mbps)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          placeholder="Velocidad Mbps"
          value={form.speedMbps}
          onChange={(e) => setForm({ ...form, speedMbps: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          required
          type="number"
          step="0.01"
          placeholder="Precio mensual USD"
          value={form.monthlyUsd}
          onChange={(e) => setForm({ ...form, monthlyUsd: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Instalación USD"
          value={form.installUsd}
          onChange={(e) => setForm({ ...form, installUsd: e.target.value })}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm text-white sm:col-span-2"
          style={{ backgroundColor: COLORS.brand }}
        >
          Agregar plan
        </button>
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Mbps</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">Inst.</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.speedMbps}</td>
                <td className="px-3 py-2">{formatUsd(Number(p.monthlyUsd))}</td>
                <td className="px-3 py-2">{formatUsd(Number(p.installUsd))}</td>
                <td className="px-3 py-2">{p.active ? "Activo" : "Inactivo"}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => toggleActive(p)} className="text-xs text-slate-600 underline">
                    {p.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AddendumTextPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold" style={{ color: COLORS.navy }}>
        Texto del adendum (declaración contractual)
      </h2>
      <textarea
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={DEFAULT_ADDENDUM_DECLARATION}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      <p className="text-xs text-slate-500">
        Este texto aparece en el PDF del adendum. Si se deja vacío, se usa el texto predeterminado.
      </p>
    </div>
  );
}
