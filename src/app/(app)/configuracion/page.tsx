"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface TariffConfig {
  permanenceMonths: number;
  installCostUsd: string;
  tvMonthlyUsd: string;
}

interface EquipmentTariff {
  type: string;
  damagedUsd: string;
  notReturnedUsd: string;
}

export default function ConfiguracionPage() {
  const [tariff, setTariff] = useState<TariffConfig | null>(null);
  const [equipment, setEquipment] = useState<EquipmentTariff[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config/tariffs")
      .then((r) => r.json())
      .then((data) => {
        if (data.tariff) {
          setTariff({
            permanenceMonths: data.tariff.permanenceMonths,
            installCostUsd: String(data.tariff.installCostUsd),
            tvMonthlyUsd: String(data.tariff.tvMonthlyUsd),
          });
        }
        setEquipment(
          (data.equipment ?? []).map((e: EquipmentTariff) => ({
            type: e.type,
            damagedUsd: String(e.damagedUsd),
            notReturnedUsd: String(e.notReturnedUsd),
          }))
        );
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!tariff) return;
    setMsg("");
    const res = await fetch("/api/config/tariffs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariff: {
          permanenceMonths: tariff.permanenceMonths,
          installCostUsd: parseFloat(tariff.installCostUsd),
          tvMonthlyUsd: parseFloat(tariff.tvMonthlyUsd),
        },
        equipment: equipment.map((e) => ({
          type: e.type,
          damagedUsd: parseFloat(e.damagedUsd),
          notReturnedUsd: parseFloat(e.notReturnedUsd),
        })),
      }),
    });
    if (res.ok) setMsg("Tarifas guardadas. Las nuevas bajas usarán estos valores.");
    else setMsg("Error al guardar");
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Configuración de tarifas</h1>
        <p className="text-sm text-slate-500">Solo administradores. Afecta liquidaciones futuras.</p>
      </header>

      {msg && <p className="rounded-lg bg-teal-50 px-4 py-2 text-sm text-teal-800">{msg}</p>}

      {tariff && (
        <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold">Permanencia y Streams</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Meses permanencia"
              type="number"
              value={String(tariff.permanenceMonths)}
              onChange={(v) => setTariff({ ...tariff, permanenceMonths: parseInt(v) || 18 })}
            />
            <Field
              label="Costo instalación (USD)"
              type="number"
              value={tariff.installCostUsd}
              onChange={(v) => setTariff({ ...tariff, installCostUsd: v })}
            />
            <Field
              label="Soporte de Streams / mes (USD)"
              type="number"
              value={tariff.tvMonthlyUsd}
              onChange={(v) => setTariff({ ...tariff, tvMonthlyUsd: v })}
            />
          </div>
          <p className="text-xs text-slate-500">
            Prorrateo mensual: {formatUsd(Number(tariff.installCostUsd) / tariff.permanenceMonths)} / mes
          </p>
        </section>
      )}

      <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold">Tarifas por equipo</h2>
        {equipment.map((eq, i) => (
          <div key={eq.type} className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <p className="font-medium text-sm">{eq.type}</p>
            <Field
              label="Dañado (USD)"
              type="number"
              value={eq.damagedUsd}
              onChange={(v) => {
                const next = [...equipment];
                next[i] = { ...eq, damagedUsd: v };
                setEquipment(next);
              }}
            />
            <Field
              label="No entregado (USD)"
              type="number"
              value={eq.notReturnedUsd}
              onChange={(v) => {
                const next = [...equipment];
                next[i] = { ...eq, notReturnedUsd: v };
                setEquipment(next);
              }}
            />
          </div>
        ))}
      </section>

      <button
        onClick={save}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: COLORS.brand }}
      >
        Guardar configuración
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
      />
    </div>
  );
}
