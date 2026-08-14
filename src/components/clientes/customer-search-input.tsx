"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { COLORS } from "@/lib/constants";

export interface CustomerSearchResult {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  zone?: string;
  planName?: string;
  pendingBalance?: string | number;
  hasCancellation?: boolean;
}

interface CustomerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onResults?: (results: CustomerSearchResult[]) => void;
  morosoOnly?: boolean;
  onMorosoOnlyChange?: (value: boolean) => void;
  showMorosoFilter?: boolean;
  placeholder?: string;
  minChars?: number;
  autoSearch?: boolean;
  className?: string;
}

export function CustomerSearchInput({
  value,
  onChange,
  onResults,
  morosoOnly = false,
  onMorosoOnlyChange,
  showMorosoFilter = false,
  placeholder = "Buscar por contrato, nombre, cédula, teléfono, zona o serie…",
  minChars = 2,
  autoSearch = true,
  className = "",
}: CustomerSearchInputProps) {
  const inputId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!autoSearch || !onResults) return;

    const trimmed = value.trim();
    if (trimmed.length < minChars) {
      setError("");
      onResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (morosoOnly) params.set("morosoOnly", "1");
        const res = await fetch(`/api/customers?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No se pudo buscar");
          onResults([]);
          return;
        }
        onResults(Array.isArray(data) ? data : []);
      } catch {
        setError("Error de conexión al buscar");
        onResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value, morosoOnly, minChars, autoSearch, onResults]);

  return (
    <div className={className}>
      <label htmlFor={inputId} className="sr-only">
        Buscar cliente
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            Buscando…
          </span>
        )}
      </div>

      {showMorosoFilter && onMorosoOnlyChange && (
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={morosoOnly}
            onChange={(e) => onMorosoOnlyChange(e.target.checked)}
            className="rounded border-slate-300"
            style={{ accentColor: COLORS.brand }}
          />
          Solo clientes con saldo pendiente (cobranza)
        </label>
      )}

      {!loading && value.trim().length > 0 && value.trim().length < minChars && (
        <p className="mt-1 text-xs text-slate-500">Escriba al menos {minChars} caracteres.</p>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface CustomerSearchPickerProps {
  onSelect: (customer: CustomerSearchResult) => void;
  selectedId?: string | null;
  morosoOnly?: boolean;
  showMorosoFilter?: boolean;
  className?: string;
}

/** Buscador con lista desplegable para seleccionar un cliente. */
export function CustomerSearchPicker({
  onSelect,
  selectedId,
  morosoOnly: morosoOnlyProp = false,
  showMorosoFilter = false,
  className = "",
}: CustomerSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [morosoOnly, setMorosoOnly] = useState(morosoOnlyProp);
  const [results, setResults] = useState<CustomerSearchResult[]>([]);

  return (
    <div className={className}>
      <CustomerSearchInput
        value={query}
        onChange={setQuery}
        onResults={setResults}
        morosoOnly={morosoOnly}
        onMorosoOnlyChange={setMorosoOnly}
        showMorosoFilter={showMorosoFilter}
      />

      {results.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-auto rounded-lg border bg-white shadow-sm">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c);
                  setQuery(`${c.contract} — ${c.name}`);
                  setResults([]);
                }}
                className={`w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                  selectedId === c.id ? "bg-teal-50" : ""
                } ${c.hasCancellation ? "opacity-70" : ""}`}
              >
                <span className="font-medium">{c.contract}</span>
                <span className="text-slate-600"> — {c.name}</span>
                <span className="block text-xs text-slate-500">
                  Cédula {c.cedula}
                  {c.zone ? ` · ${c.zone}` : ""}
                  {c.planName ? ` · ${c.planName}` : ""}
                </span>
                {c.hasCancellation && (
                  <span className="text-xs font-medium text-red-600">Ya tiene baja registrada</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !results.length && (
        <p className="mt-2 text-sm text-slate-500">Sin coincidencias para «{query.trim()}».</p>
      )}
    </div>
  );
}
