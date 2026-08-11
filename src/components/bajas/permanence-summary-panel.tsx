"use client";

import { formatUsd } from "@/lib/liquidation";
import type { PermanenceSummary } from "@/lib/permanence";
import { isMigratedRadioToFiber } from "@/lib/permanence";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-VE");
}

export function PermanenceSummaryPanel({
  summary,
  compact = false,
}: {
  summary: PermanenceSummary;
  compact?: boolean;
}) {
  if (!summary.canCalculate && summary.warning) {
    return (
      <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Revisión requerida — permanencia de fibra</p>
        <p className="mt-2">{summary.warning}</p>
        <p className="mt-2 text-xs">
          Complete la fecha de migración/instalación de fibra en la ficha del cliente antes de
          registrar la baja.
        </p>
      </section>
    );
  }

  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: "TIPO DE CLIENTE", value: summary.customerTypeLabel },
    { label: "TECNOLOGÍA ACTUAL", value: summary.currentTechnologyLabel },
    { label: "FECHA INSTALACIÓN ORIGINAL", value: fmtDate(summary.originalInstallDate) },
    {
      label: "FECHA MIGRACIÓN A FIBRA",
      value: fmtDate(summary.fiberMigrationDate),
    },
    {
      label: "FECHA INSTALACIÓN FIBRA",
      value: fmtDate(summary.fiberInstallDate),
    },
    {
      label: "FECHA INICIO PERMANENCIA FIBRA",
      value: fmtDate(summary.permanenceStartDate),
      highlight: true,
    },
    { label: "FECHA SOLICITUD DE BAJA", value: fmtDate(summary.requestDate) },
    {
      label:
        summary.currentTechnology === "FIBRA" || isMigratedRadioToFiber(summary)
          ? "TIEMPO EN FIBRA"
          : "TIEMPO EN SERVICIO",
      value: `${summary.monthsInFiber} mes(es)`,
      highlight: true,
    },
    {
      label: "MESES FALTANTES (PLAZO MÍNIMO)",
      value:
        summary.monthsRemaining > 0
          ? `${summary.monthsRemaining} mes(es) por cumplir`
          : "0 — permanencia cumplida",
      highlight: summary.monthsRemaining > 0,
    },
    {
      label: "ANTIGÜEDAD DEL CLIENTE",
      value: `${summary.customerSeniorityMonths} mes(es) (informativo)`,
    },
    { label: "PLAZO MÍNIMO", value: `${summary.minContractMonths} meses` },
    {
      label: "PRORRATEO MENSUAL INST.",
      value: formatUsd(summary.monthlyPermanenceRate),
    },
    { label: "ESTADO", value: summary.permanenceStatusLabel, highlight: true },
    { label: "INSTALACIÓN FIBRA", value: summary.fiberInstallStatusLabel, highlight: true },
    { label: "VALOR A COBRAR", value: formatUsd(summary.installAmount), highlight: true },
  ];

  if (compact) {
    return (
      <section className="rounded-xl border bg-slate-50 p-4 text-sm">
        <h3 className="font-semibold text-[#0B1F3A]">Resumen permanencia fibra</h3>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.slice(0, 8).map((row) => (
            <div key={row.label}>
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className={row.highlight ? "font-semibold text-[#0B1F3A]" : "font-medium"}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-xl border-2 border-teal-200 bg-teal-50/30 p-5">
      <h2 className="font-semibold text-[#0B1F3A]">Resumen permanencia — instalación fibra</h2>
      <dl className="mt-4 space-y-2 text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex flex-wrap justify-between gap-2 border-b border-teal-100 pb-2 ${
              row.highlight ? "font-semibold text-[#0B1F3A]" : ""
            }`}
          >
            <dt className="text-slate-600">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
