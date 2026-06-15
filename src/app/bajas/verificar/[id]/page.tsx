import { getCancellation } from "@/lib/services/cancellations";
import { STATUS_LABELS, REASON_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VerificarBajaPage({ params }: Props) {
  const { id } = await params;

  let row;
  try {
    row = await getCancellation(id);
  } catch {
    notFound();
  }
  if (!row) notFound();

  const payment = row.payments[0];

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase text-teal-600">Verificación Infinity</p>
        <h1 className="mt-2 text-xl font-bold">{row.customer.name}</h1>
        <p className="text-sm text-slate-500">
          Contrato {row.customer.contract} · {row.customer.cedula}
        </p>
        <p className="text-xs text-slate-500">{REASON_LABELS[row.reason] ?? row.reason}</p>

        {row.actaPhysicalCode && (
          <div className="mt-4 rounded-lg border border-[#0B1F3A] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Código identificación física
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-[#0B1F3A]">{row.actaPhysicalCode}</p>
          </div>
        )}

        <dl className="mt-6 space-y-2 text-sm">
          <Row label="N° Acta" value={row.actaNumber ?? "—"} />
          <Row label="Estado" value={STATUS_LABELS[row.status] ?? row.status} />
          <Row label="Fecha solicitud" value={row.requestDate.toLocaleDateString("es-VE")} />
          <Row label="Total" value={formatUsd(Number(row.totalAmount))} />
          <Row label="Factura" value={payment?.invoiceNumber ?? row.invoiceNumber ?? "—"} />
        </dl>

        <h2 className="mt-6 font-semibold text-sm">Equipos recuperados</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {row.equipment.length === 0 ? (
            <li className="text-slate-500">Sin equipos registrados</li>
          ) : (
            row.equipment.map((e) => (
              <li key={e.id} className="border-t py-2">
                <p className="font-medium">
                  {e.type} — {e.brand ?? ""} {e.model ?? ""}
                </p>
                <p className="text-slate-500">
                  Serie: {e.serial ?? "—"} · {e.delivered ? (e.condition ?? "BUENO") : "No entregado"}
                </p>
              </li>
            ))
          )}
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
