"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { differenceInMonths } from "date-fns";

interface Customer {
  id: string;
  code: string;
  name: string;
  cedula: string;
  address: string;
  serviceStartDate: string;
  planName: string;
  status: string;
  hasTvStreaming: boolean;
  tvStreamingSince: string | null;
  pendingBalance: string;
  equipment: { id: string; type: string; serial: string | null }[];
}

export default function NuevaBajaPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) return;
    fetch(`/api/customers?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setCustomers);
  }, [q]);

  async function submit() {
    if (!selected) return;
    setLoading(true);
    const res = await fetch("/api/cancellations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selected.id }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/bajas/${data.id}`);
    setLoading(false);
  }

  const months = selected
    ? differenceInMonths(new Date(), new Date(selected.serviceStartDate))
    : 0;
  const permanencePreview = selected
    ? Math.max(0, 18 - months) * (200 / 18)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-[#0B1F3A]">Nueva Solicitud de Baja</h1>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <label className="text-sm font-medium">Buscar cliente</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código, nombre o cédula..."
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        />
        {customers.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-auto rounded border">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {c.code} — {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Información del cliente</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Código" value={selected.code} />
              <Row label="Nombre" value={selected.name} />
              <Row label="Cédula" value={selected.cedula} />
              <Row label="Plan" value={selected.planName} />
              <Row label="Dirección" value={selected.address} />
              <Row label="Alta servicio" value={new Date(selected.serviceStartDate).toLocaleDateString("es-VE")} />
              <Row label="Estado" value={selected.status} />
              <Row label="Mensualidades pend." value={formatUsd(Number(selected.pendingBalance))} />
            </dl>
          </section>

          <section className="rounded-xl border bg-slate-50 p-5">
            <h2 className="font-semibold text-sm">Vista previa liquidación</h2>
            <p className="mt-2 text-sm">Meses cumplidos: {months} / 18</p>
            <p className="text-sm">Permanencia estimada: {formatUsd(permanencePreview)}</p>
            {selected.hasTvStreaming && <p className="text-sm">TV Streams: activo</p>}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold text-sm">Equipos asociados</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Equipo</th>
                  <th>Serie</th>
                </tr>
              </thead>
              <tbody>
                {selected.equipment.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-2">{e.type}</td>
                    <td>{e.serial ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <button
            onClick={submit}
            disabled={loading}
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
