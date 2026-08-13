"use client";

import { useEffect, useState } from "react";
import { COLORS, SIGNATURE_LINK_STATUS_LABELS } from "@/lib/constants";

interface SignatureToken {
  id: string;
  status: string;
  expiresAt: string;
  generatedAt: string;
  sentAt: string | null;
  openedAt: string | null;
  processStartedAt: string | null;
  completedAt: string | null;
  generatedBy: { name: string };
}

interface RemoteSignaturePanelProps {
  planChangeId: string;
  status: string;
  customerPhone: string | null;
  customerName: string;
  identitySelfieAt: string | null;
  signatureImageData?: boolean;
  signedAt: string | null;
  canSendLink: boolean;
  canViewIdentity: boolean;
}

export function RemoteSignaturePanel(props: RemoteSignaturePanelProps) {
  const [token, setToken] = useState<SignatureToken | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfieData, setSelfieData] = useState<string | null>(null);

  const pending = props.status === "PENDIENTE_DE_FIRMA";

  useEffect(() => {
    if (pending) {
      fetch(`/api/plan-changes/${props.planChangeId}/signature-link`)
        .then((r) => r.json())
        .then((data) => {
          if (data.token) setToken(data.token);
        })
        .catch(() => null);
    }
  }, [props.planChangeId, pending]);

  async function generateLink(regenerate = false) {
    setLoading(true);
    setError("");
    setMsg("");
    const r = await fetch(`/api/plan-changes/${props.planChangeId}/signature-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: regenerate ? "regenerate" : "generate", markSent: false }),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      setError(data.error ?? "Error");
      return;
    }
    setLinkUrl(data.url);
    setWhatsappUrl(data.whatsappUrl ?? null);
    setMsg(regenerate ? "Nuevo enlace generado." : "Enlace generado.");
    fetch(`/api/plan-changes/${props.planChangeId}/signature-link`)
      .then((res) => res.json())
      .then((d) => d.token && setToken(d.token));
  }

  async function markSent() {
    setLoading(true);
    const r = await fetch(`/api/plan-changes/${props.planChangeId}/signature-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markSent: true }),
    });
    setLoading(false);
    if (r.ok) {
      setMsg("Enlace marcado como enviado.");
      fetch(`/api/plan-changes/${props.planChangeId}/signature-link`)
        .then((res) => res.json())
        .then((d) => d.token && setToken(d.token));
    }
  }

  async function viewSelfie() {
    if (!props.canViewIdentity) return;
    const r = await fetch(`/api/plan-changes/${props.planChangeId}/identity`);
    const data = await r.json();
    if (r.ok) {
      setSelfieData(data.identitySelfieData);
      setSelfieOpen(true);
    }
  }

  if (!pending && !props.signedAt) return null;

  return (
    <section className="rounded-xl border bg-white p-5 space-y-4">
      <h2 className="font-semibold" style={{ color: COLORS.navy }}>
        Firma remota
      </h2>

      {msg && <p className="text-sm text-teal-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {token && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-slate-500">Estado enlace:</span>{" "}
            <strong>{SIGNATURE_LINK_STATUS_LABELS[token.status] ?? token.status}</strong>
          </p>
          <p className="text-xs text-slate-500">
            Generado: {new Date(token.generatedAt).toLocaleString("es-VE")}
            {token.sentAt && ` · Enviado: ${new Date(token.sentAt).toLocaleString("es-VE")}`}
            {token.openedAt && ` · Cliente abrió: ${new Date(token.openedAt).toLocaleString("es-VE")}`}
          </p>
          <p className="text-xs text-slate-500">
            Expira: {new Date(token.expiresAt).toLocaleString("es-VE")}
          </p>
        </div>
      )}

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div>Selfie: {props.identitySelfieAt ? "✓ Recibida" : "— Pendiente"}</div>
        <div>Firma: {props.signatureImageData || props.signedAt ? "✓ Recibida" : "— Pendiente"}</div>
        <div>Adendum: {props.signedAt ? "✓ Firmado" : "— Pendiente"}</div>
      </div>

      {pending && props.canSendLink && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => generateLink(!!token)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.brand }}
          >
            {token ? "Generar nuevo link" : "Generar link temporal"}
          </button>
          {linkUrl && (
            <>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(linkUrl)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Copiar enlace
              </button>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markSent()}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: "#25D366" }}
                >
                  Enviar link por WhatsApp
                </a>
              ) : (
                <p className="text-xs text-amber-700">Sin teléfono registrado para WhatsApp.</p>
              )}
            </>
          )}
        </div>
      )}

      {linkUrl && (
        <p className="break-all text-xs text-slate-500">{linkUrl}</p>
      )}

      {props.canViewIdentity && props.identitySelfieAt && (
        <button type="button" onClick={viewSelfie} className="text-sm underline" style={{ color: COLORS.brand }}>
          Ver selfie de identidad (acceso restringido)
        </button>
      )}

      {selfieOpen && selfieData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] max-w-lg overflow-auto rounded-xl bg-white p-4">
            <p className="mb-2 text-sm font-semibold">Evidencia de identidad — {props.customerName}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selfieData} alt="Selfie identidad" className="max-h-[60vh] w-full object-contain" />
            <button type="button" onClick={() => setSelfieOpen(false)} className="mt-3 w-full rounded-lg border py-2 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
