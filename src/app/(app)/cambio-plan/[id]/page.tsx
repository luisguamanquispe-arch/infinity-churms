"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { COLORS, OPERATION_TYPE_LABELS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { SignaturePad } from "@/components/cambio-plan/signature-pad";
import { RemoteSignaturePanel } from "@/components/cambio-plan/remote-signature-panel";
import { PlanChangeAdminPanel } from "@/components/cambio-plan/plan-change-admin-panel";
import { getPlanChangePermissions } from "@/lib/plan-change-permissions";

interface PlanChangeDetail {
  id: string;
  operationType: string;
  addendumNumber: string | null;
  status: string;
  requestDate: string;
  confirmedAt: string | null;
  signedAt: string | null;
  activatedAt: string | null;
  previousPlanName: string;
  previousSpeedMbps: number | null;
  previousMonthlyUsd: string;
  previousPermanenceStart: string | null;
  previousPermanenceEnd: string | null;
  newPlanName: string;
  newPlanId: string | null;
  newSpeedMbps: number;
  newMonthlyUsd: string;
  standardMonthlyUsd: string;
  discountReason: string | null;
  notes: string | null;
  newPermanenceStart: string | null;
  newPermanenceEnd: string | null;
  permanenceMonths: number;
  clientSignatureName: string | null;
  clientSignatureCedula: string | null;
  voidReason: string | null;
  signatureMode: string;
  identitySelfieAt: string | null;
  signatureImageData: string | null;
  signatureTokens: {
    id: string;
    status: string;
    expiresAt: string;
    generatedAt: string;
    sentAt: string | null;
    openedAt: string | null;
    processStartedAt: string | null;
    completedAt: string | null;
    generatedBy: { name: string };
  }[];
  customer: {
    id: string;
    contract: string;
    name: string;
    cedula: string;
    address: string;
    phone: string | null;
  };
  createdBy: { name: string };
  discountAuthorizedBy: { name: string } | null;
}

