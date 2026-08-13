"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { COLORS, OPERATION_TYPE_LABELS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { SignaturePad } from "@/components/cambio-plan/signature-pad";
import { compressSelfieImage } from "@/lib/compress-selfie-image";

type Step = 1 | 2 | 3 | 4 | 5;

interface Session {
  error: null;
  expiresAt: string;
  customer: { name: string; cedula: string };
  planChange: {
    operationType: string;
    addendumNumber: string | null;
    previousPlanName: string;
    previousSpeedMbps: number | null;
    previousMonthlyUsd: number;
    newPlanName: string;
    newSpeedMbps: number;
    newMonthlyUsd: number;
    permanenceMonths: number;
  };
  steps: {
    dataConfirmed: boolean;
    adendumAccepted: boolean;
    selfieUploaded: boolean;
    signatureSaved: boolean;
  };
}

export default function FirmaRemotaPage() {
  const params = useParams();
  const token = String(params.token);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [completed, setCompleted] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [adendumAccepted, setAdendumAccepted] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState("");
  const [selfieProcessing, setSelfieProcessing] = useState(false);
  const [signatureImage, setSignatureImage] = useState("");
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/firma/${token}`);
    const data = await r.json();
    setLoading(false);

    if (data.error === "COMPLETED") {
      setErrorType("COMPLETED");
      setCompleted(data);
      return;
    }
    if (data.error === "EXPIRED") {
      setErrorType("EXPIRED");
      return;
    }
    if (data.error === "CANCELLED" || data.error === "INVALID") {
      setErrorType(data.error);
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }

    setSession(data);
    setDataConfirmed(data.steps.dataConfirmed);
    setAdendumAccepted(data.steps.adendumAccepted);
    if (data.steps.signatureSaved) setStep(5);
    else if (data.steps.selfieUploaded) setStep(4);
    else if (data.steps.adendumAccepted) setStep(3);
    else if (data.steps.dataConfirmed) setStep(2);
    else setStep(1);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadSelfieBlob(dataUrl: string) {
    setSubmitting(true);
    setError(null);
    setMsg("");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData();
      fd.append("selfie", blob, "selfie.jpg");

      const r = await fetch(`/api/firma/${token}/selfie`, {
        method: "POST",
        body: fd,
      });

      let data: { error?: string; ok?: boolean; steps?: Session["steps"] };
      try {
        data = await r.json();
      } catch {
        setError(
          r.status === 413
            ? "La imagen es demasiado grande. Intente tomar la foto más cerca."
            : "No se pudo enviar la foto. Verifique su conexión."
        );
        return false;
      }

      if (!r.ok) {
        setError(data.error ?? "No se pudo guardar la selfie.");
        return false;
      }

      setStep(4);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              steps: data.steps ?? { ...prev.steps, selfieUploaded: true },
            }
          : prev
      );
      setMsg("Identidad verificada. Continúe con su firma.");
      return true;
    } catch {
      setError("Error de conexión al enviar la foto.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function action(actionName: string, body: Record<string, unknown> = {}) {
    setSubmitting(true);
    setMsg("");
    setError(null);
    try {
      const r = await fetch(`/api/firma/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...body }),
      });

      let data: { error?: string; ok?: boolean };
      try {
        data = await r.json();
      } catch {
        setError(
          r.status === 413
            ? "La imagen es demasiado grande. Intente tomar la foto más cerca o con menos zoom."
            : "No se pudo enviar la información. Verifique su conexión e intente de nuevo."
        );
        return null;
      }

      if (!r.ok) {
        setError(data.error ?? "Error al procesar la solicitud.");
        return null;
      }
      return data;
    } catch {
      setError("Error de conexión. Intente de nuevo.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmData() {
    if (!dataConfirmed) return;
    const res = await action("confirm_data", { confirmed: true });
    if (res) {
      setStep(2);
      load();
    }
  }

  async function handleAcceptAdendum() {
    if (!adendumAccepted) return;
    const res = await action("accept_adendum", { accepted: true });
    if (res) {
      setStep(3);
      load();
    }
  }

  async function handleSelfieFile(file: File | null) {
    if (!file) return;
    setError(null);
    setMsg("");
    setSelfieProcessing(true);
    setSelfiePreview("");
    try {
      const compressed = await compressSelfieImage(file);
      setSelfiePreview(compressed);
      await uploadSelfieBlob(compressed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la foto.");
    } finally {
      setSelfieProcessing(false);
    }
  }

  async function retryUploadSelfie() {
    if (!selfiePreview) {
      setError("Debe tomar o seleccionar una foto primero.");
      return;
    }
    await uploadSelfieBlob(selfiePreview);
  }

  async function saveSignature() {
    if (!signatureImage) return;
    const res = await action("save_signature", { signatureImageData: signatureImage });
    if (res) {
      setStep(5);
      setSession((prev) =>
        prev ? { ...prev, steps: { ...prev.steps, signatureSaved: true } } : prev
      );
    }
  }

  async function completeProcess() {
    if (!finalConfirm) return;
    const res = await action("complete", { finalConfirm: true });
    if (res) {
      setCompleted(res);
      setErrorType("COMPLETED");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <p className="text-slate-500">Cargando…</p>
      </div>
    );
  }

  if (errorType === "EXPIRED") {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-slate-50 p-6">
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0B1F3A]">Enlace expirado</h1>
          <p className="mt-3 text-sm text-slate-600">
            El enlace de firma ya no está disponible. Comuníquese con Infinity Internet para solicitar un nuevo enlace.
          </p>
        </div>
      </div>
    );
  }

  if (errorType === "COMPLETED" && (completed || session)) {
    const c = completed as Record<string, unknown>;
    return (
      <div className="mx-auto min-h-screen max-w-md bg-slate-50 p-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <div className="text-center">
            <div className="text-4xl text-teal-600">✓</div>
            <h1 className="mt-2 text-xl font-bold text-[#0B1F3A]">Proceso completado</h1>
            <p className="mt-2 text-sm text-slate-600">
              Gracias, {String(c.customerName ?? session?.customer.name ?? "")}.
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1">
            <p><strong>Nuevo plan:</strong> {String(c.newPlanName ?? "")}</p>
            <p><strong>Valor mensual:</strong> {formatUsd(Number(c.newMonthlyUsd ?? 0))}</p>
            {c.permanenceStart != null && (
              <p className="text-xs text-slate-500">
                Permanencia: {new Date(String(c.permanenceStart)).toLocaleDateString("es-VE")} →{" "}
                {c.permanenceEnd != null ? new Date(String(c.permanenceEnd)).toLocaleDateString("es-VE") : "—"}
              </p>
            )}
          </div>
          <a
            href={`/api/firma/${token}/adendum`}
            target="_blank"
            rel="noreferrer"
            className="block w-full rounded-xl py-3 text-center text-sm font-semibold text-white"
            style={{ backgroundColor: COLORS.brand }}
          >
            Ver documento firmado
          </a>
        </div>
      </div>
    );
  }

  if (errorType === "INVALID" || errorType === "CANCELLED") {
    return (
      <div className="mx-auto min-h-screen max-w-md p-6">
        <div className="rounded-xl border bg-white p-6 text-center">
          <h1 className="font-bold">Enlace no válido</h1>
          <p className="mt-2 text-sm text-slate-600">Solicite un nuevo enlace a Infinity Internet.</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const pc = session.planChange;
  const expires = new Date(session.expiresAt);
  const isRenewal = pc.operationType === "RENOVACION" || pc.operationType === "RENOVACION_CAMBIO_PLAN";
  const headerLabel = isRenewal ? "Renovación contractual" : "Cambio de plan";
  const docLabel = isRenewal ? "documento de renovación" : "adendum";
  const samePlan = pc.previousPlanName === pc.newPlanName && pc.previousMonthlyUsd === pc.newMonthlyUsd;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-8">
      <header className="px-4 py-5 text-white" style={{ backgroundColor: COLORS.navy }}>
        <p className="text-xs uppercase tracking-wide opacity-80">{headerLabel}</p>
        <h1 className="text-lg font-bold">Infinity Internet</h1>
        <p className="mt-2 text-sm">Hola, {session.customer.name}</p>
        <p className="mt-1 text-xs opacity-80">
          Enlace válido hasta: {expires.toLocaleDateString("es-VE")} {expires.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </header>

      <div className="px-4 pt-4">
        <div className="mb-4 flex justify-between text-xs font-medium text-slate-500">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={step >= s ? "text-[#00A9B5]" : ""}>Paso {s}</span>
          ))}
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {msg && <div className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{msg}</div>}

        {step === 1 && (
          <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">{isRenewal ? "Revisar renovación" : "Revisar cambio"}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">PLAN ACTUAL</p>
                <p className="font-semibold">{pc.previousPlanName}</p>
                <p>{formatUsd(pc.previousMonthlyUsd)}</p>
              </div>
              <div className="rounded-lg bg-teal-50 p-3">
                <p className="text-xs text-slate-500">{isRenewal ? "PLAN RENOVADO" : "NUEVO PLAN"}</p>
                <p className="font-semibold">{pc.newPlanName}</p>
                <p>{formatUsd(pc.newMonthlyUsd)}</p>
              </div>
            </div>
            {isRenewal && samePlan && (
              <p className="text-sm text-slate-600">Renovación sin cambio de plan ni tarifa.</p>
            )}
            <p className="text-sm">Nueva permanencia: <strong>{pc.permanenceMonths} meses</strong></p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={dataConfirmed} onChange={(e) => setDataConfirmed(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>
                Confirmo que los datos mostrados corresponden a la{" "}
                {isRenewal ? "renovación contractual" : "operación de cambio de plan"} que deseo contratar.
              </span>
            </label>
            <button
              type="button"
              disabled={!dataConfirmed || submitting}
              onClick={handleConfirmData}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              Continuar
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Aceptación contractual</h2>
            <p className="text-sm text-slate-600">
              Declaro que he revisado el {docLabel} y acepto voluntariamente{" "}
              {isRenewal ? "la renovación contractual" : "el cambio de plan"} y las condiciones indicadas.
            </p>
            <a
              href={`/api/firma/${token}/adendum`}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl border py-3 text-center text-sm font-semibold"
              style={{ borderColor: COLORS.brand, color: COLORS.brand }}
            >
              Ver {docLabel}
            </a>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={adendumAccepted} onChange={(e) => setAdendumAccepted(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>He leído y acepto el {docLabel}.</span>
            </label>
            <button
              type="button"
              disabled={!adendumAccepted || submitting}
              onClick={handleAcceptAdendum}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              Continuar
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Verificación de identidad</h2>
            <p className="text-sm text-slate-600">
              Toma una selfie sosteniendo tu documento de identidad junto a tu rostro.
            </p>
            <ul className="list-inside list-disc text-xs text-slate-500 space-y-1">
              <li>Utiliza un lugar bien iluminado</li>
              <li>Tu rostro y la cédula deben verse claramente</li>
              <li>Evita reflejos en el documento</li>
            </ul>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                id="selfie-input"
                onChange={(e) => handleSelfieFile(e.target.files?.[0] ?? null)}
              />
              <span
                className="block w-full cursor-pointer rounded-xl py-3 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: COLORS.navy }}
                onClick={() => document.getElementById("selfie-input")?.click()}
              >
                Abrir cámara / seleccionar foto
              </span>
            </label>
            {selfieProcessing && (
              <p className="text-sm text-slate-500 text-center">Procesando y enviando foto…</p>
            )}
            {submitting && selfiePreview && !selfieProcessing && (
              <p className="text-sm text-slate-500 text-center">Enviando foto…</p>
            )}
            {selfiePreview && step === 3 && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selfiePreview} alt="Vista previa selfie" className="max-h-64 w-full rounded-lg object-contain" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelfiePreview("");
                      setError(null);
                      setMsg("");
                    }}
                    disabled={submitting || selfieProcessing}
                    className="flex-1 rounded-lg border py-2 text-sm disabled:opacity-50"
                  >
                    Repetir foto
                  </button>
                  <button
                    type="button"
                    disabled={submitting || selfieProcessing}
                    onClick={retryUploadSelfie}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: COLORS.brand }}
                  >
                    {submitting ? "Enviando…" : "Reintentar envío"}
                  </button>
                </div>
              </div>
            )}
            {!selfiePreview && !selfieProcessing && (
              <p className="text-xs text-center text-slate-500">
                Al tomar la foto, se enviará automáticamente y pasará al paso de firma.
              </p>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Firma del cliente</h2>
            <p className="text-sm text-slate-600">Firme dentro del recuadro utilizando su dedo.</p>
            <SignaturePad value={signatureImage} onChange={setSignatureImage} />
            <button
              type="button"
              disabled={!signatureImage || submitting}
              onClick={saveSignature}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand }}
            >
              Confirmar firma
            </button>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Confirmación final</h2>
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <p>Cambio: {pc.previousPlanName} → {pc.newPlanName}</p>
              <p>Precio: {formatUsd(pc.previousMonthlyUsd)} → {formatUsd(pc.newMonthlyUsd)}</p>
              <p>Permanencia: {pc.permanenceMonths} meses</p>
              <p>Adendum: {pc.addendumNumber ?? "—"}</p>
              <p>Identidad: Selfie adjunta ✓</p>
              <p>Firma: Registrada ✓</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={finalConfirm} onChange={(e) => setFinalConfirm(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>Confirmo que deseo firmar y activar el cambio de plan.</span>
            </label>
            <button
              type="button"
              disabled={!finalConfirm || submitting}
              onClick={completeProcess}
              className="w-full rounded-xl py-4 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.navy }}
            >
              FIRMAR Y CONFIRMAR CAMBIO
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
