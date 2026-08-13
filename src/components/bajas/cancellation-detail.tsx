"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, PAYMENT_METHODS, EQUIPMENT_CONDITIONS, COLORS, REASON_LABELS, SUSPENSION_POLICIES, EQUIPMENT_TYPES, INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL, STREAMS_SUPPORT_SINCE_LABEL, getEquipmentReportStatus, WITHDRAWAL_REQUEST_PDF_LABEL } from "@/lib/constants";
import { isEquipmentReceptionComplete } from "@/lib/equipment-reception";
import { formatUsd } from "@/lib/liquidation";
import { PermanenceSummaryPanel } from "@/components/bajas/permanence-summary-panel";
import { CancellationAdminPanel } from "@/components/bajas/cancellation-admin-panel";
import { PreliquidacionPanel } from "@/components/bajas/preliquidacion-panel";
import { ActaRemoteSignaturePanel } from "@/components/bajas/acta-remote-signature-panel";
import type { PermanenceSummary } from "@/lib/permanence";
import { technologyLabel } from "@/lib/permanence";

interface Detail {
  id: string;
  status: string;
  reason: string;
  notes: string | null;
  actaNumber: string | null;
  actaPhysicalCode: string | null;
  clientSignature: string | null;
  requestDate: string;
  closeDate: string | null;
  permanenceStartDate: string | null;
  originTechnology: string | null;
  currentTechnology: string | null;
  fiberInstallPending: boolean | null;
  monthsCompleted: number;
  permanenceAmount: string;
  tvAmount: string;
  monthlyAmount: string;
  equipmentAmount: string;
  otherAmount: string;
  totalAmount: string;
  invoiceNumber: string | null;
  withdrawalRequestFileName: string | null;
  withdrawalRequestUploadedAt: string | null;
  customer: {
    contract: string;
    name: string;
    cedula: string;
    address: string;
    zone?: string;
    serviceStartDate: string;
    planName: string;
    phone?: string | null;
    pendingBalance: string;
    originTechnology?: string;
    currentTechnology?: string;
    fiberInstallDate?: string | null;
    fiberMigrationDate?: string | null;
    hasTvStreaming: boolean;
    tvStreamingSince: string | null;
  };
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
  charges: { id: string; concept: string; amount: string }[];
  payments: { id: string; invoiceNumber: string; amountPaid: string; method: string; paymentDate: string; notes: string | null }[];
  activePreliquidacion?: {
    id: string;
    version: number;
    status: string;
    docNumber: string | null;
    totalAmount: string;
    creditsAmount: string;
    subtotal: string;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    approvedAt?: string | null;
    lineItems: { id: string; category: string; concept: string; amount: string }[];
    approvalTokens?: { status: string; expiresAt: string; sentAt: string | null; openedAt: string | null }[];
  } | null;
  finalLiquidations?: {
    id: string;
    totalAmount: string;
    equipmentAdjustment: string;
    preliquidacionTotal: string;
    version: number;
    signedAt?: string | null;
    clientSignature?: string | null;
    signatureMode?: string | null;
  }[];
}

