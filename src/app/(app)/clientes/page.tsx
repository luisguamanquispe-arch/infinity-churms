"use client";

import { useEffect, useState } from "react";
import { COLORS, CUSTOMER_ZONES, EQUIPMENT_TYPES, toUpperInput, HAS_STREAMS_SUPPORT_LABEL, STREAMS_SUPPORT_SINCE_LABEL } from "@/lib/constants";
import { normalizeCedula, validateEcuadorianCedula } from "@/lib/cedula";
import { formatUsd } from "@/lib/liquidation";

interface Customer {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  zone: string;
  planName: string;
  status: string;
  pendingBalance: string;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  equipment: { type: string; serial: string | null; brand: string | null; model: string | null }[];
}

const emptyForm = {
  contract: "",
  name: "",
  cedula: "",
  address: "",
  zone: "",
  planName: "",
  serviceStartDate: new Date().toISOString().slice(0, 10),
  pendingBalance: "0",
  hasTvStreaming: false,
  tvStreamingSince: "",
  equipment: [] as { type: string; serial: string; brand: string; model: string }[],
};

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingBalance, setEditingBalance] = useState<{ id: string; value: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [cedulaError, setCedulaError] = useState("");

  async function load() {
    const res = await fetch("/api/customers?all=1");
    if (res.ok) setCustomers(await res.json());
  }

  useEffect(() => {
    let active = true;
    fetch("/api/customers?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active) setCustomers(data);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateUpper<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: toUpperInput(value) }));
  }

  function updateCedula(value: string) {
    const cedula = normalizeCedula(value);
    setForm((prev) => ({ ...prev, cedula }));
    if (cedula.length === 10) {
      setCedulaError(validateEcuadorianCedula(cedula) ? "" : "Cédula inválida: revise el dígito verificador");
    } else {
      setCedulaError(cedula.length > 0 ? "La cédula debe tener 10 dígitos" : "");
    }
  }

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (form.hasTvStreaming && !form.tvStreamingSince) {
      setMsg("Indique la fecha de inicio del soporte de Streams");
      return;
    }
    if (!form.zone) {
      setMsg("Seleccione la zona del cliente");
      return;
    }
    if (!validateEcuadorianCedula(form.cedula)) {
      setMsg("Cédula ecuatoriana inválida. Verifique los 10 dígitos y el dígito verificador");
      return;
    }
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        pendingBalance: parseFloat(form.pendingBalance),
        tvStreamingSince: form.hasTvStreaming ? form.tvStreamingSince : null,
        equipment: form.equipment.filter((eq) => eq.type && (eq.serial || eq.brand || eq.model)),
      }),
    });
    if (res.ok) {
      setMsg("Cliente creado");
      setForm(emptyForm);
      setCedulaError("");
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
      setMsg("Saldo actualizado");
      setEditingBalance(null);
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Clientes</h1>
          <p className="text-sm text-slate-500">Maestro por contrato y saldo pendiente</p>
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
            <Input label="Contrato *" value={form.contract} onChange={(v) => updateUpper("contract", v)} uppercase required />
            <Input label="Nombre *" value={form.name} onChange={(v) => updateUpper("name", v)} uppercase required />
            <CedulaInput
              label="Cédula *"
              value={form.cedula}
              onChange={updateCedula}
              error={cedulaError}
              required
            />
            <div>
              <label className="text-xs text-slate-600">Zona *</label>
              <select
                value={form.zone}
                required
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm uppercase"
              >
                <option value="">Seleccione zona</option>
                {CUSTOMER_ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <Input label="Plan *" value={form.planName} onChange={(v) => updateUpper("planName", v)} uppercase required />
            <Input label="Dirección *" value={form.address} onChange={(v) => updateUpper("address", v)} uppercase required />
            <Input label="Fecha alta *" type="date" value={form.serviceStartDate} onChange={(v) => setForm({ ...form, serviceStartDate: v })} required />
            <Input label="Saldo pendiente" type="number" value={form.pendingBalance} onChange={(v) => setForm({ ...form, pendingBalance: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.hasTvStreaming}
              onChange={(e) => setForm({ ...form, hasTvStreaming: e.target.checked, tvStreamingSince: e.target.checked ? form.tvStreamingSince : "" })}
            />
            {HAS_STREAMS_SUPPORT_LABEL}
          </label>
          {form.hasTvStreaming && (
            <Input
              label={`${STREAMS_SUPPORT_SINCE_LABEL} *`}
              type="date"
              value={form.tvStreamingSince}
              onChange={(v) => setForm({ ...form, tvStreamingSince: v })}
              required
            />
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Equipos <span className="font-normal text-slate-500">(opcional)</span></p>
            {form.equipment.length === 0 && (
              <p className="text-xs text-slate-500">Puede omitir equipos y registrarlos después en la baja.</p>
            )}
            {form.equipment.map((eq, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-5">
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
                <input placeholder="Marca" value={eq.brand} onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, brand: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }} className="rounded border px-2 py-1 text-sm uppercase" />
                <input placeholder="Modelo" value={eq.model} onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, model: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }} className="rounded border px-2 py-1 text-sm uppercase" />
                <input placeholder="Serie" value={eq.serial} onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, serial: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }} className="rounded border px-2 py-1 text-sm uppercase" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, equipment: form.equipment.filter((_, j) => j !== i) })}
                  className="text-xs text-red-600"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, equipment: [...form.equipment, { type: "ONU", serial: "", brand: "", model: "" }] })}
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
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Streams desde</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Equipos</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.contract}</td>
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 text-slate-500">{c.zone ?? "—"}</td>
                <td className="px-4 py-3">{c.planName}</td>
                <td className="px-4 py-3 text-slate-500">
                  {c.hasTvStreaming && c.tvStreamingSince
                    ? new Date(c.tvStreamingSince).toLocaleDateString("es-VE")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {editingBalance?.id === c.id ? (
                    <div className="flex gap-1">
                      <input type="number" value={editingBalance.value} onChange={(e) => setEditingBalance({ id: c.id, value: e.target.value })} className="w-24 rounded border px-2 py-1" />
                      <button onClick={saveBalance} className="text-xs text-teal-700">OK</button>
                    </div>
                  ) : (
                    formatUsd(Number(c.pendingBalance))
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {c.equipment.length > 0
                    ? c.equipment.map((e) => `${e.type}${e.brand ? ` (${e.brand})` : ""}`).join(", ")
                    : "Sin registrar"}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditingBalance({ id: c.id, value: String(c.pendingBalance) })} className="text-xs text-teal-700 hover:underline">
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
  uppercase,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  uppercase?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded border px-2 py-1.5 text-sm${uppercase ? " uppercase" : ""}`}
      />
    </div>
  );
}

function CedulaInput({
  label,
  value,
  onChange,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder="10 dígitos"
        className={`mt-1 w-full rounded border px-2 py-1.5 text-sm ${error ? "border-red-400" : ""}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
