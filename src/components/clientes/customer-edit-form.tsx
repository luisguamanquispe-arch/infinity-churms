"use client";

import { useEffect, useState } from "react";
import {
  COLORS,
  CUSTOMER_STATUSES,
  CUSTOMER_ZONES,
  EQUIPMENT_TYPES,
  HAS_STREAMS_SUPPORT_LABEL,
  SERVICE_TECHNOLOGIES,
  STREAMS_SUPPORT_SINCE_LABEL,
  toUpperInput,
} from "@/lib/constants";
import { normalizeCedula, validateEcuadorianCedula } from "@/lib/cedula";
import { formatBusinessDateFromApi } from "@/lib/business-date";
import { PlanOfferFields } from "@/components/clientes/plan-offer-fields";

type FormEquipmentRow = {
  id?: string;
  type: string;
  serial: string;
  brand: string;
  model: string;
};

export type CustomerEditSource = {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  zone: string;
  phone?: string | null;
  planName: string;
  planSpeedMbps?: string | null;
  planMonthlyUsd?: string | null;
  offeredPlanName?: string | null;
  offeredPlanSpeedMbps?: string | null;
  offeredPlanMonthlyUsd?: string | null;
  status: string;
  serviceStartDate: string;
  originTechnology: string;
  currentTechnology: string;
  fiberInstallDate: string | null;
  fiberMigrationDate: string | null;
  migrationReviewRequired: boolean;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  pendingBalance: string;
  overdueSince: string | null;
  openTechnicalClaim: boolean;
  inCollectionWhitelist: boolean;
  assignedAgentUserId: string | null;
  equipment: {
    id: string;
    type: string;
    serial: string | null;
    brand: string | null;
    model: string | null;
  }[];
};

type CollectionAgentOption = { id: string; name: string; role: string };

function buildForm(customer: CustomerEditSource): CustomerFormState {
  return {
    contract: customer.contract,
    name: customer.name,
    cedula: customer.cedula,
    address: customer.address,
    zone: customer.zone,
    phone: customer.phone ?? "",
    planName: customer.planName,
    planSpeedMbps: customer.planSpeedMbps ?? "",
    planMonthlyUsd: customer.planMonthlyUsd ?? "",
    offeredPlanName: customer.offeredPlanName ?? "",
    offeredPlanSpeedMbps: customer.offeredPlanSpeedMbps ?? "",
    offeredPlanMonthlyUsd: customer.offeredPlanMonthlyUsd ?? "",
    status: customer.status,
    serviceStartDate: customer.serviceStartDate.slice(0, 10),
    originTechnology: customer.originTechnology,
    currentTechnology: customer.currentTechnology,
    fiberInstallDate: customer.fiberInstallDate?.slice(0, 10) ?? "",
    fiberMigrationDate: customer.fiberMigrationDate?.slice(0, 10) ?? "",
    migrationReviewRequired: customer.migrationReviewRequired,
    hasTvStreaming: customer.hasTvStreaming,
    tvStreamingSince: customer.tvStreamingSince?.slice(0, 10) ?? "",
    pendingBalance: customer.pendingBalance,
    overdueSince: customer.overdueSince?.slice(0, 10) ?? "",
    openTechnicalClaim: customer.openTechnicalClaim,
    inCollectionWhitelist: customer.inCollectionWhitelist,
    assignedAgentUserId: customer.assignedAgentUserId ?? "",
    equipment: customer.equipment.map(
      (e): FormEquipmentRow => ({
        id: e.id,
        type: e.type,
        serial: e.serial ?? "",
        brand: e.brand ?? "",
        model: e.model ?? "",
      })
    ),
  };
}

