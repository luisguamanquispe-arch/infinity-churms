"use client";

import { CANCELLATION_FLOW_STEPS, getCancellationFlowStep } from "@/lib/preliquidacion-display";
import { COLORS } from "@/lib/constants";

export function CancellationFlowStepper({ status }: { status: string }) {
  const active = getCancellationFlowStep(status);
  const completed = status === "BAJA_COMPLETADA";

  return (
    <nav aria-label="Progreso de la baja" className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Flujo de la baja
      </p>
      <ol className="flex flex-wrap items-center gap-1 text-xs sm:gap-2 sm:text-sm">
        {CANCELLATION_FLOW_STEPS.map((label, index) => {
          const done = completed || index < active;
          const current = !completed && index === active;
          return (
            <li key={label} className="flex items-center gap-1 sm:gap-2">
              {index > 0 && <span className="text-slate-300">→</span>}
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  current
                    ? "text-white"
                    : done
                      ? "bg-teal-100 text-teal-800"
                      : "bg-slate-100 text-slate-500"
                }`}
                style={current ? { backgroundColor: COLORS.brand } : undefined}
              >
                {done && !current ? "✓ " : current ? "● " : "○ "}
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
