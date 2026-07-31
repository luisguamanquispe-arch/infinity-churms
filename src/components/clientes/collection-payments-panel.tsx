"use client";

import { useEffect, useState } from "react";
import { PAID_IN_FULL_NOTICE } from "@/lib/services/paid-in-full-notice";
import { formatUsd } from "@/lib/liquidation";
import { COLORS, PAYMENT_METHODS } from "@/lib/constants";

interface CollectionPayment {
  id: string;
  paymentDate: string;
  amount: string;
  fenixDocument: string;
  paymentMethod: string | null;
  notes: string | null;
  user: { name: string };
}

const emptyPayment = {
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: "",
  fenixDocument: "",
  paymentMethod: PAYMENT_METHODS[0] as string,
  notes: "",
};

export function CollectionPaymentsPanel({
  customerId,
  pendingBalance,
  inCollectionWhitelist,
  onUpdated,
}: {
  customerId: string;
  pendingBalance: string;
  inCollectionWhitelist: boolean;
  onUpdated: (data: {
    pendingBalance: string;
    inCollectionWhitelist: boolean;
    paidInFull?: boolean;
  }) => void;
}) {
  const [payments, setPayments] = useState<CollectionPayment[]>([]);
  const [form, setForm] = useState(emptyPayment);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadPayments() {
    const res = await fetch(`/api/customers/${customerId}/payments`);
    if (res.ok) setPayments(await res.json());
  }

  useEffect(() => {
    loadPayments();
  }, [customerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/customers/${customerId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Error al registrar pago");
      setSaving(false);
      return;
    }
    setForm(emptyPayment);
    setPayments(json.payments ?? []);
    onUpdated({
      pendingBalance: json.pendingBalance,
      inCollectionWhitelist: json.inCollectionWhitelist,
      paidInFull: json.paidInFull,
    });
    setMsg(
      json.paidInFull
        ? "Pago registrado — cliente en lista blanca. Puede descargar el comunicado de agradecimiento."
        : `Pago registrado. Saldo restante: ${formatUsd(json.remainingBalance)}`
    );
    setSaving(false);
  }

  const balance = Number(pendingBalance);

  return (
    <div className="space-y-4">
      {inCollectionWhitelist && balance <= 0 && (
        <section className="rounded-xl border-2 border-teal-300 bg-teal-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-800">Lista blanca</p>
              <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">{PAID_IN_FULL_NOTICE.title}</h2>
              <p className="mt-1 text-sm text-teal-900">Cuenta al día · cobranza regularizada</p>
            </div>
            <a
              href={`/api/customers/${customerId}/comunicado-al-dia`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: COLORS.brand }}
            >
              Descargar comunicado PDF
            </a>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-800">
            <p>{PAID_IN_FULL_NOTICE.greeting}</p>
            <p>{PAID_IN_FULL_NOTICE.intro}</p>
            <p className="font-semibold text-teal-800">{PAID_IN_FULL_NOTICE.thanks}</p>
          </div>
        </section>
      )}

      {!inCollectionWhitelist && balance > 0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-[#0B1F3A]">Registrar pago (Fenix)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Saldo pendiente: <strong>{formatUsd(balance)}</strong> — ingrese recibo o factura del sistema Fenix
          </p>
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Fecha de pago *">
              <input
                type="date"
                required
                value={form.paymentDate}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Valor pagado (USD) *">
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
            <Field label="N° recibo / factura Fenix *">
              <input
                required
                value={form.fenixDocument}
                onChange={(e) => setForm({ ...form, fenixDocument: e.target.value.toUpperCase() })}
                placeholder="Ej. FNX-2026-001234"
                className="w-full rounded border px-2 py-1.5 text-sm uppercase"
              />
            </Field>
            <Field label="Método de pago">
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                {saving ? "Registrando…" : "Registrar pago"}
              </button>
            </div>
          </form>
        </section>
      )}

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-[#0B1F3A]">Historial de pagos Fenix</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin pagos registrados.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Recibo / Factura Fenix</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Registró</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(p.paymentDate).toLocaleDateString("es-VE")}
                    </td>
                    <td className="px-3 py-2 font-medium">{p.fenixDocument}</td>
                    <td className="px-3 py-2">{p.paymentMethod ?? "—"}</td>
                    <td className="px-3 py-2">{formatUsd(Number(p.amount))}</td>
                    <td className="px-3 py-2 text-slate-600">{p.user.name}</td>
                  </tr>
                ))}
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
