"use client";

import { useEffect, useState } from "react";
import {
  COLLECTION_CHARGE_TYPES,
  COLLECTION_CHARGE_TYPE_LABELS,
  COLORS,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import {
  formatChargeDetail,
  monthInputFromDate,
} from "@/lib/services/collection-charges";

interface CollectionCharge {
  id: string;
  chargeType: string;
  description: string | null;
  periodLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  amount: string;
  user: { name: string };
}

const emptyForm = {
  chargeType: "CONSUMO_MENSUAL" as string,
  amount: "",
  description: "",
  periodLabel: "",
  periodFrom: "",
  periodTo: "",
};

export function CollectionChargesPanel({
  customerId,
  pendingBalance,
  onUpdated,
}: {
  customerId: string;
  pendingBalance: string;
  onUpdated: (data: {
    pendingBalance: string;
    overdueSince: string | null;
    inCollectionWhitelist: boolean;
  }) => void;
}) {
  const [charges, setCharges] = useState<CollectionCharge[]>([]);
  const [totalDetail, setTotalDetail] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadCharges() {
    const res = await fetch(`/api/customers/${customerId}/charges`);
    if (!res.ok) return;
    const json = await res.json();
    setCharges(json.charges ?? []);
    setTotalDetail(json.totalCharges ?? 0);
  }

  useEffect(() => {
    loadCharges();
  }, [customerId]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(charge: CollectionCharge) {
    setEditingId(charge.id);
    setForm({
      chargeType: charge.chargeType,
      amount: String(charge.amount),
      description: charge.description ?? "",
      periodLabel: charge.periodLabel ?? "",
      periodFrom: monthInputFromDate(charge.periodFrom),
      periodTo: monthInputFromDate(charge.periodTo),
    });
  }

  function applyResponse(json: {
    charges: CollectionCharge[];
    totalCharges: number;
    pendingBalance: string;
    overdueSince?: string | null;
    inCollectionWhitelist?: boolean;
  }) {
    setCharges(json.charges ?? []);
    setTotalDetail(json.totalCharges ?? 0);
    onUpdated({
      pendingBalance: json.pendingBalance,
      overdueSince: json.overdueSince ?? null,
      inCollectionWhitelist: json.inCollectionWhitelist ?? false,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");

    const payload = {
      chargeType: form.chargeType,
      amount: parseFloat(form.amount),
      description: form.description || undefined,
      periodLabel: form.periodLabel || undefined,
      periodFrom: form.periodFrom || undefined,
      periodTo: form.periodTo || undefined,
    };

    const url = editingId
      ? `/api/customers/${customerId}/charges/${editingId}`
      : `/api/customers/${customerId}/charges`;
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error ?? "Error al guardar cargo");
      setSaving(false);
      return;
    }

    applyResponse(json);
    resetForm();
    setMsg(editingId ? "Cargo actualizado — saldo sincronizado" : "Cargo registrado — saldo sincronizado");
    setSaving(false);
  }

  async function removeCharge(chargeId: string) {
    if (!confirm("¿Eliminar este concepto de cobro?")) return;
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/customers/${customerId}/charges/${chargeId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Error al eliminar");
      setSaving(false);
      return;
    }
    applyResponse(json);
    if (editingId === chargeId) resetForm();
    setMsg("Cargo eliminado");
    setSaving(false);
  }

  const balance = Number(pendingBalance);
  const isConsumption = form.chargeType === "CONSUMO_MENSUAL";
  const showPeriodLabel = !isConsumption;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-[#0B1F3A]">Detalle de valores a cobrar</h2>
        <p className="mt-1 text-xs text-slate-500">
          Desglose por concepto: meses de consumo, cambio de domicilio, excedente de fibra, instalación, etc.
          El saldo pendiente se calcula automáticamente desde este detalle.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Concepto *">
              <select
                required
                value={form.chargeType}
                onChange={(e) => setForm({ ...form, chargeType: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                {COLLECTION_CHARGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor USD *">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          {isConsumption ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mes desde *">
                <input
                  type="month"
                  required
                  value={form.periodFrom}
                  onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Mes hasta *">
                <input
                  type="month"
                  required
                  value={form.periodTo}
                  onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </Field>
              <p className="sm:col-span-2 text-xs text-slate-500">
                Ejemplo: Junio 2026 — Mayo 2026 para mensualidades de esos meses.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {showPeriodLabel && (
                <Field label="Referencia / periodo">
                  <input
                    value={form.periodLabel}
                    onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
                    placeholder="Ej. Traslado 15/06/2026"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </Field>
              )}
              <Field label="Descripción">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detalle adicional del concepto"
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              {saving ? "Guardando…" : editingId ? "Actualizar concepto" : "Agregar concepto"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600"
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </section>

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold text-[#0B1F3A]">Resumen de deuda</h2>
          <div className="text-right text-sm">
            <p>
              Total detalle: <strong>{formatUsd(totalDetail)}</strong>
            </p>
            <p className="text-slate-600">
              Saldo pendiente: <strong>{formatUsd(balance)}</strong>
              {charges.length > 0 && balance < totalDetail && (
                <span className="ml-1 text-xs text-amber-700">(con pagos parciales)</span>
              )}
            </p>
          </div>
        </div>

        {charges.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Sin conceptos registrados. Agregue meses de consumo, instalación u otros cargos arriba.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Detalle</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Registró</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {COLLECTION_CHARGE_TYPE_LABELS[charge.chargeType] ?? charge.chargeType}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatChargeDetail(charge)}</td>
                    <td className="px-3 py-2 text-right">{formatUsd(Number(charge.amount))}</td>
                    <td className="px-3 py-2 text-slate-600">{charge.user.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(charge)}
                        className="text-xs text-teal-700 hover:underline"
                      >
                        Editar
                      </button>
                      <span className="mx-1 text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => removeCharge(charge.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={2}>
                    TOTAL DETALLE
                  </td>
                  <td className="px-3 py-2 text-right">{formatUsd(totalDetail)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
