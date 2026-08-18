"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  COLORS,
  COLLECTION_MANAGEMENT_TYPES,
  COLLECTION_RESULTS,
  COLLECTION_RESULT_LABELS,
  COLLECTION_TYPE_LABELS,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { PrelegalOverdueNotice } from "@/components/clientes/prelegal-notice";
import { CollectionPaymentsPanel } from "@/components/clientes/collection-payments-panel";
import { CollectionChargesPanel } from "@/components/clientes/collection-charges-panel";
import { CustomerEditForm } from "@/components/clientes/customer-edit-form";
import { ContractHistoryPanel } from "@/components/cambio-plan/contract-history-panel";
import { PlanChangeHistoryPanel } from "@/components/cambio-plan/plan-change-history-panel";

interface CollectionAction {
  id: string;
  actionDate: string;
  managementType: string;
  result: string;
  agentUserId: string;
  agentName: string;
  notes: string | null;
  nextFollowUpDate: string | null;
  promiseDate: string | null;
  promiseAmount: string | null;
  promiseNotes: string | null;
  attachmentName: string | null;
  photoName: string | null;
  user: { name: string; role: string };
  agent: { name: string; role: string };
}

interface CollectionChargeRow {
  chargeType: string;
  description: string | null;
  periodLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  amount: string;
}

interface CollectionAgentOption {
  id: string;
  name: string;
  role: string;
}

interface CustomerAgentStage {
  agentUserId: string;
  agentName: string;
  firstActionDate: string;
  lastActionDate: string;
  gestionesCount: number;
}

interface CustomerDetail {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  zone: string;
  phone: string | null;
  planName: string;
  planSpeedMbps?: number | null;
  planMonthlyUsd?: string | null;
  offeredPlanName?: string | null;
  offeredPlanSpeedMbps?: number | null;
  offeredPlanMonthlyUsd?: string | null;
  status: string;
  pendingBalance: string;
  overdueSince: string | null;
  inCollectionWhitelist: boolean;
  assignedAgentUserId: string | null;
  assignedAgentName: string | null;
  originTechnology: string;
  currentTechnology: string;
  fiberInstallDate: string | null;
  fiberMigrationDate: string | null;
  migrationReviewRequired: boolean;
  openTechnicalClaim: boolean;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  serviceStartDate: string;
  equipment: {
    id: string;
    type: string;
    serial: string | null;
    brand: string | null;
    model: string | null;
  }[];
  hasCancellation: boolean;
  prelegalOverdue: boolean;
  eligibility: { allowed: boolean; blockers: string[] };
}

