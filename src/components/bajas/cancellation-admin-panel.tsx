"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CANCELLATION_REASONS,
  CANCELLATION_STATUSES,
  COLORS,
  EQUIPMENT_CONDITIONS,
  INSTALLATION_PRORATION_LABEL,
  PAYMENT_METHODS,
  SERVICE_TECHNOLOGIES,
  STATUS_LABELS,
  STREAMS_SUPPORT_LABEL,
} from "@/lib/constants";

type ChargeRow = { id?: string; concept: string; amount: string; _deleted?: boolean };
type PaymentRow = {
  id?: string;
  paymentDate: string;
  method: string;
  invoiceNumber: string;
  amountPaid: string;
  notes: string;
  _deleted?: boolean;
};
type EquipmentRow = {
  id: string;
  type: string;
  serial: string;
  brand: string;
  model: string;
  delivered: boolean;
  condition: string;
  notes: string;
};

export interface CancellationAdminData {
  id: string;
  reason: string;
  notes: string | null;
  status: string;
  requestDate: string;
  closeDate: string | null;
  invoiceNumber: string | null;
  clientSignature: string | null;
  actaNumber: string | null;
  actaPhysicalCode: string | null;
  monthsCompleted: number;
  permanenceStartDate: string | null;
  originTechnology: string | null;
  currentTechnology: string | null;
  fiberInstallPending: boolean | null;
  permanenceAmount: string;
  tvAmount: string;
  monthlyAmount: string;
  equipmentAmount: string;
  otherAmount: string;
  totalAmount: string;
  customer: { contract: string; name: string };
  charges: { id: string; concept: string; amount: string }[];
  payments: {
    id: string;
    paymentDate: string;
    method: string;
    invoiceNumber: string;
    amountPaid: string;
    notes: string | null;
  }[];
  equipment: {
    id: string;
    type: string;
    serial: string | null;
    brand: string | null;
    model: string | null;
    delivered: boolean;
    condition: string | null;
    notes: string | null;
  }[];
}

function buildForm(data: CancellationAdminData) {
  return {
    reason: data.reason,
    notes: data.notes ?? "",
    status: data.status,
    requestDate: data.requestDate.slice(0, 10),
    closeDate: data.closeDate?.slice(0, 10) ?? "",
    invoiceNumber: data.invoiceNumber ?? "",
    clientSignature: data.clientSignature ?? "",
    actaNumber: data.actaNumber ?? "",
    actaPhysicalCode: data.actaPhysicalCode ?? "",
    monthsCompleted: String(data.monthsCompleted),
    permanenceStartDate: data.permanenceStartDate?.slice(0, 10) ?? "",
    originTechnology: data.originTechnology ?? "FIBRA",
    currentTechnology: data.currentTechnology ?? "FIBRA",
    fiberInstallPending: data.fiberInstallPending === true,
    permanenceAmount: data.permanenceAmount,
    tvAmount: data.tvAmount,
    monthlyAmount: data.monthlyAmount,
    equipmentAmount: data.equipmentAmount,
    otherAmount: data.otherAmount,
    totalAmount: data.totalAmount,
    charges: data.charges.map((c): ChargeRow => ({ id: c.id, concept: c.concept, amount: c.amount })),
    payments: data.payments.map((p): PaymentRow => ({
      id: p.id,
      paymentDate: p.paymentDate.slice(0, 10),
      method: p.method,
      invoiceNumber: p.invoiceNumber,
      amountPaid: p.amountPaid,
      notes: p.notes ?? "",
    })),
    equipment: data.equipment.map((e): EquipmentRow => ({
      id: e.id,
      type: e.type,
      serial: e.serial ?? "",
      brand: e.brand ?? "",
      model: e.model ?? "",
      delivered: e.delivered,
      condition: e.condition ?? "",
      notes: e.notes ?? "",
    })),
  };
}

type AdminForm = ReturnType<typeof buildForm>;

