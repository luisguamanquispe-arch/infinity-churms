"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COLORS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface PlanChangeHistoryProps {
  customerId: string;
}

export function PlanChangeHistoryPanel({ customerId }: PlanChangeHistoryProps) {
  const [rows, setRows] = useState<
    {
      id: string;
      status: string;
      signedAt: string | null;
      requestDate: string;
      previousPlanName: string;
      previousMonthlyUsd: string;
      newPlanName: string;
      newMonthlyUsd: string;
      newPermanenceStart: string | null;
      newPermanenceEnd: string | null;
      addendumNumber: string | null;
      clientSignatureName: string | null;
      createdBy: { name: string };
    }[]
  >([]);

  useEffect(() => {
    fetch(`/api/plan-changes?customerId=${customerId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
      })
      .catch(() => setRows([]));
  }, [customerId]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        Sin cambios de plan registrados.{" "}
        <Link href={`/cambio-plan/nuevo?customerId=${customerId}`} style={{ color: COLORS.brand }}>
          Iniciar cambio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold" style={{ color: COLORS.navy }}>
        Historial de cambios de plan
      </h3>
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">
              {new Date(r.signedAt ?? r.requestDate).toLocaleDateString("es-VE")}
            </span>
            <span className="text-xs text-slate-500">
              {PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <p className="mt-1">
            <span className="text-slate-500">Anterior:</span> {r.previousPlanName} – {formatUsd(Number(r.previousMonthlyUsd))}
          </p>
          <p>
            <span className="text-slate-500">Nuevo:</span> {r.newPlanName} – {formatUsd(Number(r.newMonthlyUsd))}
          </p>
          {r.newPermanenceStart && (
            <p className="text-xs text-slate-500">
              Permanencia: {new Date(r.newPermanenceStart).toLocaleDateString("es-VE")} →{" "}
              {r.newPermanenceEnd ? new Date(r.newPermanenceEnd).toLocaleDateString("es-VE") : "—"}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {r.addendumNumber && <span>Adendum: {r.addendumNumber}</span>}
            {r.clientSignatureName && <span>Firmante: {r.clientSignatureName}</span>}
            <Link href={`/cambio-plan/${r.id}`} style={{ color: COLORS.brand }}>
              Ver detalle
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
