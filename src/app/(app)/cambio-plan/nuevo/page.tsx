"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { addMonths } from "date-fns";
import { COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";

interface ServicePlan {
  id: string;
  name: string;
  speedMbps: number;
  monthlyUsd: string;
  installUsd: string;
}

interface PlanContext {
  customer: {
    id: string;
    contract: string;
    name: string;
    cedula: string;
    address: string;
    status: string;
  };
  currentPlan: {
    planName: string;
    speedMbps: number | null;
    monthlyUsd: number | null;
    permanenceStart: string;
    permanenceEnd: string;
    monthsCompleted: number;
    monthsRemaining: number;
  };
  permanenceMonths: number;
  pendingChange: { id: string; status: string } | null;
}

type Step = "search" | "select" | "confirm" | "done";

export default function NuevoCambioPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("customerId");

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<{ id: string; contract: string; name: string; cedula: string }[]>([]);
  const [ctx, setCtx] = useState<PlanContext | null>(null);
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [specialPrice, setSpecialPrice] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [planChangeId, setPlanChangeId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const previewDates = useMemo(() => {
    const start = new Date();
    const end = addMonths(start, ctx?.permanenceMonths ?? 18);
    return { start, end };
  }, [ctx?.permanenceMonths]);

  useEffect(() => {
    fetch("/api/service-plans").then((r) => r.json()).then(setPlans);
  }, []);

  useEffect(() => {
    if (preselectedId) loadCustomer(preselectedId);
  }, [preselectedId]);

  async function searchCustomers() {
    if (!query.trim()) return;
    const r = await fetch(`/api/customers?q=${encodeURIComponent(query.trim())}`);
    const data = await r.json();
    setCustomers(Array.isArray(data) ? data : data.items ?? []);
  }

  async function loadCustomer(id: string) {
    setError("");
    setLoading(true);
    const r = await fetch(`/api/customers/${id}/plan-context`);
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      setError(data.error ?? "Error al cargar cliente");
      return;
    }
    if (data.pendingChange) {
      setError(`Ya existe un cambio en curso (${data.pendingChange.status}).`);
      router.push(`/cambio-plan/${data.pendingChange.id}`);
      return;
    }
    setCtx(data);
    setStep("select");
  }

  async function submitDraft() {
    if (!ctx || !selectedPlan) return;
    setError("");
    setLoading(true);
    const approved = specialPrice ? Number(specialPrice) : undefined;
    const r = await fetch("/api/plan-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: ctx.customer.id,
        newPlanId: selectedPlan.id,
        approvedMonthlyUsd: approved,
        discountReason: discountReason || undefined,
      }),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      setError(data.error ?? "Error al crear");
      return;
    }
    setPlanChangeId(data.id);
    setStep("confirm");
  }

  async function confirmChange() {
    setLoading(true);
    const r = await fetch(`/api/plan-changes/${planChangeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    setLoading(false);
    if (!r.ok) {
      const data = await r.json();
      setError(data.error ?? "Error al confirmar");
      return;
    }
    router.push(`/cambio-plan/${planChangeId}`);
  }

  const approvedPrice = specialPrice ? Number(specialPrice) : selectedPlan ? Number(selectedPlan.monthlyUsd) : 0;
  const currentPrice = ctx?.currentPlan.monthlyUsd ?? 0;
  const increment = approvedPrice - currentPrice;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cambio-plan" className="text-sm text-slate-500 hover:underline">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: COLORS.navy }}>
          Nuevo cambio de plan
        </h1>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === "search" && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Buscar cliente</h2>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCustomers()}
              placeholder="Contrato, cédula o nombre"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={searchCustomers}
              className="rounded-lg px-4 py-2 text-sm text-white"
              style={{ backgroundColor: COLORS.brand }}
            >
              Buscar
            </button>
          </div>
          <ul className="divide-y">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => loadCustomer(c.id)}
                  className="w-full px-2 py-3 text-left hover:bg-slate-50"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    {c.contract} · {c.cedula}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx && step !== "search" && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-[#0B1F3A]">Plan actual</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Cliente</dt><dd>{ctx.customer.name}</dd></div>
            <div><dt className="text-slate-500">Cédula</dt><dd>{ctx.customer.cedula}</dd></div>
            <div><dt className="text-slate-500">Contrato</dt><dd>{ctx.customer.contract}</dd></div>
            <div><dt className="text-slate-500">Dirección</dt><dd>{ctx.customer.address}</dd></div>
            <div><dt className="text-slate-500">Plan</dt><dd>{ctx.currentPlan.planName}</dd></div>
            <div><dt className="text-slate-500">Velocidad</dt><dd>{ctx.currentPlan.speedMbps ? `${ctx.currentPlan.speedMbps} Mbps` : "—"}</dd></div>
            <div><dt className="text-slate-500">Precio</dt><dd>{ctx.currentPlan.monthlyUsd != null ? formatUsd(ctx.currentPlan.monthlyUsd) : "—"}</dd></div>
            <div><dt className="text-slate-500">Permanencia cumplida</dt><dd>{ctx.currentPlan.monthsCompleted} meses</dd></div>
            <div><dt className="text-slate-500">Permanencia restante</dt><dd>{ctx.currentPlan.monthsRemaining} meses</dd></div>
          </dl>
        </section>
      )}

      {step === "select" && ctx && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Seleccionar nuevo plan</h2>
          <div className="grid gap-2">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                  selectedPlanId === p.id ? "border-[#00A9B5] bg-teal-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={selectedPlanId === p.id}
                    onChange={() => {
                      setSelectedPlanId(p.id);
                      setSpecialPrice("");
                    }}
                  />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.speedMbps} Mbps · {formatUsd(Number(p.monthlyUsd))}/mes</div>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {selectedPlan && (
            <>
              <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">PLAN ACTUAL</p>
                  <p className="font-semibold">{ctx.currentPlan.planName}</p>
                  <p>{ctx.currentPlan.monthlyUsd != null ? formatUsd(ctx.currentPlan.monthlyUsd) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">NUEVO PLAN</p>
                  <p className="font-semibold">{selectedPlan.name}</p>
                  <p>{formatUsd(approvedPrice)}</p>
                </div>
              </div>
              {increment !== 0 && (
                <p className="text-sm">
                  Incremento mensual: <strong>{formatUsd(increment)}</strong>
                </p>
              )}

              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium">Precio especial (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={specialPrice}
                  onChange={(e) => setSpecialPrice(e.target.value)}
                  placeholder={String(selectedPlan.monthlyUsd)}
                  className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
                />
                {specialPrice && Number(specialPrice) < Number(selectedPlan.monthlyUsd) && (
                  <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
                    <p>Precio estándar: {formatUsd(Number(selectedPlan.monthlyUsd))}</p>
                    <p>Precio especial: {formatUsd(Number(specialPrice))}</p>
                    <p>Descuento: {formatUsd(Number(selectedPlan.monthlyUsd) - Number(specialPrice))}</p>
                    <input
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Motivo del descuento *"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={loading || !selectedPlanId}
                onClick={submitDraft}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand }}
              >
                Continuar a confirmación
              </button>
            </>
          )}
        </section>
      )}

      {step === "confirm" && ctx && selectedPlan && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Confirmar cambio de plan</h2>
          <p className="text-sm text-slate-600">Estoy cambiando:</p>
          <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-2">
            <p><strong>Plan actual:</strong> {ctx.currentPlan.planName} – {ctx.currentPlan.monthlyUsd != null ? formatUsd(ctx.currentPlan.monthlyUsd) : "—"}</p>
            <p><strong>Nuevo plan:</strong> {selectedPlan.name} – {formatUsd(approvedPrice)}</p>
            <p><strong>Nueva permanencia:</strong> {ctx.permanenceMonths} meses</p>
            <p><strong>Inicio nueva permanencia:</strong> {previewDates.start.toLocaleDateString("es-VE")}</p>
            <p><strong>Fin nueva permanencia:</strong> {previewDates.end.toLocaleDateString("es-VE")}</p>
          </div>
          <p className="text-xs text-slate-500">
            La fecha exacta se calculará al momento de la firma del adendum.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={confirmChange}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.navy }}
          >
            CONFIRMAR CAMBIO DE PLAN
          </button>
        </section>
      )}
    </div>
  );
}
