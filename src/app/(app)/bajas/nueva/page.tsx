"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  COLORS,
  CANCELLATION_REASONS,
  STREAMS_SUPPORT_SINCE_LABEL,
  STREAMS_SUPPORT_LABEL,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { PermanenceSummaryPanel } from "@/components/bajas/permanence-summary-panel";
import { FiberMigrationForm } from "@/components/bajas/fiber-migration-form";
import type { PermanenceSummary } from "@/lib/permanence";
import {
  BAJA_CLIENT_PATH_OPTIONS,
  inferBajaClientPath,
  needsMigrationForm,
  pathLabel,
  type BajaClientPath,
} from "@/lib/baja-client-path";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [clientPath, setClientPath] = useState<BajaClientPath | null>(null);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [permanence, setPermanence] = useState<PermanenceSummary | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (q.length < 2) return;
    fetch(`/api/customers?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setCustomers);
  }, [q]);

  useEffect(() => {
    if (!prefillCustomerId) return;
    fetch(`/api/customers/${prefillCustomerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c) {
          setSelected(c);
          setClientPath(inferBajaClientPath(c));
          setQ(c.contract);
        }
      });
  }, [prefillCustomerId]);

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
      body: JSON.stringify({ customerId: selected.id, reason, requestDate }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/bajas/${data.id}`);
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Contrato, nombre o cédula..."
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
        {customers.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-auto rounded border">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    c.hasCancellation ? "opacity-60" : ""
                  }`}
                >
                  {c.contract} — {c.name}
                  {c.hasCancellation && (
                    <span className="ml-2 text-xs text-red-600">(ya tiene baja)</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
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
              {BAJA_CLIENT_PATH_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                    clientPath === opt.value
                      ? "border-teal-400 bg-teal-50/60 ring-1 ring-teal-300"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="clientPath"
                    value={opt.value}
                    checked={clientPath === opt.value}
                    onChange={() => {
                      setClientPath(opt.value);
                      setError("");
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#0B1F3A]">{opt.label}</span>
                    <span className="block text-xs text-slate-600">{opt.description}</span>
                  </span>
                </label>
              ))}
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

              <button
                onClick={submit}
                disabled={
                  loading ||
                  selected.hasCancellation ||
                  !reason ||
                  (permanence !== null && !permanence.canCalculate)
                }
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                {loading ? "Creando..." : "Registrar solicitud y calcular liquidación"}
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
