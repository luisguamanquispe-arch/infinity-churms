"use client";

import { useEffect, useMemo, useState } from "react";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { comparePlanOffer } from "@/lib/plan-offer-comparison";

export interface PlanOfferValues {
  planName: string;
  planSpeedMbps: string;
  planMonthlyUsd: string;
  offeredPlanName: string;
  offeredPlanSpeedMbps: string;
  offeredPlanMonthlyUsd: string;
}

interface ServicePlanOption {
  id: string;
  name: string;
  speedMbps: number;
  monthlyUsd: string | number;
}

interface PlanOfferFieldsProps {
  values: PlanOfferValues;
  onChange: (patch: Partial<PlanOfferValues>) => void;
  currentLabel?: string;
  offeredLabel?: string;
}

export function PlanOfferFields({
  values,
  onChange,
  currentLabel = "Plan actual del cliente",
  offeredLabel = "Nuevo plan ofrecido",
}: PlanOfferFieldsProps) {
  const [catalog, setCatalog] = useState<ServicePlanOption[]>([]);

  useEffect(() => {
    fetch("/api/service-plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
  }, []);

  const comparison = useMemo(
    () =>
      comparePlanOffer(
        {
          name: values.planName,
          speedMbps: values.planSpeedMbps ? Number(values.planSpeedMbps) : null,
          monthlyUsd: values.planMonthlyUsd ? Number(values.planMonthlyUsd) : null,
        },
        {
          name: values.offeredPlanName,
          speedMbps: values.offeredPlanSpeedMbps ? Number(values.offeredPlanSpeedMbps) : null,
          monthlyUsd: values.offeredPlanMonthlyUsd ? Number(values.offeredPlanMonthlyUsd) : null,
        }
      ),
    [values]
  );

  function applyCatalogPlan(planId: string, target: "current" | "offered") {
    const plan = catalog.find((p) => p.id === planId);
    if (!plan) return;
    if (target === "current") {
      onChange({
        planName: plan.name,
        planSpeedMbps: String(plan.speedMbps),
        planMonthlyUsd: String(plan.monthlyUsd),
      });
    } else {
      onChange({
        offeredPlanName: plan.name,
        offeredPlanSpeedMbps: String(plan.speedMbps),
        offeredPlanMonthlyUsd: String(plan.monthlyUsd),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanCard
          title={currentLabel}
          catalog={catalog}
          onPickFromCatalog={(id) => applyCatalogPlan(id, "current")}
          fields={[
            {
              label: "Nombre del plan *",
              value: values.planName,
              onChange: (v) => onChange({ planName: v }),
              uppercase: true,
            },
            {
              label: "Capacidad (Mbps)",
              value: values.planSpeedMbps,
              onChange: (v) => onChange({ planSpeedMbps: v }),
              type: "number",
            },
            {
              label: "Costo mensual (USD)",
              value: values.planMonthlyUsd,
              onChange: (v) => onChange({ planMonthlyUsd: v }),
              type: "number",
            },
          ]}
        />

        <PlanCard
          title={offeredLabel}
          catalog={catalog}
          onPickFromCatalog={(id) => applyCatalogPlan(id, "offered")}
          highlight
          fields={[
            {
              label: "Nombre del plan ofrecido",
              value: values.offeredPlanName,
              onChange: (v) => onChange({ offeredPlanName: v }),
              uppercase: true,
            },
            {
              label: "Capacidad ofrecida (Mbps)",
              value: values.offeredPlanSpeedMbps,
              onChange: (v) => onChange({ offeredPlanSpeedMbps: v }),
              type: "number",
            },
            {
              label: "Nuevo costo mensual (USD)",
              value: values.offeredPlanMonthlyUsd,
              onChange: (v) => onChange({ offeredPlanMonthlyUsd: v }),
              type: "number",
            },
          ]}
        />
      </div>

      {comparison && (
        <div
          className={`rounded-xl border p-4 ${
            comparison.isAttractive
              ? "border-teal-200 bg-teal-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className="text-sm font-semibold text-[#0B1F3A]">Comparación de la oferta</p>
          <p className="mt-1 text-sm text-slate-700">{comparison.summary}</p>
          {comparison.detail && (
            <p className="mt-2 text-xs text-slate-600">{comparison.detail}</p>
          )}
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <CompareStat
              label="Diferencia en Mbps"
              value={
                comparison.speedDeltaMbps === null
                  ? "—"
                  : `${comparison.speedDeltaMbps > 0 ? "+" : ""}${comparison.speedDeltaMbps} Mbps`
              }
            />
            <CompareStat
              label="Diferencia en costo"
              value={
                comparison.priceDeltaUsd === null
                  ? "—"
                  : `${comparison.priceDeltaUsd > 0 ? "+" : ""}${formatUsd(comparison.priceDeltaUsd)}/mes`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  title,
  catalog,
  onPickFromCatalog,
  fields,
  highlight = false,
}: {
  title: string;
  catalog: ServicePlanOption[];
  onPickFromCatalog: (id: string) => void;
  fields: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    uppercase?: boolean;
  }[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-teal-200 bg-teal-50/40" : "bg-slate-50"
      }`}
    >
      <h4 className="text-sm font-semibold text-[#0B1F3A]">{title}</h4>
      {catalog.length > 0 && (
        <div className="mt-3">
          <label className="text-xs text-slate-600">Cargar desde catálogo</label>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onPickFromCatalog(e.target.value);
              e.target.value = "";
            }}
            className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Seleccionar plan…</option>
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.speedMbps} Mbps · {formatUsd(Number(p.monthlyUsd))}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-3 space-y-3">
        {fields.map((field) => (
          <div key={field.label}>
            <label className="text-xs text-slate-600">{field.label}</label>
            <input
              type={field.type ?? "text"}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              className={`mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm${
                field.uppercase ? " uppercase" : ""
              }`}
              min={field.type === "number" ? 0 : undefined}
              step={field.type === "number" ? "0.01" : undefined}
            />
          </div>
        ))}
      </div>
      {highlight && (
        <p className="mt-3 text-xs" style={{ color: COLORS.brand }}>
          Propuesta comercial para el cliente (precio o megas más atractivos).
        </p>
      )}
    </div>
  );
}

function CompareStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-[#0B1F3A]">{value}</p>
    </div>
  );
}
