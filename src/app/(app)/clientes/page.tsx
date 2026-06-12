"use client";

import { useEffect, useState } from "react";
import { COLORS, EQUIPMENT_TYPES } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface Customer {
  id: string;
  code: string;
  name: string;
  cedula: string;
  address: string;
  planName: string;
  status: string;
  pendingBalance: string;
  hasTvStreaming: boolean;
  equipment: { type: string; serial: string | null }[];
}

const emptyForm = {
  code: "",
  name: "",
  cedula: "",
  address: "",
  planName: "",
  serviceStartDate: new Date().toISOString().slice(0, 10),
  pendingBalance: "0",
  hasTvStreaming: false,
  equipment: [{ type: "ONU", serial: "" }],
};

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingBalance, setEditingBalance] = useState<{ id: string; value: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/customers?all=1");
    if (res.ok) setCustomers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        pendingBalance: parseFloat(form.pendingBalance),
        equipment: form.equipment.filter((eq) => eq.type),
      }),
    });
    if (res.ok) {
      setMsg("Cliente creado");
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } else {
      const err = await res.json();
      setMsg(err.error ?? "Error");
    }
  }

  async function saveBalance() {
    if (!editingBalance) return;
    const res = await fetch(`/api/customers/${editingBalance.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingBalance: parseFloat(editingBalance.value) }),
    });
    if (res.ok) {
      setMsg("Saldo actualizado (cartera sincronizada)");
      setEditingBalance(null);
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Clientes</h1>
          <p className="text-sm text-slate-500">Maestro de clientes y saldo pendiente (cartera)</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: COLORS.brand }}
        >
          {showForm ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </header>

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      {showForm && (
        <form onSubmit={createCustomer} className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold">Nuevo cliente</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Código" value={form.code} onChange={(v) => setForm({ ...form, code: v })} required />
            <Input label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Input label="Cédula" value={form.cedula} onChange={(v) => setForm({ ...form, cedula: v })} required />
            <Input label="Plan" value={form.planName} onChange={(v) => setForm({ ...form, planName: v })} required />
            <Input label="Dirección" value={form.address} onChange={(v) => setForm({ ...form, address: v })} required />
            <Input label="Fecha alta" type="date" value={form.serviceStartDate} onChange={(v) => setForm({ ...form, serviceStartDate: v })} required />
            <Input label="Saldo pendiente" type="number" value={form.pendingBalance} onChange={(v) => setForm({ ...form, pendingBalance: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hasTvStreaming}
              onChange={(e) => setForm({ ...form, hasTvStreaming: e.target.checked })}
            />
            Tiene TV Streams
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">Equipos</p>
            {form.equipment.map((eq, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={eq.type}
                  onChange={(e) => {
                    const equipment = [...form.equipment];
                    equipment[i] = { ...eq, type: e.target.value };
                    setForm({ ...form, equipment });
                  }}
                  className="rounded border px-2 py-1 text-sm"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  placeholder="Serie"
                  value={eq.serial}
                  onChange={(e) => {
                    const equipment = [...form.equipment];
                    equipment[i] = { ...eq, serial: e.target.value };
                    setForm({ ...form, equipment });
                  }}
                  className="flex-1 rounded border px-2 py-1 text-sm"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, equipment: [...form.equipment, { type: "ROUTER", serial: "" }] })}
              className="text-xs text-teal-700"
            >
              + Equipo
            </button>
          </div>
          <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">
            Guardar cliente
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Saldo pendiente</th>
              <th className="px-4 py-3">Equipos</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.code}</td>
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3">{c.planName}</td>
                <td className="px-4 py-3">
                  {editingBalance?.id === c.id ? (
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={editingBalance.value}
                        onChange={(e) => setEditingBalance({ id: c.id, value: e.target.value })}
                        className="w-24 rounded border px-2 py-1"
                      />
                      <button onClick={saveBalance} className="text-xs text-teal-700">OK</button>
                    </div>
                  ) : (
                    formatUsd(Number(c.pendingBalance))
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {c.equipment.map((e) => e.type).join(", ")}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setEditingBalance({ id: c.id, value: String(c.pendingBalance) })}
                    className="text-xs text-teal-700 hover:underline"
                  >
                    Editar saldo
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

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
      />
    </div>
  );
}
