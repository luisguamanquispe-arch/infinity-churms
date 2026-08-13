"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { SignaturePad } from "@/components/cambio-plan/signature-pad";

interface ActaData {
  customerName: string;
  cedula: string;
  contract: string;
  planName: string;
  requestDate: string;
  preliquidacionTotal: number;
  equipmentAdjustment: number;
  totalAmount: number;
  preliquidacionVersion: number;
  equipment: {
    type: string;
    brand: string | null;
    model: string | null;
    serial: string | null;
    delivered: boolean;
    condition: string | null;
    chargeAmount: number;
  }[];
  signed?: boolean;
  error?: string;
}

export default function ActaFirmaRemotaPage() {
  const params = useParams();
  const token = String(params.token);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ActaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signatureImage, setSignatureImage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/baja/acta/${token}`);
    const json = await r.json();
    setLoading(false);

    if (!r.ok) {
      setError(json.error ?? "INVALID");
      return;
    }
    setData(json);
    setClientName(json.customerName ?? "");
    if (json.signed) setDone(true);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!accepted || !clientName.trim() || !signatureImage) return;
    setSubmitting(true);
    const r = await fetch(`/api/baja/acta/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete",
        clientName,
        signatureImageData: signatureImage,
        accepted: true,
      }),
    });
    const json = await r.json();
    setSubmitting(false);
    if (!r.ok) {
      setError(json.error ?? "Error");
      return;
    }
    setDone(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p className="text-slate-600">Cargando acta de baja…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-red-700">Enlace no disponible</p>
          <p className="mt-2 text-sm text-slate-600">
            {error === "EXPIRED"
              ? "Este enlace ha expirado. Solicite uno nuevo a su asesor."
              : error === "COMPLETED"
                ? "El acta ya fue firmada."
                : "El enlace no es válido o fue cancelado."}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <p className="text-2xl">✓</p>
          <p className="mt-2 text-lg font-bold text-teal-800">Acta firmada correctamente</p>
          <p className="mt-2 text-sm text-slate-600">
            Gracias, {data.customerName}. Su baja será completada por Infinity Internet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase" style={{ color: COLORS.brand }}>
            Infinity Internet
          </p>
          <h1 className="mt-2 text-xl font-bold text-[#0B1F3A]">Acta de baja — liquidación final</h1>
          <p className="text-sm text-slate-500">Contrato {data.contract}</p>

          <dl className="mt-6 space-y-2 text-sm">
            <Row label="Cliente" value={data.customerName} />
            <Row label="Cédula" value={data.cedula} />
            <Row label="Plan" value={data.planName} />
            <Row label="Fecha solicitud" value={new Date(data.requestDate).toLocaleDateString("es-VE")} />
          </dl>

          <div className="mt-6 rounded-lg border bg-slate-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Liquidación</p>
            <div className="mt-2 flex justify-between">
              <span>Preliquidación V{data.preliquidacionVersion} (aprobada)</span>
              <span>{formatUsd(data.preliquidacionTotal)}</span>
            </div>
            {data.equipmentAdjustment !== 0 && (
              <div className="mt-1 flex justify-between text-teal-700">
                <span>Ajuste por equipos devueltos</span>
                <span>{formatUsd(data.equipmentAdjustment)}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t pt-2 text-base font-bold">
              <span>Total final</span>
              <span style={{ color: COLORS.brand }}>{formatUsd(data.totalAmount)}</span>
            </div>
          </div>

          {data.equipment.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Equipos</p>
              <ul className="mt-2 space-y-2 text-sm">
                {data.equipment.map((eq, i) => (
                  <li key={i} className="rounded border bg-white p-2">
                    <p className="font-medium">{eq.type}</p>
                    <p className="text-slate-600">
                      {eq.brand ?? "—"} / {eq.model ?? "—"} · Serie: {eq.serial ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {eq.delivered ? eq.condition ?? "DEVUELTO" : "NO DEVUELTO"}
                      {eq.chargeAmount > 0 && ` · Cargo: ${formatUsd(eq.chargeAmount)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium">Nombre completo (como en cédula)</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
            />
            <span>
              He revisado el acta de baja, la liquidación final y los equipos registrados. Estoy de acuerdo
              con el total indicado.
            </span>
          </label>

          <p className="mt-6 text-sm font-medium">Firma digital</p>
          <div className="mt-2">
            <SignaturePad value={signatureImage} onChange={setSignatureImage} disabled={submitting} />
          </div>

          <button
            type="button"
            disabled={!accepted || !clientName.trim() || !signatureImage || submitting}
            onClick={submit}
            className="mt-6 w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.brand }}
          >
            Firmar acta de baja
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