interface Permissions {
  charges: boolean;
  payment: boolean;
  equipment: boolean;
  advanceEquipment: boolean;
  close: boolean;
  manageEquipment: boolean;
  edit: boolean;
  delete: boolean;
  preliquidate: boolean;
  preliquidateEdit: boolean;
  preliquidateSend: boolean;
  preliquidateView: boolean;
  liquidate: boolean;
  actaSend: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string; role: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Baja creada",
  ADD_CHARGE: "Cargo agregado",
  PAYMENT: "Pago registrado",
  EQUIPMENT: "Equipo actualizado",
  ADD_EQUIPMENT: "Equipo agregado a la baja",
  STATUS: "Cambio de estado",
  SIGNATURE: "Firma registrada",
  PRELIQUIDACION_GENERATED: "Preliquidación generada",
  PRELIQUIDACION_REGENERATED: "Nueva versión de preliquidación",
  PRELIQUIDACION_LINK: "Enlace de preliquidación generado",
  PRELIQUIDACION_LINK_SENT: "Enlace enviado al cliente",
  PRELIQUIDACION_APPROVED: "Cliente aprobó preliquidación",
  PRELIQUIDACION_REJECTED: "Cliente rechazó preliquidación",
  FINAL_LIQUIDATION: "Liquidación final generada",
  ACTA_SIGNATURE_LINK: "Enlace firma acta generado",
  ACTA_LINK_SENT: "Enlace acta enviado",
  ACTA_SIGNED_REMOTE: "Cliente firmó acta remotamente",
  PDF_PRELIQUIDACION: "Pre-liquidación PDF generada",
  UPDATE: "Baja editada",
  DELETE: "Baja eliminada",
  DELETE_CHARGE: "Cargo eliminado",
};

