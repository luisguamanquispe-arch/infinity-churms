"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  COLORS,
  COLLECTION_MANAGEMENT_TYPES,
  COLLECTION_RESULTS,
  CUSTOMER_ZONES,
} from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import type {
  CarteraReportRow,
  CollectionReportResult,
  GestionReportRow,
  PagoReportRow,
} from "@/lib/services/collection-reports";

const VIEW_OPTIONS = [
  { value: "cartera", label: "Cartera morosa" },
  { value: "gestiones", label: "Gestiones" },
  { value: "pagos", label: "Pagos Fenix" },
] as const;

function defaultFromDate() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export function CollectionReportSection() {
  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]["value"]>("cartera");
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [zone, setZone] = useState("");
  const [managementType, setManagementType] = useState("");
  const [result, setResult] = useState("");
  const [prelegalOnly, setPrelegalOnly] = useState(false);
  const [report, setReport] = useState<CollectionReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      type: "cobranzas",
      view,
      from,
      to,
    });
    if (zone) params.set("zone", zone);
    if (managementType) params.set("managementType", managementType);
    if (result) params.set("result", result);
    if (prelegalOnly) params.set("prelegalOnly", "1");
    return params.toString();
  }, [view, from, to, zone, managementType, result, prelegalOnly]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports?${queryString}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar el reporte");
        setReport(null);
        return;
      }
      setReport(json);
    } catch {
      setError("Error de conexión al cargar el reporte");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportPdfUrl = `/api/reports?${queryString}&format=pdf`;
  const exportCsvUrl = `/api/reports?${queryString}&format=csv`;

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#0B1F3A]">Reporte personalizado — Gestión de Cobranzas</h2>
          <p className="mt-1 text-xs text-slate-500">
            Filtre por período, zona, tipo de gestión y resultado. Exporte a PDF o CSV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: COLORS.brand }}
          >
            Exportar PDF
          </a>
          <a
            href={exportCsvUrl}
            className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Vista">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            {VIEW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Desde">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </FilterField>
        <FilterField label="Zona">
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {CUSTOMER_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </FilterField>
        {view === "gestiones" && (
          <>
            <FilterField label="Tipo de gestión">
              <select
                value={managementType}
                onChange={(e) => setManagementType(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {COLLECTION_MANAGEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Resultado">
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {COLLECTION_RESULTS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </FilterField>
          </>
        )}
        {(view === "cartera" || view === "gestiones") && (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={prelegalOnly}
              onChange={(e) => setPrelegalOnly(e.target.checked)}
            />
            Solo mora prelegal (+90 días)
          </label>
        )}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Actualizando…" : "Actualizar reporte"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {report && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Clientes morosos" value={String(report.kpis.clientesMorosos)} />
            <Kpi label="Cartera pendiente" value={formatUsd(report.kpis.carteraPendiente)} />
            <Kpi label="Gestiones (filtro)" value={String(report.kpis.gestionesPeriodo)} />
            <Kpi label="Pagos (filtro)" value={String(report.kpis.pagosPeriodo)} />
            <Kpi label="Monto pagos" value={formatUsd(report.kpis.montoPagosPeriodo)} />
            <Kpi label="Promesas vigentes" value={String(report.kpis.promesasVigentes)} />
            <Kpi label="Prelegal (+90 d)" value={String(report.kpis.prelegalCount)} />
          </div>

          {(report.kpis.byManagementType.length > 0 || report.kpis.byResult.length > 0) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {report.kpis.byManagementType.length > 0 && (
                <Breakdown title="Gestiones por tipo" items={report.kpis.byManagementType.map((i) => ({ label: i.label, count: i.count }))} />
              )}
              {report.kpis.byResult.length > 0 && (
                <Breakdown title="Gestiones por resultado" items={report.kpis.byResult.map((i) => ({ label: i.label, count: i.count }))} />
              )}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            {report.filters.view === "cartera" && (
              <CarteraTable rows={report.rows as CarteraReportRow[]} />
            )}
            {report.filters.view === "gestiones" && (
              <GestionesTable rows={report.rows as GestionReportRow[]} />
            )}
            {report.filters.view === "pagos" && (
              <PagosTable rows={report.rows as PagoReportRow[]} />
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {report.rows.length} registro(s) · Período {from} — {to}
            {zone ? ` · Zona ${zone}` : ""}
          </p>
        </>
      )}
    </section>
  );
}

function CarteraTable({ rows }: { rows: CarteraReportRow[] }) {
  if (rows.length === 0) {
    return <EmptyRows message="No hay clientes en cartera con los filtros seleccionados." />;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Contrato</th>
          <th>Cliente</th>
          <th>Zona</th>
          <th>Plan</th>
          <th>Saldo</th>
          <th>Mora</th>
          <th>Prelegal</th>
          <th>Detalle cargos</th>
          <th>Última gestión</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.customerId} className="border-t align-top">
            <td className="py-2 font-medium">{row.contract}</td>
            <td>{row.name}</td>
            <td>{row.zone}</td>
            <td>{row.planName}</td>
            <td>{formatUsd(row.pendingBalance)}</td>
            <td>{row.overdueDays} d</td>
            <td>
              {row.isPrelegal ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  Prelegal
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="max-w-xs text-xs text-slate-600">{row.chargesSummary}</td>
            <td className="whitespace-nowrap text-xs">
              {row.lastActionDate
                ? `${new Date(row.lastActionDate).toLocaleDateString("es-VE")} · ${row.lastActionResult ?? ""}`
                : "—"}
            </td>
            <td>
              <Link href={`/clientes/${row.customerId}`} className="text-xs text-teal-700 hover:underline">
                Ver →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GestionesTable({ rows }: { rows: GestionReportRow[] }) {
  if (rows.length === 0) {
    return <EmptyRows message="No hay gestiones en el período seleccionado." />;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Fecha</th>
          <th>Contrato</th>
          <th>Cliente</th>
          <th>Zona</th>
          <th>Saldo</th>
          <th>Mora</th>
          <th>Tipo</th>
          <th>Resultado</th>
          <th>Agente</th>
          <th>Registró</th>
          <th>Promesa</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t align-top">
            <td className="py-2 whitespace-nowrap">{new Date(row.actionDate).toLocaleString("es-VE")}</td>
            <td className="font-medium">{row.contract}</td>
            <td>{row.customerName}</td>
            <td>{row.zone}</td>
            <td>{formatUsd(row.pendingBalance)}</td>
            <td>{row.overdueDays} d</td>
            <td>{row.managementTypeLabel}</td>
            <td>{row.resultLabel}</td>
            <td className="font-medium">{row.userName}</td>
            <td className="text-slate-600">
              {row.registeredBy !== row.userName ? row.registeredBy : "—"}
            </td>
            <td className="whitespace-nowrap text-xs">
              {row.promiseDate
                ? `${new Date(row.promiseDate).toLocaleDateString("es-VE")}${row.promiseAmount != null ? ` · ${formatUsd(row.promiseAmount)}` : ""}`
                : "—"}
            </td>
            <td className="max-w-xs text-xs text-slate-600">{row.notes ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PagosTable({ rows }: { rows: PagoReportRow[] }) {
  if (rows.length === 0) {
    return <EmptyRows message="No hay pagos Fenix en el período seleccionado." />;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Fecha</th>
          <th>Contrato</th>
          <th>Cliente</th>
          <th>Zona</th>
          <th>Valor</th>
          <th>Recibo Fenix</th>
          <th>Método</th>
          <th>Registró</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t">
            <td className="py-2 whitespace-nowrap">{new Date(row.paymentDate).toLocaleDateString("es-VE")}</td>
            <td className="font-medium">{row.contract}</td>
            <td>{row.customerName}</td>
            <td>{row.zone}</td>
            <td>{formatUsd(row.amount)}</td>
            <td>{row.fenixDocument}</td>
            <td>{row.paymentMethod ?? "—"}</td>
            <td>{row.userName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-lg font-bold text-[#0B1F3A]">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.label} className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 shadow-sm">
            {item.label}: <strong>{item.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyRows({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{message}</p>;
}
