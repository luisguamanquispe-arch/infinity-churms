"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, PAYMENT_METHODS, EQUIPMENT_CONDITIONS, COLORS, REASON_LABELS, SUSPENSION_POLICIES, EQUIPMENT_TYPES, INSTALLATION_PRORATION_LABEL } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface Detail {
  id: string;
  status: string;
  reason: string;
  actaNumber: string | null;
  clientSignature: string | null;
  requestDate: string;
  monthsCompleted: number;
  permanenceAmount: string;
  tvAmount: string;
  monthlyAmount: string;
  otherAmount: string;
  totalAmount: string;
  invoiceNumber: string | null;
  customer: {
    contract: string;
    name: string;
    cedula: string;
    address: string;
    zone?: string;
    serviceStartDate: string;
    planName: string;
    pendingBalance: string;
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
  payments: { invoiceNumber: string; amountPaid: string; method: string; paymentDate: string }[];
}

interface Permissions {
  charges: boolean;
  payment: boolean;
  equipment: boolean;
  advanceEquipment: boolean;
  close: boolean;
  manageEquipment: boolean;
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
  PDF_PRELIQUIDACION: "Pre-liquidación PDF generada",
};

export function CancellationDetail({
  initial,
  permissions,
}: {
  initial: Detail;
  permissions: Permissions;
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
    await fetch(`/api/cancellations/${data.id}/equipment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipmentId: eqId, ...patch }),
    });
    await refresh();
  }

  async function addEquipment() {
    const res = await fetch(`/api/cancellations/${data.id}/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEquipment),
    });
    if (res.ok) {
      setNewEquipment({ type: "ONU", serial: "", brand: "", model: "" });
      setMsg("Equipo registrado");
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
  const equipmentPhaseOpen = !["EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"].includes(data.status);
  const canAddEquipment = permissions.manageEquipment && !closed && equipmentPhaseOpen;
  const canEditEquipmentDetails = canAddEquipment && data.status === "PENDIENTE_DE_PAGO";
  const canReceiveEquipment = permissions.equipment && !closed && data.status === "PAGADA";

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cliente">
          <Info label="Contrato" value={data.customer.contract} />
          <Info label="Cédula" value={data.customer.cedula} />
          <Info label="Zona" value={data.customer.zone ?? "—"} />
          <Info label="Dirección" value={data.customer.address} />
          <Info label="Plan" value={data.customer.planName} />
          <Info label="Alta" value={new Date(data.customer.serviceStartDate).toLocaleDateString("es-VE")} />
          <Info label="Meses cumplidos" value={String(data.monthsCompleted)} />
          <Info label="Saldo pendiente" value={formatUsd(Number(data.customer.pendingBalance))} />
          {data.customer.hasTvStreaming && data.customer.tvStreamingSince && (
            <Info label="TV Streams desde" value={new Date(data.customer.tvStreamingSince).toLocaleDateString("es-VE")} />
          )}
        </Card>

        <Card title="Resumen de liquidación">
          <Line label={INSTALLATION_PRORATION_LABEL} value={formatUsd(Number(data.permanenceAmount))} />
          <Line label="TV Streams" value={formatUsd(Number(data.tvAmount))} />
          <Line label="Mensualidades" value={formatUsd(Number(data.monthlyAmount))} />
          <Line label="Otros" value={formatUsd(Number(data.otherAmount))} />
          <p className="text-xs text-slate-500">Equipos no incluidos en liquidación</p>
          <div className="mt-3 border-t pt-3 text-lg font-bold">
            TOTAL {formatUsd(Number(data.totalAmount))}
          </div>
        </Card>
      </div>

      <Card title="Pre-liquidación para el cliente">
        <p className="text-sm text-slate-600">
          Documento <strong>informativo de valores a pagar</strong>. En esta etapa el cliente aún no entrega equipos;
          la recepción y el acta se tramitan después del pago.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-800">
          {SUSPENSION_POLICIES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <a
          href={`/api/cancellations/${data.id}/preliquidacion`}
          target="_blank"
          className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: COLORS.brand }}
        >
          Descargar pre-liquidación PDF
        </a>
      </Card>

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
          Registre los equipos que el cliente debe devolver. Seleccione el tipo de equipo y complete marca, modelo y serie.
        </p>
        {data.equipment.length === 0 && (
          <p className="mt-2 text-sm text-amber-700">
            No hay equipos registrados. Use las opciones de abajo para ingresar cada equipo a devolver.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {data.equipment.map((eq) => (
            <div key={eq.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{eq.type}</p>
              <p className="text-slate-600">{eq.brand ?? "—"} / {eq.model ?? "—"} · Serie: {eq.serial ?? "—"}</p>
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
              {!canEditEquipmentDetails && !canReceiveEquipment && (
                <p className="mt-1 text-slate-500">{eq.delivered ? eq.condition : "Pendiente de recepción"}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-teal-200 bg-teal-50/40 p-4">
          <p className="text-sm font-semibold text-[#0B1F3A]">Ingresar equipo a devolver</p>
          <p className="mt-1 text-xs text-slate-600">Seleccione el tipo de equipo:</p>
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
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Marca"
              disabled={!canAddEquipment}
              value={newEquipment.brand}
              onChange={(e) => setNewEquipment({ ...newEquipment, brand: e.target.value })}
              className="rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            />
            <input
              placeholder="Modelo"
              disabled={!canAddEquipment}
              value={newEquipment.model}
              onChange={(e) => setNewEquipment({ ...newEquipment, model: e.target.value })}
              className="rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            />
            <input
              placeholder="Serie"
              disabled={!canAddEquipment}
              value={newEquipment.serial}
              onChange={(e) => setNewEquipment({ ...newEquipment, serial: e.target.value })}
              className="rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          {canAddEquipment ? (
            <button
              onClick={addEquipment}
              className="mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: COLORS.brand }}
            >
              + Agregar {newEquipment.type}
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
        <div className="mt-3">
          <label className="text-xs text-slate-600">Firma del cliente (nombre completo)</label>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Nombre y apellido del cliente"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={saveSignature} className="rounded-lg border px-4 py-2 text-sm">Guardar firma</button>
          <a href={`/api/cancellations/${data.id}/acta`} target="_blank" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: COLORS.navy }}>
            Descargar acta PDF + QR
          </a>
        </div>
      </Card>

      {!closed && permissions.payment && !["PAGADA", "EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"].includes(data.status) && (
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

function Field({ label, value, onChange, type = "text", select }: { label: string; value: string; onChange: (v: string) => void; type?: string; select?: string[] }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm">
          {select.map((s) => <option key={s}>{s}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
      )}
    </div>
  );
}
