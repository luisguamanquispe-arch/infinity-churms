"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS, CANCELLATION_REASONS, INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_SINCE_LABEL, STREAMS_SUPPORT_LABEL } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { differenceInMonths } from "date-fns";

interface Customer {
  id: string;
  contract: string;
  name: string;
  cedula: string;
  address: string;
  serviceStartDate: string;
  planName: string;
  status: string;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  pendingBalance: string;
  hasCancellation?: boolean;
  equipment: { id: string; type: string; serial: string | null; brand: string | null; model: string | null }[];
}

export default function NuevaBajaPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (q.length < 2) return;
    fetch(`/api/customers?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setCustomers);
  }, [q]);

  async function submit() {
    if (!selected || !reason) {
      setError("Seleccione cliente y motivo de baja");
      return;
    }
    if (selected.hasCancellation) {
      setError("Este cliente ya tiene una baja registrada");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/cancellations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selected.id, reason }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/bajas/${data.id}`);
    else setError(data.error ?? "Error al crear");
    setLoading(false);
  }

  const months = selected
    ? differenceInMonths(new Date(), new Date(selected.serviceStartDate))
    : 0;
  const permanencePreview = selected ? Math.max(0, 18 - months) * (200 / 18) : 0;
  const tvMonths =
    selected?.hasTvStreaming && selected.tvStreamingSince
      ? differenceInMonths(new Date(), new Date(selected.tvStreamingSince))
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
                  onClick={() => setSelected(c)}
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
            <h2 className="font-semibold">Información del cliente</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Contrato" value={selected.contract} />
              <Row label="Nombre" value={selected.name} />
              <Row label="Cédula" value={selected.cedula} />
              <Row label="Plan" value={selected.planName} />
              <Row label="Dirección" value={selected.address} />
              <Row label="Alta servicio" value={new Date(selected.serviceStartDate).toLocaleDateString("es-VE")} />
              <Row label="Estado" value={selected.status} />
              <Row label="Mensualidades pend." value={formatUsd(Number(selected.pendingBalance))} />
              {selected.hasTvStreaming && (
                <Row
                  label={STREAMS_SUPPORT_SINCE_LABEL}
                  value={
                    selected.tvStreamingSince
                      ? new Date(selected.tvStreamingSince).toLocaleDateString("es-VE")
                      : "Sin fecha — actualice en Clientes"
                  }
                />
              )}
            </dl>
          </section>

          <section className="rounded-xl border bg-slate-50 p-5">
            <h2 className="font-semibold text-sm">Vista previa liquidación</h2>
            <p className="mt-2 text-sm">Meses cumplidos: {months} / 18</p>
            <p className="text-sm">{INSTALLATION_PRORATION_LABEL} estimado: {formatUsd(permanencePreview)}</p>
            {selected.hasTvStreaming && selected.tvStreamingSince && (
              <p className="text-sm">
                {STREAMS_SUPPORT_LABEL} ({tvMonths} meses × $2): {formatUsd(tvMonths * 2)}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">Equipos no se incluyen en la liquidación</p>
          </section>

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
            disabled={loading || selected.hasCancellation || !reason}
            className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.brand }}
          >
            {loading ? "Creando..." : "Registrar solicitud y calcular liquidación"}
          </button>
        </>
      )}
    </div>
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
