"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  COLORS,
  CANCELLATION_REASONS,
  STREAMS_SUPPORT_SINCE_LABEL,
  STREAMS_SUPPORT_LABEL,
  WITHDRAWAL_REQUEST_PDF_LABEL,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { PermanenceSummaryPanel } from "@/components/bajas/permanence-summary-panel";
import { FiberMigrationForm } from "@/components/bajas/fiber-migration-form";
import {
  CustomerSearchPicker,
  type CustomerSearchResult,
} from "@/components/clientes/customer-search-input";
import type { PermanenceSummary } from "@/lib/permanence";
import {
  BAJA_CLIENT_PATH_OPTIONS,
  inferBajaClientPath,
  isClientPathCompatible,
  needsMigrationForm,
  pathLabel,
  validateClientPath,
  type BajaClientPath,
} from "@/lib/baja-client-path";

async function readPdfAsDataUrl(file: File): Promise<{ name: string; data: string }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Solo se permiten archivos PDF");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result) });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Customer {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  serviceStartDate: string;
  planName: string;
  status: string;
  originTechnology: string;
  currentTechnology: string;
  fiberInstallDate: string | null;
  fiberMigrationDate: string | null;
  migrationReviewRequired: boolean;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  pendingBalance: string;
  hasCancellation?: boolean;
  equipment: {
    id: string;
    type: string;
    serial: string | null;
    brand: string | null;
    model: string | null;
  }[];
}

export default function NuevaBajaPage() {
  return (
    <Suspense fallback={<NuevaBajaLoading />}>
      <NuevaBajaForm />
    </Suspense>
  );
}

function NuevaBajaLoading() {
  return (
    <div className="mx-auto max-w-2xl py-12 text-center text-sm text-slate-500">
      Cargando formulario de baja…
    </div>
  );
}

function NuevaBajaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [clientPath, setClientPath] = useState<BajaClientPath | null>(null);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [permanence, setPermanence] = useState<PermanenceSummary | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalPdf, setWithdrawalPdf] = useState<{ name: string; data: string } | null>(null);
  const [pdfMsg, setPdfMsg] = useState("");

  useEffect(() => {
    if (!prefillCustomerId) return;
    fetch(`/api/customers/${prefillCustomerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c) {
          setSelected(c);
          setClientPath(inferBajaClientPath(c));
        }
      });
  }, [prefillCustomerId]);

  async function pickCustomer(c: CustomerSearchResult) {
    const r = await fetch(`/api/customers/${c.id}`);
    if (!r.ok) return;
    const full: Customer = await r.json();
    selectCustomer(full);
  }

  useEffect(() => {
    if (!selected) {
      setPermanence(null);
      return;
    }
    if (!clientPath) {
      setPermanence(null);
      return;
    }
    if (needsMigrationForm(clientPath, selected)) {
      setPermanence(null);
      return;
    }
    fetch(
      `/api/customers/${selected.id}/permanence-preview?requestDate=${encodeURIComponent(requestDate)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(setPermanence);
  }, [selected, requestDate, clientPath]);

  function selectCustomer(c: Customer) {
    setSelected(c);
    setClientPath(inferBajaClientPath(c));
    setWithdrawalPdf(null);
    setPdfMsg("");
    setError("");
  }

  function onMigrationSuccess(fields: {
    originTechnology: string;
    currentTechnology: string;
    fiberMigrationDate: string | null;
    fiberInstallDate: string | null;
    migrationReviewRequired: boolean;
  }) {
    if (!selected) return;
    setSelected({ ...selected, ...fields });
    setClientPath("MIGRATED");
  }

  async function submit() {
    if (!selected || !reason || !clientPath) {
      setError("Seleccione cliente, tipo de permanencia y motivo de baja");
      return;
    }
    if (needsMigrationForm(clientPath, selected)) {
      setError("Registre primero la migración a fibra antes de crear la baja");
      return;
    }
    const pathValidation = validateClientPath(clientPath, selected);
    if (!pathValidation.ok) {
      setError(pathValidation.message ?? "Tipo de cliente incompatible con los datos registrados");
      return;
    }
    if (selected.hasCancellation) {
      setError("Este cliente ya tiene una baja registrada");
      return;
    }
    if (permanence && !permanence.canCalculate) {
      setError(
        permanence.warning ??
          "Complete la información de migración/instalación de fibra antes de registrar la baja."
      );
      return;
    }
    if (!withdrawalPdf) {
      setError(`Debe adjuntar el PDF de ${WITHDRAWAL_REQUEST_PDF_LABEL}`);
      return;
    }
    const eligRes = await fetch(`/api/customers/${selected.id}/collections`);
    if (eligRes.ok) {
      const { eligibility } = await eligRes.json();
      if (!eligibility.allowed) {
        setError(eligibility.blockers.join(". "));
        return;
      }
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/cancellations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: selected.id,
        reason,
        requestDate,
        clientPath,
        withdrawalRequestFileName: withdrawalPdf.name,
        withdrawalRequestFileData: withdrawalPdf.data,
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/bajas/${data.id}#preliquidacion`);
    else setError(data.error ?? "Error al crear");
    setLoading(false);
  }

  const showMigrationStep =
    selected && clientPath && needsMigrationForm(clientPath, selected);

  const showBajaForm =
    selected && clientPath && !showMigrationStep;

  const tvMonths =
    selected?.hasTvStreaming && selected.tvStreamingSince
      ? Math.max(
          1,
          Math.floor(
            (Date.now() - new Date(selected.tvStreamingSince).getTime()) /
              (1000 * 60 * 60 * 24 * 30)
          )
        )
      : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-[#0B1F3A]">Nueva Solicitud de Baja</h1>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <label className="text-sm font-medium">Buscar cliente</label>
        <CustomerSearchPicker
          className="mt-2"
          selectedId={selected?.id}
          onSelect={pickCustomer}
        />
      </section>

      {selected && (
        <>
          {selected.hasCancellation && (
            <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Este cliente ya tiene una baja registrada. No se puede crear otra.
            </p>
          )}

          <section className="rounded-xl border-2 border-[#0B1F3A]/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#0B1F3A]">Tipo de cliente — permanencia</h2>
            <p className="mt-1 text-sm text-slate-600">
              Indique si el cliente migró de radioenlace a fibra o es fibra original. Esto define
              qué formulario completar y desde qué fecha se calculan los 18 meses mínimos.
            </p>
            <div className="mt-4 space-y-2">
              {BAJA_CLIENT_PATH_OPTIONS.map((opt) => {
                const compatible = isClientPathCompatible(opt.value, selected);
                return (
                <label
                  key={opt.value}
                  className={`flex gap-3 rounded-lg border p-3 transition ${
                    !compatible
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                      : clientPath === opt.value
                      ? "cursor-pointer border-teal-400 bg-teal-50/60 ring-1 ring-teal-300"
                      : "cursor-pointer border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="clientPath"
                    value={opt.value}
                    checked={clientPath === opt.value}
                    disabled={!compatible}
                    onChange={() => {
                      setClientPath(opt.value);
                      setError("");
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#0B1F3A]">{opt.label}</span>
                    <span className="block text-xs text-slate-600">{opt.description}</span>
                    {!compatible && (
                      <span className="mt-1 block text-xs text-amber-700">
                        No aplica según tecnología registrada ({selected.originTechnology} →{" "}
                        {selected.currentTechnology}).
                      </span>
                    )}
                  </span>
                </label>
              );
              })}
            </div>
          </section>

          {showMigrationStep && (
            <FiberMigrationForm
              customerId={selected.id}
              initialMigrationDate={selected.fiberMigrationDate}
              onSuccess={onMigrationSuccess}
            />
          )}

          {showBajaForm && (
            <>
              <PathInfoBanner customer={selected} path={clientPath} />

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold">Motivo de la baja *</h2>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Seleccione motivo...</option>
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold">Fecha de solicitud de baja</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Calcula automáticamente meses de permanencia (18 meses) y valor de instalación.
                </p>
                <input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
                />
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold">Información del cliente</h2>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Contrato" value={selected.contract} />
                  <Row label="Nombre" value={selected.name} />
                  <Row label="Plan" value={selected.planName} />
                  <Row
                    label="Alta original"
                    value={new Date(selected.serviceStartDate).toLocaleDateString("es-VE")}
                  />
                  <Row label="Tecnología origen" value={selected.originTechnology} />
                  <Row label="Tecnología actual" value={selected.currentTechnology} />
                  {selected.fiberInstallDate && (
                    <Row
                      label="Instalación fibra"
                      value={new Date(selected.fiberInstallDate).toLocaleDateString("es-VE")}
                    />
                  )}
                  {selected.fiberMigrationDate && (
                    <Row
                      label="Migración a fibra"
                      value={new Date(selected.fiberMigrationDate).toLocaleDateString("es-VE")}
                    />
                  )}
                  <Row label="Mensualidades pend." value={formatUsd(Number(selected.pendingBalance))} />
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  Ficha completa:{" "}
                  <Link href={`/clientes/${selected.id}`} className="font-semibold text-teal-700 underline">
                    Gestionar cliente
                  </Link>
                </p>
              </section>

              {clientPath === "MIGRATED" && selected.fiberMigrationDate && (
                <section className="rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3 text-sm text-teal-900">
                  <strong>Permanencia fibra</strong> calculada desde migración:{" "}
                  {new Date(selected.fiberMigrationDate).toLocaleDateString("es-VE")}
                </section>
              )}

              {clientPath === "FIBRA_ORIGINAL" && (
                <section className="rounded-lg border border-teal-200 bg-teal-50/50 px-4 py-3 text-sm text-teal-900">
                  <strong>Permanencia fibra</strong> calculada desde instalación:{" "}
                  {selected.fiberInstallDate
                    ? new Date(selected.fiberInstallDate).toLocaleDateString("es-VE")
                    : new Date(selected.serviceStartDate).toLocaleDateString("es-VE")}
                </section>
              )}

              {permanence && <PermanenceSummaryPanel summary={permanence} />}

              {selected.hasTvStreaming && selected.tvStreamingSince && (
                <section className="rounded-xl border bg-slate-50 p-4 text-sm">
                  <p>
                    {STREAMS_SUPPORT_LABEL} ({tvMonths} meses estimados):{" "}
                    {formatUsd(tvMonths * 2)}
                  </p>
                </section>
              )}

              <section className="rounded-xl border bg-white p-5">
                <h2 className="font-semibold text-sm">Equipos asociados</h2>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1">Equipo</th>
                      <th>Marca</th>
                      <th>Modelo</th>
                      <th>Serie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.equipment.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="py-2">{e.type}</td>
                        <td>{e.brand ?? "—"}</td>
                        <td>{e.model ?? "—"}</td>
                        <td>{e.serial ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="rounded-xl border-2 border-[#0B1F3A]/15 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-[#0B1F3A]">{WITHDRAWAL_REQUEST_PDF_LABEL} *</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Adjunte el documento firmado por el cliente. Se archiva en el sistema y queda
                  disponible en la gestión de la baja.
                </p>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  className="mt-3 block w-full text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setPdfMsg("");
                    setError("");
                    if (!file) {
                      setWithdrawalPdf(null);
                      return;
                    }
                    try {
                      const uploaded = await readPdfAsDataUrl(file);
                      setWithdrawalPdf(uploaded);
                      setPdfMsg(`Archivo listo: ${uploaded.name}`);
                    } catch {
                      setWithdrawalPdf(null);
                      setPdfMsg("Solo se permiten archivos PDF");
                    }
                  }}
                />
                {pdfMsg && (
                  <p
                    className={`mt-2 text-xs ${
                      pdfMsg.includes("Solo") ? "text-red-600" : "text-teal-800"
                    }`}
                  >
                    {pdfMsg}
                  </p>
                )}
              </section>

              <button
                onClick={submit}
                disabled={
                  loading ||
                  selected.hasCancellation ||
                  !reason ||
                  !withdrawalPdf ||
                  (permanence !== null && !permanence.canCalculate)
                }
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                {loading ? "Creando..." : "Iniciar baja y generar preliquidación"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function PathInfoBanner({ customer, path }: { customer: Customer; path: BajaClientPath }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-[#0B1F3A]">Formulario de baja — {pathLabel(path)}</p>
      <p className="mt-1 text-slate-600">
        {path === "MIGRATED" &&
          "Cliente con migración radio → fibra. Los 18 meses de permanencia cuentan desde la fecha de migración."}
        {path === "FIBRA_ORIGINAL" &&
          "Cliente que contrató fibra desde el inicio. Permanencia desde fecha de instalación de fibra."}
        {path === "RADIO_ONLY" &&
          "Cliente sin fibra. Permanencia calculada desde la fecha de alta del servicio de radioenlace."}
      </p>
      {customer.migrationReviewRequired && path === "MIGRATED" && (
        <p className="mt-2 text-amber-800">
          Este cliente requiere revisión: confirme la fecha de migración en la ficha o seleccione
          migración arriba.
        </p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
