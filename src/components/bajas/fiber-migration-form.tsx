"use client";

import { useState } from "react";
import { COLORS } from "@/lib/constants";
import { formatBusinessDateFromApi } from "@/lib/business-date";

export interface FiberMigrationResult {
  originTechnology: string;
  currentTechnology: string;
  fiberMigrationDate: string | null;
  fiberInstallDate: string | null;
  migrationReviewRequired: boolean;
}

export function FiberMigrationForm({
  customerId,
  initialMigrationDate,
  onSuccess,
  compact = false,
}: {
  customerId: string;
  initialMigrationDate?: string | null;
  onSuccess: (result: FiberMigrationResult) => void;
  compact?: boolean;
}) {
  const [migrationDate, setMigrationDate] = useState(initialMigrationDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function registerMigration(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/customers/${customerId}/migrate-fiber`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiberMigrationDate: migrationDate, notes }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error ?? "Error al registrar migración");
      setSaving(false);
      return;
    }
    onSuccess({
      originTechnology: json.originTechnology,
      currentTechnology: json.currentTechnology,
      fiberMigrationDate: json.fiberMigrationDate
        ? formatBusinessDateFromApi(json.fiberMigrationDate)
        : null,
      fiberInstallDate: json.fiberInstallDate
        ? formatBusinessDateFromApi(json.fiberInstallDate)
        : null,
      migrationReviewRequired: json.migrationReviewRequired,
    });
    setMsg("Migración registrada correctamente");
    setSaving(false);
  }

  return (
    <section
      className={`rounded-xl border-2 border-amber-200 bg-amber-50/40 p-5 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      <h2 className="font-semibold text-[#0B1F3A]">Migración radioenlace → fibra</h2>
      <p className="mt-1 text-sm text-slate-600">
        Registre la fecha de migración a fibra. La permanencia mínima (18 meses) se calculará desde
        esta fecha, no desde el alta original del cliente.
      </p>
      {msg && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            msg.includes("Error") || msg.includes("error")
              ? "bg-red-50 text-red-700"
              : "bg-teal-50 text-teal-800"
          }`}
        >
          {msg}
        </p>
      )}
      <form onSubmit={registerMigration} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Fecha migración a fibra *</label>
          <input
            type="date"
            required
            value={migrationDate}
            onChange={(e) => setMigrationDate(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Observación</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Cliente migrado de radioenlace a fibra."
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.brand }}
          >
            {saving ? "Guardando…" : "Guardar migración y continuar"}
          </button>
        </div>
      </form>
    </section>
  );
}
