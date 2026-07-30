"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COLORS,
  COLLECTION_MANAGEMENT_TYPES,
  COLLECTION_RESULTS,
  COLLECTION_RESULT_LABELS,
  COLLECTION_TYPE_LABELS,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface CollectionAction {
  id: string;
  actionDate: string;
  managementType: string;
  result: string;
  notes: string | null;
  nextFollowUpDate: string | null;
  promiseDate: string | null;
  promiseAmount: string | null;
  promiseNotes: string | null;
  attachmentName: string | null;
  photoName: string | null;
  user: { name: string; role: string };
}

interface CustomerDetail {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  zone: string;
  planName: string;
  status: string;
  pendingBalance: string;
  openTechnicalClaim: boolean;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  serviceStartDate: string;
  equipment: { type: string; serial: string | null; brand: string | null; model: string | null }[];
  hasCancellation: boolean;
  eligibility: { allowed: boolean; blockers: string[] };
}

const emptyForm = {
  actionDate: new Date().toISOString().slice(0, 16),
  managementType: "LLAMADA",
  result: "CONTESTO",
  notes: "",
  nextFollowUpDate: "",
  promiseDate: "",
  promiseAmount: "",
  promiseNotes: "",
};

async function readFileAsDataUrl(file: File): Promise<{ name: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result) });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CustomerDetailView({
  initial,
  canCreateBaja,
}: {
  initial: CustomerDetail;
  canCreateBaja: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"datos" | "cobranza">("cobranza");
  const [customer, setCustomer] = useState(initial);
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; data: string } | null>(null);
  const [photo, setPhoto] = useState<{ name: string; data: string } | null>(null);
  const [bajaReason, setBajaReason] = useState("DECISION_VOLUNTARIA");
  const [sendingBaja, setSendingBaja] = useState(false);

  async function refreshCollections() {
    const res = await fetch(`/api/customers/${customer.id}/collections`);
    if (res.ok) {
      const json = await res.json();
      setActions(json.actions);
      setCustomer((c) => ({ ...c, eligibility: json.eligibility }));
    }
  }

  useEffect(() => {
    refreshCollections();
  }, [customer.id]);

  async function saveCollection(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/customers/${customer.id}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          promiseAmount: form.promiseAmount ? parseFloat(form.promiseAmount) : undefined,
          attachmentName: attachment?.name,
          attachmentData: attachment?.data,
          photoName: photo?.name,
          photoData: photo?.data,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Error al guardar gestión");
        return;
      }
      setForm(emptyForm);
      setAttachment(null);
      setPhoto(null);
      setActions(json.actions ?? actions);
      if (json.eligibility) {
        setCustomer((c) => ({ ...c, eligibility: json.eligibility }));
      } else {
        await refreshCollections();
      }
      setMsg("Gestión registrada");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTechnicalClaim() {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openTechnicalClaim: !customer.openTechnicalClaim }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCustomer((c) => ({ ...c, openTechnicalClaim: updated.openTechnicalClaim }));
      await refreshCollections();
    }
  }

  async function sendToBaja() {
    if (!customer.eligibility.allowed || customer.hasCancellation) return;
    setSendingBaja(true);
    setMsg("");
    const res = await fetch("/api/cancellations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, reason: bajaReason }),
    });
    const json = await res.json();
    if (res.ok) {
      router.push(`/bajas/${json.id}`);
    } else {
      setMsg(json.error ?? "No se pudo enviar a baja");
      setSendingBaja(false);
    }
  }

  const showPromise = form.result === "PROMESA_DE_PAGO";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/clientes" className="text-xs text-teal-700 hover:underline">
            ← Clientes
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[#0B1F3A]">{customer.name}</h1>
          <p className="text-sm text-slate-500">
            Contrato {customer.contract} · {customer.cedula} · {customer.zone}
          </p>
          <p className="mt-1 text-sm">
            Saldo pendiente: <strong>{formatUsd(Number(customer.pendingBalance))}</strong>
            {customer.openTechnicalClaim && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                Reclamo técnico abierto
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Enviar a Baja</p>
          {customer.hasCancellation ? (
            <p className="mt-2 text-sm text-slate-600">Este cliente ya tiene una baja registrada.</p>
          ) : (
            <>
              {!customer.eligibility.allowed && (
                <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
                  {customer.eligibility.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {canCreateBaja && customer.eligibility.allowed && (
                <div className="mt-3 space-y-2">
                  <select
                    value={bajaReason}
                    onChange={(e) => setBajaReason(e.target.value)}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  >
                    <option value="DECISION_VOLUNTARIA">Decisión voluntaria</option>
                    <option value="FALLAS_CONTINUAS">Fallas continuas</option>
                    <option value="INCUMPLIMIENTO_CONTRATO">Incumplimiento del contrato</option>
                    <option value="MUDANZA">Mudanza</option>
                    <option value="PROBLEMAS_ATENCION">Problemas de atención</option>
                    <option value="MEJOR_OFERTA">Mejor oferta</option>
                  </select>
                  <button
                    type="button"
                    disabled={sendingBaja}
                    onClick={sendToBaja}
                    className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: COLORS.brand }}
                  >
                    {sendingBaja ? "Procesando…" : "Enviar a Baja"}
                  </button>
                </div>
              )}
              {canCreateBaja && !customer.eligibility.allowed && (
                <p className="mt-2 text-xs text-slate-500">
                  Complete o resuelva la gestión de cobranza para habilitar la baja.
                </p>
              )}
            </>
          )}
        </div>
      </header>

      {msg && (
        <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>
      )}

      <div className="flex gap-2 border-b">
        <TabButton active={tab === "datos"} onClick={() => setTab("datos")}>
          Datos del cliente
        </TabButton>
        <TabButton active={tab === "cobranza"} onClick={() => setTab("cobranza")}>
          Gestión de Cobranza
        </TabButton>
      </div>

      {tab === "datos" && (
        <Card title="Información del cliente">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Info label="Plan" value={customer.planName} />
            <Info label="Estado" value={customer.status} />
            <Info label="Dirección" value={customer.address} />
            <Info
              label="Alta servicio"
              value={new Date(customer.serviceStartDate).toLocaleDateString("es-VE")}
            />
            <Info
              label="Equipos"
              value={
                customer.equipment.length
                  ? customer.equipment.map((e) => e.type).join(", ")
                  : "Sin registrar"
              }
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={customer.openTechnicalClaim}
              onChange={toggleTechnicalClaim}
            />
            Reclamo técnico abierto (bloquea envío a baja)
          </label>
        </Card>
      )}

      {tab === "cobranza" && (
        <>
          <Card title="Registrar gestión">
            <form onSubmit={saveCollection} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fecha y hora">
                  <input
                    type="datetime-local"
                    required
                    value={form.actionDate}
                    onChange={(e) => setForm({ ...form, actionDate: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Tipo de gestión">
                  <select
                    value={form.managementType}
                    onChange={(e) => setForm({ ...form, managementType: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  >
                    {COLLECTION_MANAGEMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Resultado">
                  <select
                    value={form.result}
                    onChange={(e) => setForm({ ...form, result: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  >
                    {COLLECTION_RESULTS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Próxima fecha de gestión">
                  <input
                    type="date"
                    value={form.nextFollowUpDate}
                    onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>

              {showPromise && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Promesa de pago</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Fecha compromiso *">
                      <input
                        type="date"
                        required
                        value={form.promiseDate}
                        onChange={(e) => setForm({ ...form, promiseDate: e.target.value })}
                        className="w-full rounded border px-2 py-1.5 text-sm"
                      />
                    </Field>
                    <Field label="Valor comprometido (USD) *">
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={form.promiseAmount}
                        onChange={(e) => setForm({ ...form, promiseAmount: e.target.value })}
                        className="w-full rounded border px-2 py-1.5 text-sm"
                      />
                    </Field>
                  </div>
                  <Field label="Observaciones promesa">
                    <textarea
                      value={form.promiseNotes}
                      onChange={(e) => setForm({ ...form, promiseNotes: e.target.value })}
                      className="w-full rounded border px-2 py-1.5 text-sm"
                      rows={2}
                    />
                  </Field>
                </div>
              )}

              <Field label="Observaciones">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  rows={3}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Adjunto (opcional, máx. 500 KB)">
                  <input
                    type="file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setAttachment(await readFileAsDataUrl(file));
                    }}
                    className="w-full text-sm"
                  />
                </Field>
                <Field label="Fotografía (opcional, máx. 500 KB)">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhoto(await readFileAsDataUrl(file));
                    }}
                    className="w-full text-sm"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                {saving ? "Guardando…" : "Registrar gestión"}
              </button>
            </form>
          </Card>

          <Card title="Historial de gestiones">
            {actions.length === 0 ? (
              <p className="text-sm text-slate-500">Sin gestiones registradas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Hora</th>
                      <th className="px-3 py-2">Usuario</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Resultado</th>
                      <th className="px-3 py-2">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => {
                      const d = new Date(a.actionDate);
                      return (
                        <tr key={a.id} className="border-t align-top">
                          <td className="px-3 py-2 whitespace-nowrap">{d.toLocaleDateString("es-VE")}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-3 py-2">{a.user.name}</td>
                          <td className="px-3 py-2">{COLLECTION_TYPE_LABELS[a.managementType] ?? a.managementType}</td>
                          <td className="px-3 py-2">{COLLECTION_RESULT_LABELS[a.result] ?? a.result}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {a.notes ?? "—"}
                            {a.result === "PROMESA_DE_PAGO" && a.promiseDate && (
                              <p className="mt-1 text-xs text-teal-700">
                                Compromiso: {new Date(a.promiseDate).toLocaleDateString("es-VE")}
                                {a.promiseAmount ? ` · ${formatUsd(Number(a.promiseAmount))}` : ""}
                              </p>
                            )}
                            {(a.attachmentName || a.photoName) && (
                              <p className="mt-1 text-xs text-slate-500">
                                {[a.attachmentName, a.photoName].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-[#00A9B5] text-[#0B1F3A]"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-[#0B1F3A]">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium">{value}</p>
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
