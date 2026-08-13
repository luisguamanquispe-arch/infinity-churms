"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface ContractHistoryProps {
  customerId: string;
}

export function ContractHistoryPanel({ customerId }: ContractHistoryProps) {
  const [history, setHistory] = useState<{
    originalContract: {
      type: string;
      contractNumber: string;
      date: string;
      planName: string;
      speedMbps: number | null;
      monthlyUsd: number | null;
      permanenceStart: string;
      permanenceEnd: string | null;
    };
    addendums: {
      id: string;
      sequence: number;
      addendumNumber: string | null;
      date: string | null;
      planName: string;
      speedMbps: number;
      monthlyUsd: number;
      permanenceStart: string | null;
      permanenceEnd: string | null;
      status: string;
      signedBy: string | null;
      processedBy: string;
      hasPdf: boolean;
    }[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/contract-history`)
      .then((r) => r.json())
      .then(setHistory);
  }, [customerId]);

  if (!history) return <p className="text-sm text-slate-400">Cargando historial contractual…</p>;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold" style={{ color: COLORS.navy }}>
        Historial contractual
      </h3>
      <div className="relative space-y-0 border-l-2 border-slate-200 pl-6">
        <div className="relative pb-6">
          <span className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full bg-[#0B1F3A]" />
          <p className="text-xs font-medium uppercase text-slate-500">Contrato original</p>
          <p className="font-medium">{history.originalContract.planName}</p>
          <p className="text-sm text-slate-600">
            {formatUsd(history.originalContract.monthlyUsd ?? 0)} ·{" "}
            {new Date(history.originalContract.date).toLocaleDateString("es-VE")}
          </p>
        </div>
        {history.addendums.map((a) => (
          <div key={a.id} className="relative pb-6">
            <span className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full bg-[#00A9B5]" />
            <p className="text-xs font-medium uppercase text-slate-500">
              Adendum #{String(a.sequence).padStart(3, "0")} · {a.addendumNumber ?? "—"}
            </p>
            <p className="font-medium">{a.planName} · {a.speedMbps} Mbps</p>
            <p className="text-sm text-slate-600">
              {formatUsd(a.monthlyUsd)} · {a.date ? new Date(a.date).toLocaleDateString("es-VE") : "—"}
            </p>
            {a.permanenceStart && (
              <p className="text-xs text-slate-500">
                Permanencia: {new Date(a.permanenceStart).toLocaleDateString("es-VE")} →{" "}
                {a.permanenceEnd ? new Date(a.permanenceEnd).toLocaleDateString("es-VE") : "—"}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              {a.signedBy && <span>Firmante: {a.signedBy}</span>}
              <span>Procesado: {a.processedBy}</span>
              {a.hasPdf && (
                <a
                  href={`/api/plan-changes/${a.id}/adendum`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium"
                  style={{ color: COLORS.brand }}
                >
                  Ver PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
