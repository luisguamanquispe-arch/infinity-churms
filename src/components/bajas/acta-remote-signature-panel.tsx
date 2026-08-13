"use client";

import { useEffect, useState } from "react";
import { COLORS, SIGNATURE_LINK_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface SignatureToken {
  id: string;
  status: string;
  expiresAt: string;
  sentAt: string | null;
  openedAt: string | null;
  generatedBy: { name: string };
}

interface FinalLiquidation {
  id: string;
  totalAmount: string | number;
  signedAt?: string | null;
  signatureMode?: string | null;
  clientSignature?: string | null;
}

interface ActaRemoteSignaturePanelProps {
  cancellationId: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  finalLiquidation?: FinalLiquidation | null;
  canSendLink: boolean;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
}

export function ActaRemoteSignaturePanel(props: ActaRemoteSignaturePanelProps) {
  const [token, setToken] = useState<SignatureToken | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = props.status === "LIQUIDACION_FINAL";
  const signed = !!props.finalLiquidation?.signedAt;

  useEffect(() => {
    if (active && props.canSendLink) {
      fetch(`/api/cancellations/${props.cancellationId}/acta/signature-link`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.token) setToken(data.token);
        })
        .catch(() => null);
    }
  }, [props.cancellationId, active, props.canSendLink]);

  async function generateLink() {
    setLoading(true);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/acta/signature-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      props.onMessage(data.error ?? "Error");
      return;
    }
    setLinkUrl(data.url);
    setWhatsappUrl(data.whatsappUrl ?? null);
    props.onMessage("Enlace de firma del acta generado.");
    if (data.token) setToken(data.token);
    props.onRefresh();
  }

  async function markSent() {
    setLoading(true);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/acta/signature-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markSent: true }),
    });
    setLoading(false);
    if (r.ok) {
      props.onMessage("Enlace marcado como enviado.");
      props.onRefresh();
    }
  }

  if (!active) return null;

  return (
    <div className="rounded-xl border border-[#0B1F3A]/20 bg-slate-50 p-4">
      <h3 className="font-semibold text-[#0B1F3A]">Firma remota del acta</h3>
      <p className="mt-1 text-sm text-slate-600">
        Envíe al cliente un enlace para revisar la liquidación final y firmar el acta desde su celular.
      </p>

      {props.finalLiquidation && (
        <p className="mt-2 text-sm">
          Total final:{" "}
          <strong>{formatUsd(Number(props.finalLiquidation.totalAmount))}</strong>
        </p>
      )}

      {signed ? (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
          Acta firmada
          {props.finalLiquidation?.clientSignature && ` por ${props.finalLiquidation.clientSignature}`}
          {props.finalLiquidation?.signedAt &&
            ` el ${new Date(props.finalLiquidation.signedAt).toLocaleString("es-VE")}`}
          {props.finalLiquidation?.signatureMode === "REMOTA" && " (firma remota)"}
        </div>
      ) : (
        <>
          {token && (
            <p className="mt-2 text-xs text-slate-500">
              Enlace: {SIGNATURE_LINK_STATUS_LABELS[token.status] ?? token.status}
              {token.expiresAt && ` · Expira ${new Date(token.expiresAt).toLocaleString("es-VE")}`}
            </p>
          )}

          {props.canSendLink && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={generateLink}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.navy }}
              >
                Generar enlace de firma
              </button>
              {linkUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(linkUrl)}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    Copiar enlace
                  </button>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Enviar WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={markSent} className="rounded-lg border px-3 py-2 text-xs">
                    Marcar enviado
                  </button>
                </>
              )}
            </div>
          )}

          {linkUrl && <p className="mt-2 break-all text-xs text-slate-500">{linkUrl}</p>}
        </>
      )}
    </div>
  );
}
