"use client";

import {
  PRELEGAL_NOTICE,
  buildPrelegalOverdueSummary,
  getOverdueDays,
  isPrelegalOverdue,
  PRELEGAL_OVERDUE_DAYS,
} from "@/lib/services/overdue";
import { formatUsd } from "@/lib/liquidation";
import { COLORS } from "@/lib/constants";

export function PrelegalOverdueNotice({
  customer,
  equipmentTariffs,
}: {
  customer: {
    id: string;
    name: string;
    contract: string;
    pendingBalance: number | string;
    overdueSince: string | null;
    planName: string;
    hasTvStreaming: boolean;
    tvStreamingSince: string | null;
    equipment: { type: string; brand?: string | null; model?: string | null }[];
  };
  equipmentTariffs: { type: string; notReturnedUsd: number | string }[];
}) {
  const days = getOverdueDays({
    pendingBalance: customer.pendingBalance,
    overdueSince: customer.overdueSince,
  });
  const eligible = isPrelegalOverdue({
    pendingBalance: customer.pendingBalance,
    overdueSince: customer.overdueSince,
  });

  const summary = eligible
    ? buildPrelegalOverdueSummary({
        pendingBalance: customer.pendingBalance,
        overdueSince: customer.overdueSince,
        planName: customer.planName,
        hasTvStreaming: customer.hasTvStreaming,
        tvStreamingSince: customer.tvStreamingSince,
      equipment: customer.equipment,
      equipmentTariffs,
    })
    : null;

  if (Number(customer.pendingBalance) <= 0) return null;

  if (!customer.overdueSince) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Aviso prelegal (+{PRELEGAL_OVERDUE_DAYS} días)</p>
        <p className="mt-1">
          Este cliente tiene saldo pendiente. Indique la <strong>fecha de inicio de mora</strong> en la
          pestaña Datos del cliente para calcular el aviso de cobranza.
        </p>
      </section>
    );
  }

  if (!eligible) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Mora registrada: {days} días</p>
        <p className="mt-1">
          El aviso prelegal se habilita al superar {PRELEGAL_OVERDUE_DAYS} días. Saldo:{" "}
          {formatUsd(Number(customer.pendingBalance))}.
        </p>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
            Cobranza prelegal
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">{PRELEGAL_NOTICE.title}</h2>
          <p className="mt-1 text-sm text-amber-900">
            {customer.name} · Contrato {customer.contract} · {summary.overdueDays} días de mora
          </p>
        </div>
        <a
          href={`/api/customers/${customer.id}/aviso-prelegal`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: COLORS.brand }}
        >
          Descargar aviso PDF
        </a>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#0B1F3A] text-left text-white">
            <tr>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2 text-right">Valor USD</th>
            </tr>
          </thead>
          <tbody>
            {summary.overdueItems.map((item) => (
              <tr key={item.concept} className="border-t">
                <td className="px-3 py-2 font-medium">{item.concept}</td>
                <td className="px-3 py-2 text-slate-600">{item.detail}</td>
                <td className="px-3 py-2 text-right">{formatUsd(item.amount)}</td>
              </tr>
            ))}
            <tr className="border-t bg-amber-50 font-bold">
              <td className="px-3 py-2" colSpan={2}>
                TOTAL VENCIDO (según registro)
              </td>
              <td className="px-3 py-2 text-right">{formatUsd(summary.totalOverdue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-3 text-sm text-slate-800">
        <p>{PRELEGAL_NOTICE.greeting}</p>
        <p>{PRELEGAL_NOTICE.intro.replace(/\*\*/g, "")}</p>
        <p>{PRELEGAL_NOTICE.contractIntro}</p>
        <ul className="list-inside list-disc space-y-2 pl-1">
          {PRELEGAL_NOTICE.bullets.map((bullet) => (
            <li key={bullet}>{bullet.replace(/\*\*/g, "")}</li>
          ))}
        </ul>
        {summary.equipmentExposure.length > 0 && (
          <div className="rounded-lg border border-amber-100 bg-white p-3 text-xs">
            <p className="font-semibold text-slate-800">Equipos en comodato (referencia si no se devuelven):</p>
            <ul className="mt-2 space-y-1">
              {summary.equipmentExposure.map((e) => (
                <li key={e.type + e.label}>
                  {e.label}: {formatUsd(e.amount)}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-medium">Total equipos: {formatUsd(summary.totalEquipmentExposure)}</p>
          </div>
        )}
        <p className="font-semibold text-amber-900">{PRELEGAL_NOTICE.callToAction}</p>
        <p>{PRELEGAL_NOTICE.invitation}</p>
        <div className="border-t border-amber-200 pt-3">
          <p className="font-bold text-[#0B1F3A]">{PRELEGAL_NOTICE.company}</p>
          <p className="font-semibold">{PRELEGAL_NOTICE.department}</p>
          <p className="mt-1 italic text-teal-700">&ldquo;{PRELEGAL_NOTICE.tagline}&rdquo;</p>
        </div>
      </div>
    </section>
  );
}