const emptyForm = {
  agentUserId: "",
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
  canManageCollections,
  equipmentTariffs,
}: {
  initial: CustomerDetail;
  canCreateBaja: boolean;
  canManageCollections: boolean;
  equipmentTariffs: { type: string; notReturnedUsd: number | string }[];
}) {
  const [tab, setTab] = useState<"datos" | "cobranza" | "contrato">(
    canManageCollections ? "cobranza" : "datos"
  );
  const [customer, setCustomer] = useState(initial);
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [agentHistory, setAgentHistory] = useState<CustomerAgentStage[]>([]);
  const [collectionAgents, setCollectionAgents] = useState<CollectionAgentOption[]>([]);
  const [collectionCharges, setCollectionCharges] = useState<CollectionChargeRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; data: string } | null>(null);
  const [photo, setPhoto] = useState<{ name: string; data: string } | null>(null);

  async function refreshCollections() {
    if (!canManageCollections) return;
    const [collectionsRes, chargesRes] = await Promise.all([
      fetch(`/api/customers/${customer.id}/collections`),
      fetch(`/api/customers/${customer.id}/charges`),
    ]);
    if (collectionsRes.ok) {
      const json = await collectionsRes.json();
      setActions(json.actions);
      setAgentHistory(json.agentHistory ?? []);
      setCustomer((c) => ({
        ...c,
        eligibility: json.eligibility,
        assignedAgentUserId: json.assignedAgent?.userId ?? c.assignedAgentUserId,
        assignedAgentName: json.assignedAgent?.name ?? c.assignedAgentName,
      }));
    }
    if (chargesRes.ok) {
      const json = await chargesRes.json();
      setCollectionCharges(json.charges ?? []);
    }
  }

  useEffect(() => {
    if (!canManageCollections) return;
    async function bootstrapAgents() {
      const [meRes, agentsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/users/collection-agents"),
      ]);
      const me = meRes.ok ? await meRes.json() : null;
      const agents = agentsRes.ok ? await agentsRes.json() : [];
      setCollectionAgents(agents);
      const defaultAgentId =
        customer.assignedAgentUserId ??
        me?.userId ??
        agents[0]?.id ??
        "";
      setForm((f) => ({ ...f, agentUserId: f.agentUserId || defaultAgentId }));
    }
    bootstrapAgents();
    refreshCollections();
  }, [customer.id, canManageCollections]);

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
      setForm((f) => ({ ...emptyForm, agentUserId: f.agentUserId }));
      setAttachment(null);
      setPhoto(null);
      setActions(json.actions ?? actions);
      setAgentHistory(json.agentHistory ?? []);
      if (json.eligibility) {
        setCustomer((c) => ({
          ...c,
          eligibility: json.eligibility,
          assignedAgentUserId: json.item?.agentUserId ?? c.assignedAgentUserId,
          assignedAgentName: json.item?.agentName ?? c.assignedAgentName,
        }));
      } else {
        await refreshCollections();
      }
      setMsg("Gestión registrada");
    } finally {
      setSaving(false);
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
          <p className="mt-1 text-sm text-slate-600">
            Plan actual: <strong>{customer.planName}</strong>
            {customer.planSpeedMbps ? ` · ${customer.planSpeedMbps} Mbps` : ""}
            {customer.planMonthlyUsd ? ` · ${formatUsd(Number(customer.planMonthlyUsd))}/mes` : ""}
          </p>
          {customer.offeredPlanName && (
            <p className="text-sm text-teal-700">
              Oferta: {customer.offeredPlanName}
              {customer.offeredPlanSpeedMbps ? ` · ${customer.offeredPlanSpeedMbps} Mbps` : ""}
              {customer.offeredPlanMonthlyUsd
                ? ` · ${formatUsd(Number(customer.offeredPlanMonthlyUsd))}/mes`
                : ""}
            </p>
          )}
          <p className="mt-1 text-sm">
            Saldo pendiente: <strong>{formatUsd(Number(customer.pendingBalance))}</strong>
            {customer.inCollectionWhitelist && (
              <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                Lista blanca
              </span>
            )}
            {customer.openTechnicalClaim && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                Reclamo técnico abierto
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Acciones</p>
          <Link
            href={`/cambio-plan/nuevo?customerId=${customer.id}`}
            className="block w-full rounded-lg border px-4 py-2 text-center text-sm font-semibold"
            style={{ borderColor: COLORS.brand, color: COLORS.brand }}
          >
            Cambio de plan
          </Link>
          <p className="text-xs font-semibold uppercase text-slate-500 pt-2">Enviar a Baja</p>
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
                  <Link
                    href={`/bajas/nueva?customerId=${customer.id}`}
                    className="block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold text-white"
                    style={{ backgroundColor: COLORS.brand }}
                  >
                    Registrar solicitud de baja
                  </Link>
                  <p className="text-xs text-slate-500">
                    Abre el flujo completo: tipo de cliente, migración si aplica, preview de
                    permanencia y liquidación.
                  </p>
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

      {canManageCollections && !customer.inCollectionWhitelist && (
        <PrelegalOverdueNotice
          customer={{
            id: customer.id,
            name: customer.name,
            contract: customer.contract,
            pendingBalance: customer.pendingBalance,
            overdueSince: customer.overdueSince,
            planName: customer.planName,
            hasTvStreaming: customer.hasTvStreaming,
            tvStreamingSince: customer.tvStreamingSince,
            equipment: customer.equipment,
          }}
          equipmentTariffs={equipmentTariffs}
          collectionCharges={collectionCharges}
        />
      )}

      <div className="flex gap-2 border-b">
        <TabButton active={tab === "datos"} onClick={() => setTab("datos")}>
          Editar cliente
        </TabButton>
        {canManageCollections && (
          <TabButton active={tab === "cobranza"} onClick={() => setTab("cobranza")}>
            Gestión de Cobranza
          </TabButton>
        )}
        <TabButton active={tab === "contrato"} onClick={() => setTab("contrato")}>
          Contrato y planes
        </TabButton>
      </div>

      {tab === "datos" && (
        <Card title="Editar cliente">
          {customer.migrationReviewRequired && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              REVISIÓN REQUERIDA — complete la fecha de migración a fibra para calcular permanencia
              en bajas.
            </p>
          )}
          <CustomerEditForm
            customer={{
              ...customer,
              phone: customer.phone ?? null,
              planSpeedMbps:
                customer.planSpeedMbps != null ? String(customer.planSpeedMbps) : null,
              planMonthlyUsd: customer.planMonthlyUsd ?? null,
              offeredPlanName: customer.offeredPlanName ?? null,
              offeredPlanSpeedMbps:
                customer.offeredPlanSpeedMbps != null
                  ? String(customer.offeredPlanSpeedMbps)
                  : null,
              offeredPlanMonthlyUsd: customer.offeredPlanMonthlyUsd ?? null,
            }}
            onMessage={setMsg}
            onSaved={(fields) => {
              setCustomer((c) => ({ ...c, ...fields }));
              refreshCollections();
            }}
          />
          <p className="mt-4 text-xs text-slate-500">
            El aviso prelegal (+90 días) usa la fecha de mora, el saldo pendiente y el detalle de
            conceptos registrados en cobranza.
          </p>
        </Card>
      )}

      {tab === "contrato" && (
        <div className="space-y-6">
          <Card title="Historial contractual">
            <ContractHistoryPanel customerId={customer.id} />
          </Card>
          <Card title="Historial de cambios de plan">
            <PlanChangeHistoryPanel customerId={customer.id} />
          </Card>
        </div>
      )}

      {canManageCollections && tab === "cobranza" && (
        <>
          <CollectionChargesPanel
            customerId={customer.id}
            pendingBalance={customer.pendingBalance}
            onUpdated={({ pendingBalance, overdueSince, inCollectionWhitelist }) => {
              setCustomer((c) => ({
                ...c,
                pendingBalance,
                overdueSince,
                inCollectionWhitelist,
              }));
              refreshCollections();
            }}
          />

          <CollectionPaymentsPanel
            customerId={customer.id}
            pendingBalance={customer.pendingBalance}
            inCollectionWhitelist={customer.inCollectionWhitelist}
            onUpdated={({ pendingBalance, inCollectionWhitelist }) => {
              setCustomer((c) => ({
                ...c,
                pendingBalance,
                inCollectionWhitelist,
                overdueSince: inCollectionWhitelist ? null : c.overdueSince,
              }));
              refreshCollections();
            }}
          />

          {(customer.assignedAgentName || agentHistory.length > 0) && (
            <Card title="Agentes de cobranza por etapas">
              {customer.assignedAgentName && (
                <p className="mb-3 text-sm">
                  Agente asignado actual:{" "}
                  <strong className="text-[#0B1F3A]">{customer.assignedAgentName}</strong>
                </p>
              )}
              {agentHistory.length === 0 ? (
                <p className="text-sm text-slate-500">Sin historial de agentes.</p>
              ) : (
                <div className="space-y-2">
                  {agentHistory.map((stage, index) => (
                    <div
                      key={`${stage.agentUserId}-${stage.firstActionDate}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="mr-2 text-xs font-semibold uppercase text-slate-500">
                          Etapa {index + 1}
                        </span>
                        <strong>{stage.agentName}</strong>
                      </div>
                      <div className="text-xs text-slate-600">
                        {new Date(stage.firstActionDate).toLocaleDateString("es-VE")}
                        {stage.firstActionDate !== stage.lastActionDate &&
                          ` — ${new Date(stage.lastActionDate).toLocaleDateString("es-VE")}`}
                        {" · "}
                        {stage.gestionesCount} gestión(es)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="Registrar gestión">
            <form onSubmit={saveCollection} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Agente de cobranza *">
                  <select
                    required
                    value={form.agentUserId}
                    onChange={(e) => setForm({ ...form, agentUserId: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  >
                    <option value="">Seleccione agente</option>
                    {collectionAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </Field>
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
                      <th className="px-3 py-2">Agente</th>
                      <th className="px-3 py-2">Registró</th>
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
                          <td className="px-3 py-2 font-medium">{a.agentName}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {a.user.name !== a.agentName ? a.user.name : "—"}
                          </td>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