type CustomerFormState = {
  contract: string;
  name: string;
  cedula: string;
  address: string;
  zone: string;
  phone: string;
  planName: string;
  planSpeedMbps: string;
  planMonthlyUsd: string;
  offeredPlanName: string;
  offeredPlanSpeedMbps: string;
  offeredPlanMonthlyUsd: string;
  status: string;
  serviceStartDate: string;
  originTechnology: string;
  currentTechnology: string;
  fiberInstallDate: string;
  fiberMigrationDate: string;
  migrationReviewRequired: boolean;
  hasTvStreaming: boolean;
  tvStreamingSince: string;
  pendingBalance: string;
  overdueSince: string;
  openTechnicalClaim: boolean;
  inCollectionWhitelist: boolean;
  assignedAgentUserId: string;
  equipment: FormEquipmentRow[];
};

export function CustomerEditForm({
  customer,
  onSaved,
  onMessage,
}: {
  customer: CustomerEditSource;
  onSaved: (updated: Record<string, unknown>) => void;
  onMessage: (msg: string) => void;
}) {
  const [form, setForm] = useState<CustomerFormState>(() => buildForm(customer));
  const [cedulaError, setCedulaError] = useState("");
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<CollectionAgentOption[]>([]);

  useEffect(() => {
    setForm(buildForm(customer));
  }, [customer]);

  useEffect(() => {
    fetch("/api/users/collection-agents")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAgents);
  }, []);

  function updateUpper(key: "contract" | "name" | "address" | "planName" | "phone", value: string) {
    setForm((prev) => ({ ...prev, [key]: toUpperInput(value) }));
  }

  function updateCedula(value: string) {
    const cedula = normalizeCedula(value);
    setForm((prev) => ({ ...prev, cedula }));
    if (cedula.length === 10) {
      setCedulaError(validateEcuadorianCedula(cedula) ? "" : "Cédula inválida");
    } else {
      setCedulaError(cedula.length > 0 ? "La cédula debe tener 10 dígitos" : "");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.zone) {
      onMessage("Seleccione la zona del cliente");
      return;
    }
    if (!validateEcuadorianCedula(form.cedula)) {
      onMessage("Cédula ecuatoriana inválida");
      return;
    }
    if (form.hasTvStreaming && !form.tvStreamingSince) {
      onMessage("Indique la fecha de inicio del soporte de Streams");
      return;
    }
    if (
      form.originTechnology === "RADIOENLACE" &&
      form.currentTechnology === "FIBRA" &&
      !form.fiberMigrationDate
    ) {
      onMessage("Indique la fecha de migración a fibra");
      return;
    }

    setSaving(true);
    onMessage("");
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        phone: form.phone.trim() || null,
        pendingBalance: parseFloat(form.pendingBalance) || 0,
        overdueSince: form.overdueSince || null,
        fiberInstallDate: form.fiberInstallDate || null,
        fiberMigrationDate: form.fiberMigrationDate || null,
        tvStreamingSince: form.hasTvStreaming ? form.tvStreamingSince : null,
        assignedAgentUserId: form.assignedAgentUserId || null,
        equipment: form.equipment.filter((eq) => eq.type),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al guardar");
      return;
    }
    onMessage("Cliente actualizado correctamente");
    onSaved({
      contract: json.contract,
      name: json.name,
      cedula: json.cedula,
      address: json.address,
      zone: json.zone,
      phone: json.phone,
      planName: json.planName,
      planSpeedMbps: json.planSpeedMbps != null ? String(json.planSpeedMbps) : null,
      planMonthlyUsd: json.planMonthlyUsd != null ? String(json.planMonthlyUsd) : null,
      offeredPlanName: json.offeredPlanName ?? null,
      offeredPlanSpeedMbps: json.offeredPlanSpeedMbps != null ? String(json.offeredPlanSpeedMbps) : null,
      offeredPlanMonthlyUsd: json.offeredPlanMonthlyUsd != null ? String(json.offeredPlanMonthlyUsd) : null,
      status: json.status,
      serviceStartDate: formatBusinessDateFromApi(json.serviceStartDate),
      originTechnology: json.originTechnology,
      currentTechnology: json.currentTechnology,
      fiberInstallDate: json.fiberInstallDate
        ? formatBusinessDateFromApi(json.fiberInstallDate)
        : null,
      fiberMigrationDate: json.fiberMigrationDate
        ? formatBusinessDateFromApi(json.fiberMigrationDate)
        : null,
      migrationReviewRequired: json.migrationReviewRequired,
      hasTvStreaming: json.hasTvStreaming,
      tvStreamingSince: json.tvStreamingSince
        ? formatBusinessDateFromApi(json.tvStreamingSince)
        : null,
      pendingBalance: String(json.pendingBalance),
      overdueSince: json.overdueSince ? formatBusinessDateFromApi(json.overdueSince) : null,
      openTechnicalClaim: json.openTechnicalClaim,
      inCollectionWhitelist: json.inCollectionWhitelist,
      assignedAgentUserId: json.assignedAgentUserId,
      assignedAgentName: json.assignedAgentName,
      equipment: json.equipment.map(
        (eq: { id: string; type: string; serial: string | null; brand: string | null; model: string | null }) => ({
          id: eq.id,
          type: eq.type,
          serial: eq.serial,
          brand: eq.brand,
          model: eq.model,
        })
      ),
    });
  }

  const showFiberInstall =
    form.originTechnology === "FIBRA" ||
    (form.originTechnology === "RADIOENLACE" && form.currentTechnology === "FIBRA");
  const showMigration =
    form.originTechnology === "RADIOENLACE" &&
    (form.currentTechnology === "FIBRA" || !!form.fiberMigrationDate);

  return (
    <form onSubmit={save} className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Identificación</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <EditField label="Contrato *">
            <input
              required
              value={form.contract}
              onChange={(e) => updateUpper("contract", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm uppercase"
            />
          </EditField>
          <EditField label="Nombre *">
            <input
              required
              value={form.name}
              onChange={(e) => updateUpper("name", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm uppercase"
            />
          </EditField>
          <EditField label="Cédula *">
            <input
              required
              value={form.cedula}
              onChange={(e) => updateCedula(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm"
              maxLength={10}
            />
            {cedulaError && <p className="mt-1 text-xs text-red-600">{cedulaError}</p>}
          </EditField>
          <EditField label="Teléfono">
            <input
              value={form.phone}
              onChange={(e) => updateUpper("phone", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm uppercase"
            />
          </EditField>
          <EditField label="Zona *">
            <select
              required
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm uppercase"
            >
              <option value="">Seleccione zona</option>
              {CUSTOMER_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </EditField>
          <EditField label="Estado">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </EditField>
          <EditField label="Dirección *">
            <input
              required
              value={form.address}
              onChange={(e) => updateUpper("address", e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm uppercase sm:col-span-2"
            />
          </EditField>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Planes y propuesta comercial</h3>
        <div className="mt-3">
          <PlanOfferFields
            values={{
              planName: form.planName,
              planSpeedMbps: form.planSpeedMbps,
              planMonthlyUsd: form.planMonthlyUsd,
              offeredPlanName: form.offeredPlanName,
              offeredPlanSpeedMbps: form.offeredPlanSpeedMbps,
              offeredPlanMonthlyUsd: form.offeredPlanMonthlyUsd,
            }}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Servicio</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <EditField label="Alta servicio (instalación original) *">
            <input
              required
              type="date"
              value={form.serviceStartDate}
              onChange={(e) => setForm({ ...form, serviceStartDate: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </EditField>
          <EditField label="Tecnología origen">
            <select
              value={form.originTechnology}
              onChange={(e) =>
                setForm({
                  ...form,
                  originTechnology: e.target.value,
                  currentTechnology:
                    e.target.value === "FIBRA" ? "FIBRA" : form.currentTechnology,
                })
              }
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              {SERVICE_TECHNOLOGIES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </EditField>
          <EditField label="Tecnología actual">
            <select
              value={form.currentTechnology}
              onChange={(e) => setForm({ ...form, currentTechnology: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              {SERVICE_TECHNOLOGIES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </EditField>
          {showFiberInstall && (
            <EditField label="Fecha instalación fibra">
              <input
                type="date"
                value={form.fiberInstallDate}
                onChange={(e) => setForm({ ...form, fiberInstallDate: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </EditField>
          )}
          {showMigration && (
            <EditField label="Fecha migración a fibra *">
              <input
                type="date"
                required={form.currentTechnology === "FIBRA"}
                value={form.fiberMigrationDate}
                onChange={(e) => setForm({ ...form, fiberMigrationDate: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </EditField>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.migrationReviewRequired}
              onChange={(e) =>
                setForm({ ...form, migrationReviewRequired: e.target.checked })
              }
            />
            Marcar para revisión de migración (bloquea baja hasta corregir)
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Streams y cobranza</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.hasTvStreaming}
              onChange={(e) =>
                setForm({
                  ...form,
                  hasTvStreaming: e.target.checked,
                  tvStreamingSince: e.target.checked ? form.tvStreamingSince : "",
                })
              }
            />
            {HAS_STREAMS_SUPPORT_LABEL}
          </label>
          {form.hasTvStreaming && (
            <EditField label={`${STREAMS_SUPPORT_SINCE_LABEL} *`}>
              <input
                required
                type="date"
                value={form.tvStreamingSince}
                onChange={(e) => setForm({ ...form, tvStreamingSince: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </EditField>
          )}
          <EditField label="Saldo pendiente">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.pendingBalance}
              onChange={(e) => setForm({ ...form, pendingBalance: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </EditField>
          <EditField label="Fecha inicio de mora">
            <input
              type="date"
              value={form.overdueSince}
              onChange={(e) => setForm({ ...form, overdueSince: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </EditField>
          <EditField label="Agente de cobranza asignado">
            <select
              value={form.assignedAgentUserId}
              onChange={(e) => setForm({ ...form, assignedAgentUserId: e.target.value })}
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Sin asignar</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </EditField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.inCollectionWhitelist}
              onChange={(e) => setForm({ ...form, inCollectionWhitelist: e.target.checked })}
            />
            Lista blanca de cobranza
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.openTechnicalClaim}
              onChange={(e) => setForm({ ...form, openTechnicalClaim: e.target.checked })}
            />
            Reclamo técnico abierto (bloquea baja)
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Equipos</h3>
        <div className="mt-3 space-y-2">
          {form.equipment.length === 0 && (
            <p className="text-xs text-slate-500">Sin equipos registrados.</p>
          )}
          {form.equipment.map((eq, i) => (
            <div key={eq.id ?? `new-${i}`} className="grid gap-2 sm:grid-cols-5">
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
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                placeholder="Marca"
                value={eq.brand}
                onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, brand: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }}
                className="rounded border px-2 py-1 text-sm uppercase"
              />
              <input
                placeholder="Modelo"
                value={eq.model}
                onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, model: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }}
                className="rounded border px-2 py-1 text-sm uppercase"
              />
              <input
                placeholder="Serie"
                value={eq.serial}
                onChange={(e) => {
                  const equipment = [...form.equipment];
                  equipment[i] = { ...eq, serial: toUpperInput(e.target.value) };
                  setForm({ ...form, equipment });
                }}
                className="rounded border px-2 py-1 text-sm uppercase"
              />
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    equipment: form.equipment.filter((_, j) => j !== i),
                  })
                }
                className="text-xs text-red-600"
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                equipment: [
                  ...form.equipment,
                  { id: undefined, type: "ONU", serial: "", brand: "", model: "" },
                ],
              })
            }
            className="text-xs font-semibold text-teal-700"
          >
            + Agregar equipo
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: COLORS.brand }}
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={() => setForm(buildForm(customer))}
          className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-slate-700"
        >
          Descartar cambios
        </button>
      </div>
    </form>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
