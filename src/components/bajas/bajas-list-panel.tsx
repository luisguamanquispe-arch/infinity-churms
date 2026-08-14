"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABELS, REASON_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import {
  getPreliquidacionListStatus,
  PRELIQUIDACION_LIST_LABELS,
} from "@/lib/preliquidacion-display";
import { CustomerSearchInput } from "@/components/clientes/customer-search-input";

const PRELIQ_BADGE: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-900",
  ENVIADA: "bg-blue-100 text-blue-900",
  APROBADA: "bg-teal-100 text-teal-900",
  RECHAZADA: "bg-red-100 text-red-900",
};

interface CancellationRow {
  id: string;
  requestDate: string;
  reason: string;
  status: string;
  totalAmount: string;
  customer: { contract: string; name: string };
  activePreliquidacion?: { status: string } | null;
}

interface BajasListPanelProps {
  canCreate: boolean;
  dbOk: boolean;
  initialRows: CancellationRow[];
  loadError: boolean;
}

export function BajasListPanel({ canCreate, dbOk, initialRows, loadError }: BajasListPanelProps) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const fetchRows = useCallback(async (q: string) => {
    if (!dbOk) return;
    setSearching(true);
    setSearchError("");
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/cancellations${params}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Error al buscar");
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setSearchError("No se pudo conectar con el servidor");
    } finally {
      setSearching(false);
    }
  }, [dbOk]);

  useEffect(() => {
    if (!query.trim()) {
      setRows(initialRows);
      return;
    }
    if (query.trim().length < 2) return;

    const timer = window.setTimeout(() => {
      fetchRows(query);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, initialRows, fetchRows]);

  return (
    <div className="space-y-4">
      <CustomerSearchInput
        value={query}
        onChange={setQuery}
        autoSearch={false}
        placeholder="Buscar baja por contrato, nombre o cédula del cliente…"
        className="max-w-xl"
      />
      {searching && <p className="text-xs text-slate-500">Filtrando solicitudes…</p>}
      {searchError && <p className="text-sm text-red-600">{searchError}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Preliquidación</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {query.trim().length >= 2 ? (
                    <>No hay bajas que coincidan con «{query.trim()}».</>
                  ) : dbOk && !loadError ? (
                    <span>
                      No hay solicitudes de baja registradas.
                      <br />
                      <span className="mt-2 inline-block text-sm">
                        Primero cree un cliente en{" "}
                        <Link href="/clientes" className="font-semibold text-teal-600 hover:underline">
                          Clientes
                        </Link>
                        {canCreate && (
                          <>
                            {" "}
                            y luego pulse{" "}
                            <Link href="/bajas/nueva" className="font-semibold text-teal-600 hover:underline">
                              Iniciar baja
                            </Link>
                          </>
                        )}
                        .
                      </span>
                    </span>
                  ) : (
                    "No se pudieron cargar las solicitudes."
                  )}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const preliqKey = getPreliquidacionListStatus(
                  r.status,
                  r.activePreliquidacion?.status
                );
                return (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.customer.name}</p>
                      <p className="text-xs text-slate-500">{r.customer.contract}</p>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(r.requestDate).toLocaleDateString("es-VE")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRELIQ_BADGE[preliqKey]}`}
                      >
                        {PRELIQUIDACION_LIST_LABELS[preliqKey]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatUsd(Number(r.totalAmount))}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/bajas/${r.id}#preliquidacion`}
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        Ver preliquidación →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