export function CancellationDetail({
  initial,
  permissions,
  permanenceSummary,
}: {
  initial: Detail;
  permissions: Permissions;
  permanenceSummary?: PermanenceSummary | null;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [msg, setMsg] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [signature, setSignature] = useState(initial.clientSignature ?? "");
  const [charge, setCharge] = useState({ concept: "", amount: "" });
  const [newEquipment, setNewEquipment] = useState({ type: "ONU", serial: "", brand: "", model: "" });
  const [payment, setPayment] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    method: PAYMENT_METHODS[0] as string,
    invoiceNumber: "",
    amountPaid: String(initial.totalAmount),
    notes: "",
  });

  useEffect(() => {
    fetch(`/api/cancellations/${data.id}/audit`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAudit);
  }, [data.id]);

  async function refresh() {
    const res = await fetch(`/api/cancellations/${data.id}`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setSignature(json.clientSignature ?? "");
    }
    router.refresh();
    const auditRes = await fetch(`/api/cancellations/${data.id}/audit`);
    if (auditRes.ok) setAudit(await auditRes.json());
  }

  async function saveSignature() {
    await fetch(`/api/cancellations/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_signature", clientSignature: signature }),
    });
    setMsg("Firma guardada");
    await refresh();
  }

  async function addCharge() {
    await fetch(`/api/cancellations/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_charge", concept: charge.concept, amount: parseFloat(charge.amount) }),
    });
    setCharge({ concept: "", amount: "" });
    await refresh();
  }

  async function saveEquipment(eqId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/cancellations/${data.id}/equipment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId: eqId, ...patch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMsg((err as { error?: string }).error ?? "Error al guardar equipo");
      return;
    }
    await refresh();
  }

  async function addEquipment() {
    if (!isEquipmentReceptionComplete(newEquipment.brand, newEquipment.model, newEquipment.serial)) {
      setMsg("Complete marca, modelo y serie para registrar el equipo como entregado");
      return;
    }
    const res = await fetch(`/api/cancellations/${data.id}/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEquipment),
    });
    if (res.ok) {
      setNewEquipment({ type: "ONU", serial: "", brand: "", model: "" });
      setMsg("Equipo registrado como entregado");
      await refresh();
    } else {
      const err = await res.json();
      setMsg(err.error ?? "Error al agregar equipo");
    }
  }

  async function registerPayment() {
    if (!payment.invoiceNumber.trim()) {
      setMsg("Número de factura obligatorio");
      return;
    }
    const res = await fetch(`/api/cancellations/${data.id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payment, amountPaid: parseFloat(payment.amountPaid) }),
    });
    if (res.ok) {
      setMsg("Pago registrado");
      await refresh();
    } else {
      const err = await res.json();
      setMsg(err.error ?? "Error");
    }
  }

  async function advance() {
    const res = await fetch(`/api/cancellations/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance_status" }),
    });
    const err = await res.json();
    if (!res.ok) setMsg(err.error ?? "Error");
    else await refresh();
  }

  const closed = data.status === "BAJA_COMPLETADA";
  const preliqApproved =
    data.activePreliquidacion?.status === "APROBADA" ||
    ["BAJA_AUTORIZADA", "PENDIENTE_DE_PAGO", "PAGADA", "LIQUIDACION_FINAL", "EQUIPOS_RECUPERADOS"].includes(data.status);
  const equipmentPhaseOpen = !["EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"].includes(data.status);
  const canAddEquipment = permissions.manageEquipment && !closed && equipmentPhaseOpen && preliqApproved;
  const canEditEquipmentDetails = canAddEquipment && ["PENDIENTE_DE_PAGO", "BAJA_AUTORIZADA"].includes(data.status);
  const canReceiveEquipment = permissions.equipment && !closed && data.status === "PAGADA";
  const canPay =
    permissions.payment &&
    preliqApproved &&
    ["BAJA_AUTORIZADA", "PENDIENTE_DE_PAGO"].includes(data.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">← <Link href="/bajas">Bajas</Link></p>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">{data.customer.name}</h1>
          <p className="text-sm text-slate-500">Contrato {data.customer.contract}</p>
          <p className="text-xs text-slate-500">{REASON_LABELS[data.reason] ?? data.reason}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
          {STATUS_LABELS[data.status]}
        </span>
      </header>

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      {(permissions.edit || permissions.delete) && (
        <CancellationAdminPanel
          data={data}
          canEdit={permissions.edit}
          canDelete={permissions.delete}
          onMessage={setMsg}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cliente">
          <Info label="Contrato" value={data.customer.contract} />
          <Info label="Cédula" value={data.customer.cedula} />
          <Info label="Zona" value={data.customer.zone ?? "—"} />
          <Info label="Dirección" value={data.customer.address} />
          <Info label="Plan" value={data.customer.planName} />
          <Info label="Alta (antigüedad)" value={new Date(data.customer.serviceStartDate).toLocaleDateString("es-VE")} />
          {data.originTechnology && (
            <Info label="Tecnología origen" value={technologyLabel(data.originTechnology)} />
          )}
          {data.currentTechnology && (
            <Info label="Tecnología actual" value={technologyLabel(data.currentTechnology)} />
          )}
          {data.permanenceStartDate && (
            <Info
              label="Inicio permanencia fibra"
              value={new Date(data.permanenceStartDate).toLocaleDateString("es-VE")}
            />
          )}
          <Info label="Meses en fibra/servicio" value={String(data.monthsCompleted)} />
          {data.fiberInstallPending !== null && (
            <Info
              label="Instalación fibra"
              value={data.fiberInstallPending ? "PENDIENTE" : "NO PENDIENTE"}
            />
          )}
          <Info label="Saldo pendiente" value={formatUsd(Number(data.customer.pendingBalance))} />
          {data.customer.hasTvStreaming && data.customer.tvStreamingSince && (
            <Info label={STREAMS_SUPPORT_SINCE_LABEL} value={new Date(data.customer.tvStreamingSince).toLocaleDateString("es-VE")} />
          )}
        </Card>

        <Card title="Resumen de liquidación">
          <Line label={INSTALLATION_PRORATION_LABEL} value={formatUsd(Number(data.permanenceAmount))} />
          <Line label={STREAMS_SUPPORT_LABEL} value={formatUsd(Number(data.tvAmount))} />
          <Line label="Mensualidades" value={formatUsd(Number(data.monthlyAmount))} />
          <Line label="Otros" value={formatUsd(Number(data.otherAmount))} />
          <p className="text-xs text-slate-500">Equipos no incluidos en liquidación</p>
          <div className="mt-3 border-t pt-3 text-lg font-bold">
            TOTAL {formatUsd(Number(data.totalAmount))}
          </div>
        </Card>
      </div>

      {permanenceSummary && (
        <PermanenceSummaryPanel summary={permanenceSummary} compact />
      )}

      <Card title="Documento archivado — solicitud de retiro">
        {data.withdrawalRequestFileName ? (
          <>
            <p className="text-sm text-slate-600">
              PDF registrado al crear la baja
              {data.withdrawalRequestUploadedAt && (
                <>
                  {" "}
                  el{" "}
                  {new Date(data.withdrawalRequestUploadedAt).toLocaleString("es-VE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </>
              )}
              .
            </p>
            <p className="mt-2 text-sm font-medium text-[#0B1F3A]">
              {data.withdrawalRequestFileName}
            </p>
            <a
              href={`/api/cancellations/${data.id}/solicitud-retiro`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: COLORS.navy }}
            >
              Ver / descargar {WITHDRAWAL_REQUEST_PDF_LABEL}
            </a>
          </>
        ) : (
          <p className="text-sm text-amber-800">
            Esta baja no tiene {WITHDRAWAL_REQUEST_PDF_LABEL} archivado (registro anterior al
            requisito obligatorio).
          </p>
        )}
      </Card>

      {(permissions.preliquidateView || permissions.preliquidate || permissions.preliquidateSend) && (
        <PreliquidacionPanel
          cancellationId={data.id}
          status={data.status}
          customerName={data.customer.name}
          customerPhone={data.customer.phone ?? null}
          activePreliquidacion={data.activePreliquidacion}
          canPreliquidate={permissions.preliquidateEdit || permissions.preliquidate}
          canSendLink={permissions.preliquidateSend}
          onRefresh={refresh}
          onMessage={setMsg}
        />
      )}

      {!preliqApproved && !closed && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El pago, la devolución de equipos y el cierre de la baja permanecen bloqueados hasta que el cliente apruebe la preliquidación.
        </p>
      )}

      {data.finalLiquidations && data.finalLiquidations.length > 0 && (
        <Card title="Liquidación final">
          {data.finalLiquidations.map((fl) => (
            <div key={fl.id} className="text-sm">
              <p>Versión {fl.version}</p>
              <p>Preliquidación aprobada: {formatUsd(Number(fl.preliquidacionTotal))}</p>
              <p>Ajuste por equipos: {formatUsd(Number(fl.equipmentAdjustment))}</p>
              <p className="mt-2 text-lg font-bold">Total final: {formatUsd(Number(fl.totalAmount))}</p>
            </div>
          ))}
        </Card>
      )}

      {!closed && permissions.charges && (
        <Card title="Otros valores">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Concepto" value={charge.concept} onChange={(e) => setCharge({ ...charge, concept: e.target.value })} className="rounded border px-3 py-1.5 text-sm" />
            <input placeholder="Valor" type="number" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value })} className="w-24 rounded border px-3 py-1.5 text-sm" />
            <button onClick={addCharge} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white">+ Agregar cargo</button>
          </div>
          <ul className="mt-2 text-sm">
            {data.charges.map((c) => (
              <li key={c.id} className="flex justify-between border-t py-1">
                <span>{c.concept}</span>
                <span>{formatUsd(Number(c.amount))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Recepción de equipos a devolver">
        <p className="text-sm text-slate-600">
          Registre los equipos devueltos con marca, modelo y serie. Al completar los datos se marcan automáticamente como entregados y aparecen en el acta.
        </p>
        {data.equipment.length === 0 && (
          <p className="mt-2 text-sm text-amber-700">
            No hay equipos registrados. Use las opciones de abajo para ingresar cada equipo a devolver.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {data.equipment.map((eq) => (
            <div
              key={`${eq.id}-${eq.brand ?? ""}-${eq.model ?? ""}-${eq.serial ?? ""}-${eq.delivered}-${eq.condition ?? ""}`}
              className="rounded-lg border p-3 text-sm"
            >
              <p className="font-medium">{eq.type}</p>
              <p className="text-slate-600">{eq.brand ?? "—"} / {eq.model ?? "—"} · Serie: {eq.serial ?? "—"}</p>
              <p className={`mt-1 text-xs ${eq.delivered ? "font-medium text-teal-700" : "text-slate-500"}`}>
                {getEquipmentReportStatus(eq.delivered, eq.condition)}
              </p>
              {canEditEquipmentDetails && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input placeholder="Marca" defaultValue={eq.brand ?? ""} onBlur={(e) => saveEquipment(eq.id, { brand: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                  <input placeholder="Modelo" defaultValue={eq.model ?? ""} onBlur={(e) => saveEquipment(eq.id, { model: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                  <input placeholder="Serie" defaultValue={eq.serial ?? ""} onBlur={(e) => saveEquipment(eq.id, { serial: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                </div>
              )}
              {canReceiveEquipment && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input placeholder="Marca" defaultValue={eq.brand ?? ""} onBlur={(e) => saveEquipment(eq.id, { brand: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                    <input placeholder="Modelo" defaultValue={eq.model ?? ""} onBlur={(e) => saveEquipment(eq.id, { model: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                    <input placeholder="Serie" defaultValue={eq.serial ?? ""} onBlur={(e) => saveEquipment(eq.id, { serial: e.target.value })} className="rounded border px-2 py-1 text-xs" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={eq.delivered} onChange={(e) => saveEquipment(eq.id, { delivered: e.target.checked, condition: e.target.checked ? "BUENO" : null })} />
                      Entregado
                    </label>
                    {eq.delivered && EQUIPMENT_CONDITIONS.map((c) => (
                      <label key={c.value} className="flex items-center gap-1">
                        <input type="radio" name={`cond-${eq.id}`} checked={eq.condition === c.value} onChange={() => saveEquipment(eq.id, { delivered: true, condition: c.value })} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-teal-200 bg-teal-50/40 p-4">
          <p className="text-sm font-semibold text-[#0B1F3A]">Ingresar equipo a devolver</p>
            <p className="mt-1 text-xs text-slate-600">
              Seleccione el tipo de equipo. Marca, modelo y serie son obligatorios; al completarlos se registra como entregado.
            </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EQUIPMENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={!canAddEquipment}
                onClick={() => setNewEquipment({ ...newEquipment, type: t })}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  newEquipment.type === t
                    ? "border-[#00A9B5] bg-[#00A9B5] text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-700 hover:border-[#00A9B5]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                placeholder="Marca *"
                required
                disabled={!canAddEquipment}
                value={newEquipment.brand}
                onChange={(e) => setNewEquipment({ ...newEquipment, brand: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm uppercase disabled:bg-slate-100"
              />
              <input
                placeholder="Modelo *"
                required
                disabled={!canAddEquipment}
                value={newEquipment.model}
                onChange={(e) => setNewEquipment({ ...newEquipment, model: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm uppercase disabled:bg-slate-100"
              />
              <input
                placeholder="Serie *"
                required
                disabled={!canAddEquipment}
                value={newEquipment.serial}
                onChange={(e) => setNewEquipment({ ...newEquipment, serial: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm uppercase disabled:bg-slate-100"
              />
            </div>
          {canAddEquipment ? (
            <button
              onClick={addEquipment}
              className="mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: COLORS.brand }}
            >
              + Agregar {newEquipment.type} como entregado
            </button>
          ) : (
            <p className="mt-3 text-xs text-amber-700">
              {closed || !equipmentPhaseOpen
                ? "Esta baja ya no admite nuevos equipos."
                : "Sin permiso para registrar equipos en esta baja."}
            </p>
          )}
        </div>
        {data.status === "PAGADA" && permissions.advanceEquipment && (
          <button onClick={advance} className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: COLORS.brand }}>
            Confirmar equipos recuperados
          </button>
        )}
      </Card>

      <Card title="Acta de recepción">
        <p className="text-sm text-slate-600">
          N° Acta: {data.actaNumber ?? "Se asignará al generar PDF (formato ACTA-AAAA-000001)"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Código identificación física:{" "}
          <span className="font-mono font-semibold text-[#0B1F3A]">
            {data.actaPhysicalCode ?? "Se asignará al generar PDF (formato IDF-AAAA-000001)"}
          </span>
        </p>

        <ActaRemoteSignaturePanel
          cancellationId={data.id}
          status={data.status}
          customerName={data.customer.name}
          customerPhone={data.customer.phone ?? null}
          finalLiquidation={data.finalLiquidations?.[0] ?? null}
          canSendLink={permissions.actaSend}
          onRefresh={refresh}
          onMessage={setMsg}
        />

        <div className="mt-3">
          <label className="text-xs text-slate-600">Firma del cliente (nombre completo — presencial)</label>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Nombre y apellido del cliente"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={saveSignature} className="rounded-lg border px-4 py-2 text-sm">Guardar firma presencial</button>
          <a href={`/api/cancellations/${data.id}/acta`} target="_blank" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: COLORS.navy }}>
            Descargar acta PDF + QR
          </a>
        </div>
        {data.status === "LIQUIDACION_FINAL" && permissions.close && (
          <>
            {!data.finalLiquidations?.[0]?.signedAt && (
              <p className="mt-3 text-sm text-amber-800">
                Debe obtener la firma del cliente (remota o presencial) antes de completar la baja.
              </p>
            )}
            <button
              onClick={advance}
              disabled={!data.finalLiquidations?.[0]?.signedAt && !data.clientSignature?.trim()}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              Completar baja
            </button>
          </>
        )}
      </Card>

      {!preliqApproved && !closed && permissions.payment && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El registro de pago está bloqueado hasta que el cliente apruebe la preliquidación.
        </p>
      )}

      {canPay && (
        <Card title="Registro de pago">
          <p className="mb-3 text-xs text-amber-700">Factura obligatoria para continuar el proceso</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha pago" type="date" value={payment.paymentDate} onChange={(v) => setPayment({ ...payment, paymentDate: v })} />
            <Field label="Método" select={PAYMENT_METHODS as unknown as string[]} value={payment.method} onChange={(v) => setPayment({ ...payment, method: v })} />
            <Field label="N° Factura *" value={payment.invoiceNumber} onChange={(v) => setPayment({ ...payment, invoiceNumber: v })} />
            <Field label="Valor pagado" type="number" value={payment.amountPaid} onChange={(v) => setPayment({ ...payment, amountPaid: v })} />
          </div>
          <button onClick={registerPayment} className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: COLORS.brand }}>
            Registrar pago
          </button>
        </Card>
      )}

      {data.payments.length > 0 && (
        <Card title="Pagos registrados">
          {data.payments.map((p, i) => (
            <p key={i} className="text-sm">Factura {p.invoiceNumber} — {formatUsd(Number(p.amountPaid))} — {p.method}</p>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {data.status === "EQUIPOS_RECUPERADOS" && permissions.close && (
          <button onClick={advance} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: COLORS.navy }}>
            Cerrar baja (requiere factura)
          </button>
        )}
        <a href={`/bajas/verificar/${data.id}`} target="_blank" className="rounded-lg border px-4 py-2 text-sm text-slate-600">Ver página QR</a>
      </div>

      {audit.length > 0 && (
        <Card title="Historial de auditoría">
          <ul className="space-y-2 text-sm">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 border-t py-2">
                <span>
                  <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                  {entry.detail && <span className="text-slate-500"> — {entry.detail}</span>}
                </span>
                <span className="text-xs text-slate-500">{entry.user?.name ?? "Sistema"} · {new Date(entry.createdAt).toLocaleString("es-VE")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="text-sm"><span className="text-slate-500">{label}: </span>{value}</p>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span>{label}</span><span className="font-medium">{value}</span></div>;
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
            <option key={s} value={s}>
              {selectLabels?.[s] ?? s}
            </option>
          ))}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
      )}
    </div>
  );
}
