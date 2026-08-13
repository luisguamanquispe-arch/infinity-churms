"use client";

import { useEffect, useState } from "react";
import { COLORS, PRELIQUIDACION_STATUS_LABELS, SIGNATURE_LINK_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface LineItem {
  id?: string;
  category: string;
  concept: string;
  amount: string | number;
}

interface Preliquidacion {
  id: string;
  version: number;
  status: string;
  docNumber: string | null;
  totalAmount: string | number;
  creditsAmount: string | number;
  subtotal: string | number;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  approvedAt?: string | null;
  lineItems: LineItem[];
  approvalTokens?: {
    status: string;
    expiresAt: string;
    sentAt: string | null;
    openedAt: string | null;
  }[];
}

interface PreliquidacionPanelProps {
  cancellationId: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  activePreliquidacion?: Preliquidacion | null;
  canPreliquidate: boolean;
  canSendLink: boolean;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
}

export function PreliquidacionPanel(props: PreliquidacionPanelProps) {
  const [active, setActive] = useState<Preliquidacion | null>(props.activePreliquidacion ?? null);
  const [versions, setVersions] = useState<Preliquidacion[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const approved = active?.status === "APROBADA" || props.status === "BAJA_AUTORIZADA" || props.status === "PRELIQUIDACION_APROBADA";
  const canContinue =
    approved &&
    ["BAJA_AUTORIZADA", "PRELIQUIDACION_APROBADA"].includes(props.status);

  useEffect(() => {
    setActive(props.activePreliquidacion ?? null);
  }, [props.activePreliquidacion]);

  useEffect(() => {
    if (props.canPreliquidate || props.canSendLink) {
      fetch(`/api/cancellations/${props.cancellationId}/preliquidacion`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.active) setActive(data.active);
          if (data?.versions) setVersions(data.versions);
        })
        .catch(() => null);
    }
  }, [props.cancellationId, props.canPreliquidate, props.canSendLink]);

  async function regenerate() {
    setLoading(true);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate" }),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      props.onMessage(data.error ?? "Error al regenerar");
      return;
    }
    setActive(data);
    props.onMessage(`Preliquidación V${data.version} generada`);
    props.onRefresh();
  }

  async function generateLink() {
    setLoading(true);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      props.onMessage(data.error ?? "Error al generar enlace");
      return;
    }
    setLinkUrl(data.url);
    setWhatsappUrl(data.whatsappUrl ?? null);
    props.onMessage("Enlace generado. Envíelo al cliente por WhatsApp.");
    props.onRefresh();
  }

  async function markSent() {
    setLoading(true);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion/link`, {
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

  async function continueBaja() {
    const r = await fetch(`/api/cancellations/${props.cancellationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance_status" }),
    });
    const data = await r.json();
    if (!r.ok) {
      props.onMessage(data.error ?? "No se pudo continuar");
      return;
    }
    props.onMessage("Baja autorizada — pendiente de pago");
    props.onRefresh();
  }

  const token = active?.approvalTokens?.[0];

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3A]">Preliquidación de baja</h2>
          <p className="text-sm text-slate-600">
            Obligatoria antes de confirmar la baja. El cliente debe aprobar desde su celular.
          </p>
        </div>
        {active && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            V{active.version} · {PRELIQUIDACION_STATUS_LABELS[active.status] ?? active.status}
          </span>
        )}
      </div>

      {!active && (
        <p className="mt-4 text-sm text-amber-700">No hay preliquidación activa. Se generará al crear la baja.</p>
      )}

      {active && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Cliente:</span> {props.customerName}</p>
            <p><span className="text-slate-500">Documento:</span> {active.docNumber ?? "—"}</p>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Detalle</p>
            <ul className="mt-2 space-y-1 text-sm">
              {active.lineItems.map((l, i) => (
                <li key={l.id ?? i} className="flex justify-between gap-2">
                  <span>{l.concept}</span>
                  <span className="font-medium">{formatUsd(Number(l.amount))}</span>
                </li>
              ))}
            </ul>
            {Number(active.creditsAmount) > 0 && (
              <div className="mt-2 flex justify-between border-t pt-2 text-sm text-teal-700">
                <span>Créditos a favor</span>
                <span>-{formatUsd(Number(active.creditsAmount))}</span>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t pt-2 text-base font-bold">
              <span>TOTAL PRELIQUIDADO</span>
              <span style={{ color: COLORS.brand }}>{formatUsd(Number(active.totalAmount))}</span>
            </div>
          </div>

          {active.status === "RECHAZADA" && active.rejectionReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">Motivo de rechazo del cliente</p>
              <p className="mt-1">{active.rejectionReason}</p>
              {active.rejectedAt && (
                <p className="mt-1 text-xs opacity-80">
                  {new Date(active.rejectedAt).toLocaleString("es-VE")}
                </p>
              )}
            </div>
          )}

          {approved && active.approvedAt && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
              Aprobada por el cliente el {new Date(active.approvedAt).toLocaleString("es-VE")}
            </div>
          )}

          {token && (
            <p className="text-xs text-slate-500">
              Enlace: {SIGNATURE_LINK_STATUS_LABELS[token.status] ?? token.status}
              {token.expiresAt && ` · Expira ${new Date(token.expiresAt).toLocaleString("es-VE")}`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/cancellations/${props.cancellationId}/preliquidacion?format=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
            >
              Descargar PDF
            </a>

            {props.canSendLink && !approved && active.status !== "SUPERSEDED" && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={generateLink}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: COLORS.brand }}
                >
                  Generar enlace al cliente
                </button>
                {linkUrl && (
                  <>
                    <button type="button" onClick={() => navigator.clipboard.writeText(linkUrl)} className="rounded-lg border px-3 py-2 text-xs">
                      Copiar enlace
                    </button>
                    {whatsappUrl && (
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">
                        Enviar WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={markSent} className="rounded-lg border px-3 py-2 text-xs">
                      Marcar enviado
                    </button>
                  </>
                )}
              </>
            )}

            {props.canPreliquidate && (active.status === "RECHAZADA" || active.status === "GENERADA") && !approved && (
              <button
                type="button"
                disabled={loading}
                onClick={regenerate}
                className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900"
              >
                Nueva versión
              </button>
            )}

            {canContinue && (
              <button
                type="button"
                onClick={continueBaja}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: COLORS.navy }}
              >
                Continuar con baja
              </button>
            )}
          </div>

          {linkUrl && (
            <p className="break-all text-xs text-slate-500">{linkUrl}</p>
          )}
        </div>
      )}

      {versions.length > 1 && (
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Historial de versiones</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {versions.map((v) => (
              <li key={v.id}>
                V{v.version} · {PRELIQUIDACION_STATUS_LABELS[v.status] ?? v.status} · {formatUsd(Number(v.totalAmount))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
