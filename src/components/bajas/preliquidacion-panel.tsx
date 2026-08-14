"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS, PRELIQUIDACION_STATUS_LABELS, SIGNATURE_LINK_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import {
  PRELIQUIDACION_CATEGORY_LABELS,
  summarizePreliquidacionByCategory,
} from "@/lib/preliquidacion-display";

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

interface CustomerInfo {
  name: string;
  cedula: string;
  contract: string;
  planName: string;
  phone: string | null;
  serviceStartDate: string;
  contractPermanenceEnd?: string | null;
  planMonthlyUsd?: string | number | null;
}

interface PreliquidacionPanelProps {
  cancellationId: string;
  status: string;
  customer: CustomerInfo;
  activePreliquidacion?: Preliquidacion | null;
  canPreliquidate: boolean;
  canSendLink: boolean;
  showTechnicalErrors?: boolean;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
}

const CATEGORY_ORDER = ["PERMANENCIA", "MENSUALIDAD", "EQUIPO", "DANOS", "TV", "OTRO", "CREDITO"];

export function PreliquidacionPanel(props: PreliquidacionPanelProps) {
  const [active, setActive] = useState<Preliquidacion | null>(props.activePreliquidacion ?? null);
  const [versions, setVersions] = useState<Preliquidacion[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const approved =
    active?.status === "APROBADA" ||
    props.status === "BAJA_AUTORIZADA" ||
    props.status === "PRELIQUIDACION_APROBADA" ||
    ["PENDIENTE_DE_PAGO", "PAGADA", "LIQUIDACION_FINAL", "EQUIPOS_RECUPERADOS", "BAJA_COMPLETADA"].includes(
      props.status
    );
  const canContinue =
    approved && ["BAJA_AUTORIZADA", "PRELIQUIDACION_APROBADA"].includes(props.status);

  const categoryTotals = useMemo(
    () => summarizePreliquidacionByCategory(active?.lineItems ?? []),
    [active?.lineItems]
  );

  const displayStatus = active
    ? PRELIQUIDACION_STATUS_LABELS[active.status] ?? active.status
    : "Sin generar";

  useEffect(() => {
    setActive(props.activePreliquidacion ?? null);
  }, [props.activePreliquidacion]);

  const loadPreliquidacion = useCallback(async () => {
    setFetchError(null);
    const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: `Error ${r.status}` }));
      const msg =
        (err as { error?: string }).error ?? "No se pudo cargar la preliquidación. Intente nuevamente.";
      setFetchError(msg);
      throw new Error(msg);
    }
    const data = await r.json();
    if (data.autoGenerateError) {
      setFetchError(data.autoGenerateError);
    }
    if (data?.active) setActive(data.active);
    else if (data?.versions?.length) setActive(data.versions[0]);
    if (data?.versions) setVersions(data.versions);
    return data.active as Preliquidacion | null;
  }, [props.cancellationId]);

  useEffect(() => {
    loadPreliquidacion().catch((e) => {
      setFetchError(e instanceof Error ? e.message : "No se pudo cargar la preliquidación");
    });
  }, [loadPreliquidacion, props.activePreliquidacion]);

  async function generateInitial() {
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await r.json();
      if (!r.ok) {
        const friendly =
          data.error ??
          "No fue posible generar la preliquidación. Intente nuevamente.";
        setFetchError(friendly);
        props.onMessage(friendly);
        return;
      }
      const loaded = await loadPreliquidacion();
      if (!loaded && data?.id) {
        setActive(data);
      }
      props.onMessage(`Preliquidación V${data.version ?? loaded?.version ?? 1} generada correctamente.`);
      props.onRefresh();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "No fue posible generar la preliquidación. Intente nuevamente.";
      setFetchError(msg);
      props.onMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch(`/api/cancellations/${props.cancellationId}/preliquidacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error ?? "No fue posible regenerar la preliquidación.";
        setFetchError(msg);
        props.onMessage(msg);
        return;
      }
      await loadPreliquidacion();
      props.onMessage(`Preliquidación V${data.version} generada`);
      props.onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al regenerar la preliquidación.";
      setFetchError(msg);
      props.onMessage(msg);
    } finally {
      setLoading(false);
    }
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
  const planPrice =
    props.customer.planMonthlyUsd != null && props.customer.planMonthlyUsd !== ""
      ? formatUsd(Number(props.customer.planMonthlyUsd))
      : "—";

  return (
    <section
      id="preliquidacion"
      className="scroll-mt-4 rounded-xl border-2 shadow-md"
      style={{ borderColor: COLORS.brand }}
    >
      <div className="rounded-t-[10px] px-5 py-4 text-white" style={{ backgroundColor: COLORS.navy }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">PRELIQUIDACIÓN DE BAJA</h2>
            <p className="mt-1 text-sm text-teal-100">
              Etapa obligatoria antes de continuar con el pago y cierre de la baja.
            </p>
          </div>
          {active && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              V{active.version} · {displayStatus}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 bg-white p-5">
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Cliente" value={props.customer.name} />
          <Info label="Cédula" value={props.customer.cedula} />
          <Info label="Contrato" value={props.customer.contract} />
          <Info label="Plan" value={props.customer.planName} />
          <Info label="Precio mensual" value={planPrice} />
          <Info
            label="Fecha de inicio"
            value={new Date(props.customer.serviceStartDate).toLocaleDateString("es-VE")}
          />
          {props.customer.contractPermanenceEnd && (
            <Info
              label="Vencimiento permanencia"
              value={new Date(props.customer.contractPermanenceEnd).toLocaleDateString("es-VE")}
            />
          )}
        </div>

        {!active && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm text-amber-900 font-medium">
              No existe una preliquidación para esta solicitud.
            </p>
            {fetchError && (
              <p className="text-xs text-red-700 rounded border border-red-200 bg-red-50 px-3 py-2">
                {fetchError}
                {props.showTechnicalErrors && fetchError !== "No autorizado" && (
                  <span className="mt-1 block font-mono text-[10px] opacity-80">
                    cancellationId={props.cancellationId}
                  </span>
                )}
              </p>
            )}
            {props.canPreliquidate ? (
              <button
                type="button"
                disabled={loading}
                onClick={generateInitial}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                {loading ? "Generando…" : "Generar preliquidación"}
              </button>
            ) : (
              <p className="text-xs text-amber-800">
                No tiene permiso para generar preliquidaciones. Contacte a cobranzas.
              </p>
            )}
          </div>
        )}

        {active && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Detalle de valores
              </p>
              <div className="mt-3 divide-y rounded-lg border">
                {CATEGORY_ORDER.map((cat) => {
                  const amount = categoryTotals[cat] ?? 0;
                  const isCredit = cat === "CREDITO";
                  const label = PRELIQUIDACION_CATEGORY_LABELS[cat] ?? cat;
                  return (
                    <div key={cat} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="text-slate-700">{label}</span>
                      <span className={`font-semibold ${isCredit && amount > 0 ? "text-teal-700" : ""}`}>
                        {amount === 0
                          ? "No existen valores pendientes"
                          : isCredit
                            ? `-${formatUsd(amount)}`
                            : formatUsd(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {active.lineItems.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
                    Ver desglose línea por línea
                  </summary>
                  <ul className="mt-2 space-y-1 rounded-lg border bg-slate-50 p-3">
                    {active.lineItems.map((l, i) => (
                      <li key={l.id ?? i} className="flex justify-between gap-2">
                        <span>{l.concept}</span>
                        <span className="font-medium">{formatUsd(Number(l.amount))}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div
              className="flex items-center justify-between rounded-lg px-4 py-4 text-lg font-bold text-white"
              style={{ backgroundColor: COLORS.brand }}
            >
              <span>TOTAL PRELIQUIDACIÓN</span>
              <span>{formatUsd(Number(active.totalAmount))}</span>
            </div>

            <div className="rounded-lg border px-4 py-3 text-sm">
              <span className="text-slate-500">Estado: </span>
              <span className="font-semibold text-[#0B1F3A]">{displayStatus.toUpperCase()}</span>
              {active.docNumber && (
                <span className="ml-3 text-slate-500">· Doc. {active.docNumber}</span>
              )}
            </div>

            {active.status === "RECHAZADA" && active.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">Motivo de rechazo del cliente</p>
                <p className="mt-1">{active.rejectionReason}</p>
              </div>
            )}

            {approved && active.approvedAt && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
                ✓ PRELIQUIDACIÓN APROBADA —{" "}
                {new Date(active.approvedAt).toLocaleString("es-VE")}
              </div>
            )}

            {token && (
              <p className="text-xs text-slate-500">
                Enlace: {SIGNATURE_LINK_STATUS_LABELS[token.status] ?? token.status}
                {token.expiresAt && ` · Expira ${new Date(token.expiresAt).toLocaleString("es-VE")}`}
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <a
                href={`/api/cancellations/${props.cancellationId}/preliquidacion?format=pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                Ver / descargar PDF
              </a>

              {props.canPreliquidate &&
                (active.status === "RECHAZADA" || active.status === "GENERADA") &&
                !approved && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={regenerate}
                    className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900"
                  >
                    Editar preliquidación
                  </button>
                )}

              {props.canSendLink && !approved && active.status !== "SUPERSEDED" && (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={generateLink}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: COLORS.brand }}
                  >
                    Enviar al cliente
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
                          WhatsApp
                        </a>
                      )}
                      <button type="button" onClick={markSent} className="rounded-lg border px-3 py-2 text-xs">
                        Marcar enviado
                      </button>
                    </>
                  )}
                </>
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

            {linkUrl && <p className="break-all text-xs text-slate-500">{linkUrl}</p>}
          </>
        )}

        {versions.length > 1 && (
          <div className="border-t pt-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Historial de versiones</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {versions.map((v) => (
                <li key={v.id}>
                  V{v.version} · {PRELIQUIDACION_STATUS_LABELS[v.status] ?? v.status} ·{" "}
                  {formatUsd(Number(v.totalAmount))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-[#0B1F3A]">{value}</p>
    </div>
  );
}
