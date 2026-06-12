import { getDashboardKpis } from "@/lib/services/cancellations";
import { formatUsd } from "@/lib/liquidation";
import Link from "next/link";
import { COLORS } from "@/lib/constants";

export default async function DashboardPage() {
  let kpis = {
    pendingRequests: 0,
    pendingEquipment: 0,
    pendingAmount: 0,
    completedMonth: 0,
    activePermanence: 0,
    notRecovered: 0,
  };

  try {
    kpis = await getDashboardKpis();
  } catch {
    /* sin DB */
  }

  const cards = [
    { label: "Solicitudes pendientes", value: kpis.pendingRequests },
    { label: "Equipos por recuperar", value: kpis.pendingEquipment },
    { label: "Valores por cobrar", value: formatUsd(kpis.pendingAmount) },
    { label: "Bajas completadas (mes)", value: kpis.completedMonth },
    { label: "Con permanencia vigente", value: kpis.activePermanence },
    { label: "Equipos no recuperados", value: kpis.notRecovered },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Dashboard</h1>
          <p className="text-sm text-slate-500">Indicadores operativos de bajas</p>
        </div>
        <Link
          href="/bajas/nueva"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: COLORS.brand }}
        >
          Nueva solicitud
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="mt-1 text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