export function CancellationAdminPanel({
  data,
  canEdit,
  canDelete,
  onMessage,
}: {
  data: CancellationAdminData;
  canEdit: boolean;
  canDelete: boolean;
  onMessage: (msg: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => buildForm(data));
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    setForm(buildForm(data));
  }, [data]);

  function updateLineAmounts(next: Partial<AdminForm>) {
    const merged = { ...form, ...next };
    const chargeSum = merged.charges
      .filter((c) => !c._deleted)
      .reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const permanence = parseFloat(merged.permanenceAmount) || 0;
    const tv = parseFloat(merged.tvAmount) || 0;
    const monthly = parseFloat(merged.monthlyAmount) || 0;
    const total = Math.round((permanence + tv + monthly + chargeSum) * 100) / 100;
    setForm({ ...merged, otherAmount: String(chargeSum), totalAmount: String(total) });
  }

  async function save(recalculate = false) {
    setSaving(true);
    onMessage("");
    const payload = {
      action: "update",
      recalculate,
      reason: form.reason,
      notes: form.notes || null,
      requestDate: form.requestDate,
      closeDate: form.closeDate || null,
      status: form.status,
      invoiceNumber: form.invoiceNumber || null,
      clientSignature: form.clientSignature || null,
      actaNumber: form.actaNumber || null,
      actaPhysicalCode: form.actaPhysicalCode || null,
      monthsCompleted: parseInt(form.monthsCompleted) || 0,
      permanenceStartDate: form.permanenceStartDate || null,
      originTechnology: form.originTechnology,
      currentTechnology: form.currentTechnology,
      fiberInstallPending: form.fiberInstallPending,
      permanenceAmount: parseFloat(form.permanenceAmount) || 0,
      tvAmount: parseFloat(form.tvAmount) || 0,
      monthlyAmount: parseFloat(form.monthlyAmount) || 0,
      equipmentAmount: parseFloat(form.equipmentAmount) || 0,
      otherAmount: parseFloat(form.otherAmount) || 0,
      totalAmount: parseFloat(form.totalAmount) || 0,
      charges: form.charges
        .filter((c) => !c._deleted && c.concept.trim())
        .map((c) => ({
          id: c.id,
          concept: c.concept,
          amount: parseFloat(c.amount) || 0,
        })),
      deletedChargeIds: form.charges.filter((c) => c._deleted && c.id).map((c) => c.id!),
      payments: form.payments
        .filter((p) => !p._deleted && p.invoiceNumber.trim())
        .map((p) => ({
          id: p.id,
          paymentDate: p.paymentDate,
          method: p.method,
          invoiceNumber: p.invoiceNumber,
          amountPaid: parseFloat(p.amountPaid) || 0,
          notes: p.notes || null,
        })),
      deletedPaymentIds: form.payments.filter((p) => p._deleted && p.id).map((p) => p.id!),
      equipment: form.equipment.map((e) => ({
        id: e.id,
        brand: e.brand || null,
        model: e.model || null,
        serial: e.serial || null,
        delivered: e.delivered,
        condition: e.condition || null,
        notes: e.notes || null,
      })),
    };

    const res = await fetch(`/api/cancellations/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    setRecalculating(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al guardar");
      return;
    }
    onMessage(recalculate ? "Liquidación recalculada" : "Baja actualizada correctamente");
    router.refresh();
  }

  async function deleteCancellation() {
    const label = `${data.customer.contract} — ${data.customer.name}`;
    if (
      !confirm(
        `¿Eliminar permanentemente la baja de ${label}?\n\nEsta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/cancellations/${data.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      onMessage(json.error ?? "Error al eliminar");
      return;
    }
    router.push("/bajas");
  }

  if (!canEdit && !canDelete) return null;

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-5 shadow-sm">
      <h2 className="font-semibold text-[#0B1F3A]">Administración completa (solo ADMIN)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Edite cualquier campo de la baja. Use &quot;Recalcular liquidación&quot; para aplicar tarifas
        automáticas según la fecha de solicitud.
      </p>

      {canEdit && (
        <div className="mt-5 space-y-6">
          <AdminSection title="Datos generales">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Motivo" select={CANCELLATION_REASONS.map((r) => r.value)} selectLabels={Object.fromEntries(CANCELLATION_REASONS.map((r) => [r.value, r.label]))} value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
              <Field label="Estado" select={[...CANCELLATION_STATUSES]} selectLabels={STATUS_LABELS} value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
              <Field label="Fecha solicitud" type="date" value={form.requestDate} onChange={(v) => setForm({ ...form, requestDate: v })} />
              <Field label="Fecha cierre" type="date" value={form.closeDate} onChange={(v) => setForm({ ...form, closeDate: v })} />
              <Field label="N° Factura (cabecera)" value={form.invoiceNumber} onChange={(v) => setForm({ ...form, invoiceNumber: v })} />
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-600">Observaciones</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
          </AdminSection>

          <AdminSection title="Permanencia e instalación fibra">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Inicio permanencia fibra" type="date" value={form.permanenceStartDate} onChange={(v) => setForm({ ...form, permanenceStartDate: v })} />
              <Field label="Meses cumplidos" type="number" value={form.monthsCompleted} onChange={(v) => setForm({ ...form, monthsCompleted: v })} />
              <Field label="Tecnología origen" select={SERVICE_TECHNOLOGIES.map((t) => t.value)} selectLabels={Object.fromEntries(SERVICE_TECHNOLOGIES.map((t) => [t.value, t.label]))} value={form.originTechnology} onChange={(v) => setForm({ ...form, originTechnology: v })} />
              <Field label="Tecnología actual" select={SERVICE_TECHNOLOGIES.map((t) => t.value)} selectLabels={Object.fromEntries(SERVICE_TECHNOLOGIES.map((t) => [t.value, t.label]))} value={form.currentTechnology} onChange={(v) => setForm({ ...form, currentTechnology: v })} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.fiberInstallPending} onChange={(e) => setForm({ ...form, fiberInstallPending: e.target.checked })} />
                Instalación fibra pendiente
              </label>
            </div>
          </AdminSection>

          <AdminSection title="Liquidación">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={INSTALLATION_PRORATION_LABEL} type="number" value={form.permanenceAmount} onChange={(v) => updateLineAmounts({ permanenceAmount: v })} />
              <Field label={STREAMS_SUPPORT_LABEL} type="number" value={form.tvAmount} onChange={(v) => updateLineAmounts({ tvAmount: v })} />
              <Field label="Mensualidades" type="number" value={form.monthlyAmount} onChange={(v) => updateLineAmounts({ monthlyAmount: v })} />
              <Field label="Otros cargos" type="number" value={form.otherAmount} onChange={(v) => updateLineAmounts({ otherAmount: v })} />
              <Field label="Equipos (informativo)" type="number" value={form.equipmentAmount} onChange={(v) => setForm({ ...form, equipmentAmount: v })} />
              <Field label="TOTAL" type="number" value={form.totalAmount} onChange={(v) => setForm({ ...form, totalAmount: v })} />
            </div>
            <button
              type="button"
              disabled={recalculating || saving}
              onClick={() => {
                setRecalculating(true);
                save(true);
              }}
              className="mt-3 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
            >
              {recalculating ? "Recalculando…" : "Recalcular liquidación automática"}
            </button>
          </AdminSection>

          <AdminSection title="Acta y firma">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="N° Acta" value={form.actaNumber} onChange={(v) => setForm({ ...form, actaNumber: v })} />
              <Field label="Código IDF físico" value={form.actaPhysicalCode} onChange={(v) => setForm({ ...form, actaPhysicalCode: v })} />
              <div className="sm:col-span-2">
                <Field label="Firma del cliente" value={form.clientSignature} onChange={(v) => setForm({ ...form, clientSignature: v })} />
              </div>
            </div>
          </AdminSection>

          <AdminSection title="Cargos adicionales">
            {form.charges.map((c, i) =>
              c._deleted ? null : (
                <div key={c.id ?? `new-${i}`} className="mb-2 flex flex-wrap gap-2">
                  <input value={c.concept} onChange={(e) => { const charges = [...form.charges]; charges[i] = { ...c, concept: e.target.value }; setForm({ ...form, charges }); }} placeholder="Concepto" className="min-w-[140px] flex-1 rounded border px-2 py-1.5 text-sm" />
                  <input type="number" value={c.amount} onChange={(e) => { const charges = [...form.charges]; charges[i] = { ...c, amount: e.target.value }; updateLineAmounts({ charges }); }} placeholder="Valor" className="w-24 rounded border px-2 py-1.5 text-sm" />
                  <button type="button" onClick={() => { const charges = [...form.charges]; charges[i] = { ...c, _deleted: true }; updateLineAmounts({ charges }); }} className="text-xs text-red-600">Eliminar</button>
                </div>
              )
            )}
            <button type="button" onClick={() => setForm({ ...form, charges: [...form.charges, { concept: "", amount: "0" }] })} className="text-sm text-teal-700 hover:underline">+ Agregar cargo</button>
          </AdminSection>

          <AdminSection title="Pagos registrados">
            {form.payments.map((p, i) =>
              p._deleted ? null : (
                <div key={p.id ?? `pay-${i}`} className="mb-3 rounded border bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Fecha" type="date" value={p.paymentDate} onChange={(v) => { const payments = [...form.payments]; payments[i] = { ...p, paymentDate: v }; setForm({ ...form, payments }); }} />
                    <Field label="Método" select={[...PAYMENT_METHODS]} value={p.method} onChange={(v) => { const payments = [...form.payments]; payments[i] = { ...p, method: v }; setForm({ ...form, payments }); }} />
                    <Field label="N° Factura" value={p.invoiceNumber} onChange={(v) => { const payments = [...form.payments]; payments[i] = { ...p, invoiceNumber: v }; setForm({ ...form, payments }); }} />
                    <Field label="Valor pagado" type="number" value={p.amountPaid} onChange={(v) => { const payments = [...form.payments]; payments[i] = { ...p, amountPaid: v }; setForm({ ...form, payments }); }} />
                    <div className="sm:col-span-2">
                      <Field label="Notas" value={p.notes} onChange={(v) => { const payments = [...form.payments]; payments[i] = { ...p, notes: v }; setForm({ ...form, payments }); }} />
                    </div>
                  </div>
                  <button type="button" onClick={() => { const payments = [...form.payments]; payments[i] = { ...p, _deleted: true }; setForm({ ...form, payments }); }} className="mt-2 text-xs text-red-600">Eliminar pago</button>
                </div>
              )
            )}
            <button type="button" onClick={() => setForm({ ...form, payments: [...form.payments, { paymentDate: new Date().toISOString().slice(0, 10), method: PAYMENT_METHODS[0], invoiceNumber: "", amountPaid: "0", notes: "" }] })} className="text-sm text-teal-700 hover:underline">+ Agregar pago</button>
          </AdminSection>

          <AdminSection title="Equipos a devolver">
            {form.equipment.map((eq, i) => (
              <div key={eq.id} className="mb-3 rounded border bg-white p-3 text-sm">
                <p className="font-medium">{eq.type}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input value={eq.brand} placeholder="Marca" onChange={(e) => { const equipment = [...form.equipment]; equipment[i] = { ...eq, brand: e.target.value }; setForm({ ...form, equipment }); }} className="rounded border px-2 py-1 text-sm" />
                  <input value={eq.model} placeholder="Modelo" onChange={(e) => { const equipment = [...form.equipment]; equipment[i] = { ...eq, model: e.target.value }; setForm({ ...form, equipment }); }} className="rounded border px-2 py-1 text-sm" />
                  <input value={eq.serial} placeholder="Serie" onChange={(e) => { const equipment = [...form.equipment]; equipment[i] = { ...eq, serial: e.target.value }; setForm({ ...form, equipment }); }} className="rounded border px-2 py-1 text-sm" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={eq.delivered} onChange={(e) => { const equipment = [...form.equipment]; equipment[i] = { ...eq, delivered: e.target.checked, condition: e.target.checked ? eq.condition || "BUENO" : "" }; setForm({ ...form, equipment }); }} />
                    Entregado
                  </label>
                  {EQUIPMENT_CONDITIONS.map((c) => (
                    <label key={c.value} className="flex items-center gap-1">
                      <input type="radio" name={`admin-eq-${eq.id}`} checked={eq.condition === c.value} onChange={() => { const equipment = [...form.equipment]; equipment[i] = { ...eq, delivered: true, condition: c.value }; setForm({ ...form, equipment }); }} />
                      {c.label}
                    </label>
                  ))}
                </div>
                <input value={eq.notes} placeholder="Notas" onChange={(e) => { const equipment = [...form.equipment]; equipment[i] = { ...eq, notes: e.target.value }; setForm({ ...form, equipment }); }} className="mt-2 w-full rounded border px-2 py-1 text-sm" />
              </div>
            ))}
          </AdminSection>

          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.brand }}
          >
            {saving && !recalculating ? "Guardando…" : "Guardar todos los cambios"}
          </button>
        </div>
      )}

      {canDelete && (
        <div className={canEdit ? "mt-6 border-t border-amber-200 pt-4" : "mt-4"}>
          <p className="text-sm text-red-700">
            Eliminar la baja borra pagos, equipos y cargos asociados.
          </p>
          <button
            type="button"
            onClick={deleteCancellation}
            className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            Eliminar baja completa
          </button>
        </div>
      )}
    </section>
  );
}

function AdminSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-[#0B1F3A]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  select,
  selectLabels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  select?: string[];
  selectLabels?: Record<string, string>;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm">
          {select.map((s) => (
            <option key={s} value={s}>{selectLabels?.[s] ?? s}</option>
          ))}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
      )}
    </div>
  );
}
