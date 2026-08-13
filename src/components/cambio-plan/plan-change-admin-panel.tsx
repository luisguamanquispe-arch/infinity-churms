"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS, OPERATION_TYPE_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface ServicePlan {
  id: string;
  name: string;
  speedMbps: number;
  monthlyUsd: string;
}

export interface PlanChangeAdminData {
  id: string;
  operationType: string;
  status: string;
  addendumNumber: string | null;
  newPlanId: string | null;
  newPlanName: string;
  newSpeedMbps: number;
  newMonthlyUsd: string;
  standardMonthlyUsd: string;
  discountReason: string | null;
  notes: string | null;
  customer: { contract: string; name: string };
}

type PlanChangePermissions = {
  canEdit: boolean;
  canDelete: boolean;
  canVoid: boolean;
  canConfirm: boolean;
  canApproveDiscount: boolean;
};

function needsPlanSelection(operationType: string) {
  return operationType === "CAMBIO_PLAN" || operationType === "RENOVACION_CAMBIO_PLAN";
}

export function PlanChangeAdminPanel({
  data,
  permissions,
  onMessage,
  onUpdated,
}: {
  data: PlanChangeAdminData;
  permissions: PlanChangePermissions;
  onMessage: (msg: string) => void;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(data.newPlanId ?? "");
  const [monthlyUsd, setMonthlyUsd] = useState(data.newMonthlyUsd);
  const [discountReason, setDiscountReason] = useState(data.discountReason ?? "");
  const [notes, setNotes] = useState(data.notes ?? "");
  const [voidReason, setVoidReason] = useState("");
  const [saving, setSaving] = useState(false);

  const showPlanPicker = needsPlanSelection(data.operationType);
  const editableFull = data.status === "BORRADOR";
  const editableLimited = data.status === "PENDIENTE_DE_FIRMA";
  const canEditFields = permissions.canEdit && (editableFull || editableLimited);
  const canEditNotesOnly =
    permissions.canEdit && ["FIRMADO", "ACTIVO", "ANULADO", "CANCELADO"].includes(data.status);
  const canConfirm = permissions.canConfirm && data.status === "BORRADOR";
  const canVoid = permissions.canVoid && ["ACTIVO", "FIRMADO"].includes(data.status);
  const canDelete =
    permissions.canDelete && ["BORRADOR", "CANCELADO"].includes(data.status);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const standardUsd = selectedPlan
    ? Number(selectedPlan.monthlyUsd)
    : Number(data.standardMonthlyUsd);
  const approvedUsd = Number(monthlyUsd) || 0;
  const hasDiscount = approvedUsd > 0 && approvedUsd < standardUsd;

  useEffect(() => {
    setSelectedPlanId(data.newPlanId ?? "");
    setMonthlyUsd(data.newMonthlyUsd);
    setDiscountReason(data.discountReason ?? "");
    setNotes(data.notes ?? "");
  }, [data]);

  useEffect(() => {
    if (showPlanPicker && permissions.canEdit) {
      fetch("/api/service-plans")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setPlans(Array.isArray(rows) ? rows : []));
    }
  }, [showPlanPicker, permissions.canEdit]);

  useEffect(() => {
    if (selectedPlan && editableFull && monthlyUsd === data.newMonthlyUsd) {
      setMonthlyUsd(selectedPlan.monthlyUsd);
    }
  }, [selectedPlanId, selectedPlan, editableFull, data.newMonthlyUsd, monthlyUsd]);

  const opLabel = OPERATION_TYPE_LABELS[data.operationType] ?? "Operación contractual";

  const panelVisible = useMemo(
    () =>
      canEditFields ||
      canEditNotesOnly ||
      canConfirm ||
      canVoid ||
      canDelete,
    [canEditFields, canEditNotesOnly, canConfirm, canVoid, canDelete]
  );

  if (!panelVisible) return null;

  async function saveUpdate() {
    if (hasDiscount && !discountReason.trim()) {
      onMessage("Indique el motivo del descuento especial.");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = { action: "update", notes };
    if (canEditFields) {
      if (showPlanPicker && selectedPlanId) body.newPlanId = selectedPlanId;
      body.approvedMonthlyUsd = approvedUsd;
      body.discountReason = hasDiscount ? discountReason.trim() : null;
    }
    const res = await fetch(`/api/plan-changes/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al guardar");
      return;
    }
    onMessage("Cambios guardados.");
    onUpdated();
  }

  async function confirmDraft() {
    setSaving(true);
    const res = await fetch(`/api/plan-changes/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al confirmar");
      return;
    }
    onMessage("Documento generado. Pendiente de firma.");
    onUpdated();
  }

  async function voidOperation() {
    if (!voidReason.trim()) {
      onMessage("Indique el motivo de anulación.");
      return;
    }
    if (
      !window.confirm(
        `¿Anular ${opLabel} de ${data.customer.name}?\n\nSi está activa, se revertirá el plan del cliente al anterior.`
      )
    ) {
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/plan-changes/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", reason: voidReason.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al anular");
      return;
    }
    onMessage("Operación anulada.");
    onUpdated();
  }

  async function deleteOperation() {
    if (
      !window.confirm(
        `¿Eliminar permanentemente ${opLabel} de ${data.customer.name}?\n\nEsta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/plan-changes/${data.id}`, { method: "DELETE" });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      onMessage(json.error ?? "Error al eliminar");
      return;
    }
    router.push("/cambio-plan");
  }

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-5 shadow-sm">
      <h2 className="font-semibold text-[#0B1F3A]">Administración (ADMIN / SUPERVISOR)</h2>
      <p className="mt-1 text-sm text-slate-600">
        {opLabel} · {data.customer.contract} · {data.customer.name}
      </p>

      {canEditFields && (
        <div className="mt-5 space-y-4">
          {showPlanPicker && (
            <label className="block text-sm">
              <span className="text-slate-600">Nuevo plan</span>
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">Seleccione plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.speedMbps} Mbps · {formatUsd(Number(p.monthlyUsd))}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-slate-600">Precio mensual aprobado (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlyUsd}
                onChange={(e) => setMonthlyUsd(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <div className="text-sm">
              <span className="text-slate-600">Tarifa estándar</span>
              <p className="mt-2 font-medium">{formatUsd(standardUsd)}</p>
            </div>
          </div>

          {hasDiscount && (
            <label className="block text-sm">
              <span className="text-slate-600">Motivo del descuento</span>
              <input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="Requerido para precio por debajo de tarifa"
              />
              {!permissions.canApproveDiscount && (
                <p className="mt-1 text-xs text-amber-700">
                  Se requiere rol supervisor o administrador para autorizar descuentos.
                </p>
              )}
            </label>
          )}

          {editableLimited && (
            <p className="text-xs text-amber-700">
              Si cambia plan o precio, los enlaces de firma remota activos se invalidarán.
            </p>
          )}
        </div>
      )}

      {(canEditFields || canEditNotesOnly) && (
        <label className="mt-4 block text-sm">
          <span className="text-slate-600">Observaciones internas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {(canEditFields || canEditNotesOnly) && (
          <button
            type="button"
            disabled={saving}
            onClick={saveUpdate}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.navy }}
          >
            Guardar cambios
          </button>
        )}
        {canConfirm && (
          <button
            type="button"
            disabled={saving}
            onClick={confirmDraft}
            className="rounded-lg border border-[#0B1F3A] px-4 py-2 text-sm font-medium text-[#0B1F3A] disabled:opacity-50"
          >
            Confirmar y generar documento
          </button>
        )}
      </div>

      {canVoid && (
        <div className="mt-6 border-t border-amber-200 pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-red-800">Anular operación activa</h3>
          <p className="text-xs text-slate-600">
            Revierte el plan del cliente al estado anterior si la operación está activa.
          </p>
          <input
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Motivo de anulación (obligatorio)"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={voidOperation}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Anular operación
          </button>
        </div>
      )}

      {canDelete && (
        <div className={canVoid ? "mt-4" : "mt-6 border-t border-amber-200 pt-4"}>
          <button
            type="button"
            disabled={saving}
            onClick={deleteOperation}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Eliminar registro permanentemente
          </button>
        </div>
      )}
    </section>
  );
}