export default function PlanChangeDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [data, setData] = useState<PlanChangeDetail | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signatureCedula, setSignatureCedula] = useState("");
  const [signatureImage, setSignatureImage] = useState("");
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("");

  function reload() {
    fetch(`/api/plan-changes/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setSignatureName(d.clientSignatureName ?? d.customer.name);
        setSignatureCedula(d.clientSignatureCedula ?? d.customer.cedula);
      });
  }

  useEffect(() => {
    reload();
    fetch("/api/auth/me").then((r) => r.json()).then((u) => setRole(u.role ?? ""));
  }, [id]);

  async function action(type: string, body: Record<string, unknown> = {}) {
    setLoading(true);
    setError("");
    const r = await fetch(`/api/plan-changes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: type, ...body }),
    });
    const json = await r.json();
    setLoading(false);
    if (!r.ok) {
      setError(json.error ?? "Error");
      return;
    }
    setMsg("Operación completada.");
    reload();
  }

  if (!data) {
    return <p className="text-slate-500">Cargando…</p>;
  }

  const canSign = data.status === "PENDIENTE_DE_FIRMA";
  const isActive = ["ACTIVO", "FIRMADO"].includes(data.status);
  const permissions = role ? getPlanChangePermissions(role as UserRole) : null;
  const perms = role ? (() => {
    const isAdmin = role === "ADMIN";
    const isSupervisor = role === "SUPERVISOR";
    return {
      canSendLink: ["ADMIN", "SUPERVISOR", "COBRANZAS"].includes(role),
      canViewIdentity: isAdmin || isSupervisor,
    };
  })() : { canSendLink: false, canViewIdentity: false };

  const opLabel = OPERATION_TYPE_LABELS[data.operationType] ?? "Gestión contractual";
  const docLabel = data.operationType === "CAMBIO_PLAN" ? "Adendum" : "Documento";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/cambio-plan" className="text-sm text-slate-500 hover:underline">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: COLORS.navy }}>
          {opLabel}
        </h1>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
          {PLAN_CHANGE_STATUS_LABELS[data.status] ?? data.status}
        </span>
      </div>

      {msg && <div className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-800">{msg}</div>}
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {permissions && (
        <PlanChangeAdminPanel
          data={{
            id: data.id,
            operationType: data.operationType,
            status: data.status,
            addendumNumber: data.addendumNumber,
            newPlanId: data.newPlanId,
            newPlanName: data.newPlanName,
            newSpeedMbps: data.newSpeedMbps,
            newMonthlyUsd: data.newMonthlyUsd,
            standardMonthlyUsd: data.standardMonthlyUsd,
            discountReason: data.discountReason,
            notes: data.notes,
            customer: { contract: data.customer.contract, name: data.customer.name },
          }}
          permissions={{
            canEdit: permissions.canEdit,
            canDelete: permissions.canDelete,
            canVoid: permissions.canVoid,
            canConfirm: permissions.canConfirm,
            canApproveDiscount: permissions.canApproveDiscount,
          }}
          onMessage={setMsg}
          onUpdated={reload}
        />
      )}

      <section className="rounded-xl border bg-white p-5 space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <p className="text-slate-500">{docLabel}</p>
            <p className="font-semibold">{data.addendumNumber ?? "—"}</p>
          </div>
          <a
            href={`/api/plan-changes/${id}/adendum`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium"
            style={{ color: COLORS.brand }}
          >
            Descargar PDF
          </a>
        </div>
        <p><strong>Cliente:</strong> {data.customer.name} · {data.customer.contract}</p>
        <p><strong>Procesado por:</strong> {data.createdBy.name}</p>

        <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">PLAN ANTERIOR</p>
            <p>{data.previousPlanName}</p>
            <p>{data.previousSpeedMbps ? `${data.previousSpeedMbps} Mbps` : "—"}</p>
            <p>{formatUsd(Number(data.previousMonthlyUsd))}</p>
            {data.previousPermanenceStart && (
              <p className="text-xs text-slate-500 mt-1">
                Permanencia: {new Date(data.previousPermanenceStart).toLocaleDateString("es-VE")} →{" "}
                {data.previousPermanenceEnd ? new Date(data.previousPermanenceEnd).toLocaleDateString("es-VE") : "—"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">NUEVO PLAN</p>
            <p>{data.newPlanName}</p>
            <p>{data.newSpeedMbps} Mbps</p>
            <p>{formatUsd(Number(data.newMonthlyUsd))}</p>
            {Number(data.newMonthlyUsd) < Number(data.standardMonthlyUsd) && (
              <p className="text-xs text-amber-700 mt-1">
                Descuento · estándar {formatUsd(Number(data.standardMonthlyUsd))}
                {data.discountReason && ` · ${data.discountReason}`}
              </p>
            )}
          </div>
        </div>

        {data.newPermanenceStart && (
          <p>
            <strong>Nueva permanencia:</strong>{" "}
            {new Date(data.newPermanenceStart).toLocaleDateString("es-VE")} →{" "}
            {data.newPermanenceEnd ? new Date(data.newPermanenceEnd).toLocaleDateString("es-VE") : "—"}
            {" "}({data.permanenceMonths} meses)
          </p>
        )}

        {data.notes && (
          <p><strong>Observaciones:</strong> {data.notes}</p>
        )}

        {data.voidReason && (
          <p className="text-red-700"><strong>Anulado:</strong> {data.voidReason}</p>
        )}
      </section>

      {canSign && (
        <RemoteSignaturePanel
          planChangeId={id}
          status={data.status}
          customerPhone={data.customer.phone}
          customerName={data.customer.name}
          identitySelfieAt={data.identitySelfieAt}
          signatureImageData={!!data.signatureImageData}
          signedAt={data.signedAt}
          canSendLink={perms.canSendLink}
          canViewIdentity={perms.canViewIdentity}
        />
      )}

      {canSign && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Firma presencial</h2>
          <p className="text-sm text-slate-600">
            El nuevo plan no se activará hasta que el cliente firme el adendum.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nombre del firmante
              <input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Cédula
              <input
                value={signatureCedula}
                onChange={(e) => setSignatureCedula(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>
          <SignaturePad value={signatureImage} onChange={setSignatureImage} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>
              El cliente acepta voluntariamente la modificación de su plan y el nuevo período de permanencia
              de {data.permanenceMonths} meses.
            </span>
          </label>
          <button
            type="button"
            disabled={loading || !signatureImage || !consent}
            onClick={() =>
              action("sign", {
                signatureName,
                signatureCedula,
                signatureImageData: signatureImage,
                signatureConsent: consent,
              })
            }
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.navy }}
          >
            Confirmar firma y activar plan
          </button>
        </section>
      )}

      {isActive && data.signedAt && (
        <section className="rounded-lg bg-teal-50 p-4 text-sm">
          Firmado por {data.clientSignatureName} el{" "}
          {new Date(data.signedAt).toLocaleString("es-VE")}. Plan activo.
        </section>
      )}

      {data.status === "PENDIENTE_DE_FIRMA" && (
        <button
          type="button"
          disabled={loading}
          onClick={() => action("cancel")}
          className="text-sm text-red-600 hover:underline"
        >
          Cancelar solicitud
        </button>
      )}

      <Link
        href={`/clientes/${data.customer.id}`}
        className="inline-block text-sm"
        style={{ color: COLORS.brand }}
      >
        Ver ficha del cliente →
      </Link>
    </div>
  );
}
