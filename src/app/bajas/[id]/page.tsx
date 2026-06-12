import { getSession } from "@/lib/auth";
import { getCancellation } from "@/lib/services/cancellations";
import { CancellationDetail } from "@/components/bajas/cancellation-detail";
import { AppShell } from "@/components/layout/app-shell";
import { STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { getCancellationPermissions } from "@/lib/cancellation-permissions";
import { hasPermission, NAV_ITEMS } from "@/lib/permissions";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BajaPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();

  let row;
  try {
    row = await getCancellation(id);
  } catch {
    notFound();
  }
  if (!row) notFound();

  if (session) {
    const detail = {
      ...row,
      requestDate: row.requestDate.toISOString(),
      permanenceAmount: String(row.permanenceAmount),
      tvAmount: String(row.tvAmount),
      monthlyAmount: String(row.monthlyAmount),
      equipmentAmount: String(row.equipmentAmount),
      otherAmount: String(row.otherAmount),
      totalAmount: String(row.totalAmount),
      customer: {
        ...row.customer,
        serviceStartDate: row.customer.serviceStartDate.toISOString(),
        pendingBalance: String(row.customer.pendingBalance),
      },
      equipment: row.equipment.map((e) => ({
        ...e,
        chargeAmount: String(e.chargeAmount),
      })),
      charges: row.charges.map((c) => ({ ...c, amount: String(c.amount) })),
      payments: row.payments.map((p) => ({
        ...p,
        amountPaid: String(p.amountPaid),
        paymentDate: p.paymentDate.toISOString(),
      })),
    };

    const nav = NAV_ITEMS.filter((item) => hasPermission(session.role, item.permission)).map(
      ({ href, label }) => ({ href, label })
    );

    return (
      <AppShell user={{ name: session.name, role: session.role }} nav={nav}>
        <CancellationDetail initial={detail} permissions={getCancellationPermissions(session.role)} />
      </AppShell>
    );
  }

  const payment = row.payments[0];

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase text-teal-600">Verificación Infinity</p>
        <h1 className="mt-2 text-xl font-bold">{row.customer.name}</h1>
        <p className="text-sm text-slate-500">{row.customer.code} · {row.customer.cedula}</p>

        <dl className="mt-6 space-y-2 text-sm">
          <Row label="Estado" value={STATUS_LABELS[row.status] ?? row.status} />
          <Row label="Fecha solicitud" value={row.requestDate.toLocaleDateString("es-VE")} />
          <Row label="Total" value={formatUsd(Number(row.totalAmount))} />
          <Row label="Factura" value={payment?.invoiceNumber ?? row.invoiceNumber ?? "—"} />
        </dl>

        <h2 className="mt-6 font-semibold text-sm">Equipos recuperados</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {row.equipment.map((e) => (
            <li key={e.id} className="flex justify-between border-t py-1">
              <span>{e.type} {e.serial}</span>
              <span>{e.delivered ? (e.condition ?? "BUENO") : "No entregado"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
