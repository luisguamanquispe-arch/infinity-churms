"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { PublicPageHeader } from "@/components/brand/public-page-header";

interface PreliquidacionData {
  version: number;
  status: string;
  totalAmount: number;
  creditsAmount: number;
  subtotal: number;
  customerName: string;
  contract: string;
  planName: string;
  requestDate: string;
  lineItems: { category: string; concept: string; amount: number }[];
  approved?: boolean;
  rejected?: boolean;
  error?: string;
}

export default function PreliquidacionClientePage() {
  const params = useParams();
  const token = String(params.token);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PreliquidacionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/baja/preliquidacion/${token}`);
    const json = await r.json();
    setLoading(false);

    if (!r.ok) {
      setError(json.error ?? "Enlace no válido");
      return;
    }
    setData(json);
    if (json.approved) setDone("approved");
    if (json.rejected) setDone("rejected");
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve() {
    if (!confirmed) return;
    setSubmitting(true);
    const r = await fetch(`/api/baja/preliquidacion/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", confirmed: true }),
    });
    const json = await r.json();
    setSubmitting(false);
    if (!r.ok) {
      setError(json.error ?? "Error al aprobar");
      return;
    }
    setDone("approved");
  }

  async function reject() {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    const r = await fetch(`/api/baja/preliquidacion/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: rejectReason }),
    });
    const json = await r.json();
    setSubmitting(false);
    if (!r.ok) {
      setError(json.error ?? "Error al rechazar");
      return;
    }
    setDone("rejected");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p className="text-slate-600">Cargando preliquidación…</p>
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
                ? "Esta preliquidación ya fue procesada."
                : "El enlace no es válido o fue cancelado."}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (done === "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <p className="text-2xl">✓</p>
          <p className="mt-2 text-lg font-bold text-teal-800">Preliquidación aprobada</p>
          <p className="mt-2 text-sm text-slate-600">
            Gracias, {data.customerName}. Su asesor continuará con el proceso de baja.
          </p>
        </div>
      </div>
    );
  }

  if (done === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-amber-800">Discrepancia registrada</p>
          <p className="mt-2 text-sm text-slate-600">
            Su asesor revisará los valores y le enviará una nueva preliquidación.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <PublicPageHeader title="Preliquidación de baja" subtitle={`Versión V${data.version}`} />
      <div className="mx-auto max-w-lg px-4 py-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">

        <dl className="mt-6 space-y-2 text-sm">
          <Row label="Cliente" value={data.customerName} />
          <Row label="Contrato" value={data.contract} />
          <Row label="Plan" value={data.planName} />
          <Row label="Fecha solicitud" value={new Date(data.requestDate).toLocaleDateString("es-VE")} />
        </dl>

        <div className="mt-6 rounded-lg border bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Detalle</p>
          <ul className="mt-2 space-y-2 text-sm">
            {data.lineItems.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{l.concept}</span>
                <span className="font-medium">{formatUsd(l.amount)}</span>
              </li>
            ))}
          </ul>
          {data.creditsAmount > 0 && (
            <div className="mt-2 flex justify-between border-t pt-2 text-sm text-teal-700">
              <span>Créditos a favor</span>
              <span>-{formatUsd(data.creditsAmount)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
            <span>Total</span>
            <span style={{ color: COLORS.brand }}>{formatUsd(data.totalAmount)}</span>
          </div>
        </div>

        {!showReject ? (
          <>
            <label className="mt-6 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>He revisado y estoy de acuerdo con la preliquidación.</span>
            </label>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={!confirmed || submitting}
                onClick={approve}
                className="rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                Aprobar preliquidación
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="rounded-lg border py-3 text-sm font-semibold text-slate-700"
              >
                No estoy de acuerdo
              </button>
            </div>
          </>
        ) : (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Motivo de la discrepancia</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Indique qué valor no coincide o qué observación tiene…"
            />
            <button
              type="button"
              disabled={!rejectReason.trim() || submitting}
              onClick={reject}
              className="w-full rounded-lg border border-red-300 bg-red-50 py-3 text-sm font-semibold text-red-800 disabled:opacity-50"
            >
              Enviar discrepancia
            </button>
            <button type="button" onClick={() => setShowReject(false)} className="w-full text-sm text-slate-500">
              Volver
            </button>
          </div>
        )}
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
