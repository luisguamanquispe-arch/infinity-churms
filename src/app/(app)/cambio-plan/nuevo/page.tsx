"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { addMonths } from "date-fns";
import { COLORS, OPERATION_TYPE_LABELS } from "@/lib/constants";
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
    activeServicePlanId: string | null;
  };
  permanenceMonths: number;
  pendingChange: { id: string; status: string } | null;
}

type OperationType = "CAMBIO_PLAN" | "RENOVACION" | "RENOVACION_CAMBIO_PLAN";
type Step = "type" | "search" | "select" | "confirm";

export default function NuevaGestionContractualPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("customerId");
  const preselectedOp = searchParams.get("operationType") as OperationType | null;

  const [operationType, setOperationType] = useState<OperationType>(
    preselectedOp && OPERATION_TYPE_LABELS[preselectedOp] ? preselectedOp : "CAMBIO_PLAN"
  );
  const [step, setStep] = useState<Step>(preselectedId ? "search" : "type");
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

  const isRenewal = operationType === "RENOVACION";
  const needsPlanSelection = operationType === "CAMBIO_PLAN" || operationType === "RENOVACION_CAMBIO_PLAN";
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

  useEffect(() => {
    if (preselectedOp && OPERATION_TYPE_LABELS[preselectedOp]) {
      setOperationType(preselectedOp);
    }
  }, [preselectedOp]);

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
      setError(`Ya existe una operación en curso (${data.pendingChange.status}).`);
      router.push(`/cambio-plan/${data.pendingChange.id}`);
      return;
    }
    setCtx(data);
    if (isRenewal && data.currentPlan.activeServicePlanId) {
      setSelectedPlanId(data.currentPlan.activeServicePlanId);
      setStep("confirm");
    } else if (needsPlanSelection) {
      setStep("select");
    } else {
      setStep("confirm");
    }
  }

  function selectOperationType(op: OperationType) {
    setOperationType(op);
    setStep(preselectedId ? "search" : "search");
    if (preselectedId) loadCustomer(preselectedId);
  }

  async function submitDraft() {
    if (!ctx) return;
    if (needsPlanSelection && !selectedPlan) return;

    setError("");
    setLoading(true);
    const approved = specialPrice ? Number(specialPrice) : undefined;
    const body: Record<string, unknown> = {
      customerId: ctx.customer.id,
      operationType,
      approvedMonthlyUsd: approved,
      discountReason: discountReason || undefined,
    };
    if (needsPlanSelection && selectedPlan) {
      body.newPlanId = selectedPlan.id;
    } else if (isRenewal && ctx.currentPlan.activeServicePlanId) {
      body.newPlanId = ctx.currentPlan.activeServicePlanId;
    }

    const r = await fetch("/api/plan-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const approvedPrice = specialPrice
    ? Number(specialPrice)
    : selectedPlan
      ? Number(selectedPlan.monthlyUsd)
      : ctx?.currentPlan.monthlyUsd ?? 0;
  const currentPrice = ctx?.currentPlan.monthlyUsd ?? 0;
  const increment = approvedPrice - currentPrice;
  const opLabel = OPERATION_TYPE_LABELS[operationType];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cambio-plan" className="text-sm text-slate-500 hover:underline">← Volver</Link>
        <h1 className="text-2xl font-bold" style={{ color: COLORS.navy }}>
          Nueva gestión contractual
        </h1>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {step === "type" && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Tipo de operación</h2>
          {(["CAMBIO_PLAN", "RENOVACION", "RENOVACION_CAMBIO_PLAN"] as OperationType[]).map((op) => (
            <label
              key={op}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${
                operationType === op ? "border-[#00A9B5] bg-teal-50" : ""
              }`}
            >
              <input
                type="radio"
                name="operationType"
                checked={operationType === op}
                onChange={() => setOperationType(op)}
              />
              <div>
                <p className="font-medium">{OPERATION_TYPE_LABELS[op]}</p>
                <p className="text-xs text-slate-500">
                  {op === "CAMBIO_PLAN" && "Modificar plan con nuevo adendum y permanencia de 18 meses."}
                  {op === "RENOVACION" && "Renovar contrato manteniendo el plan actual."}
                  {op === "RENOVACION_CAMBIO_PLAN" && "Renovar y cambiar plan en un solo documento."}
                </p>
              </div>
            </label>
          ))}
          <button
            type="button"
            onClick={() => selectOperationType(operationType)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: COLORS.brand }}
          >
            Continuar
          </button>
        </section>
      )}

      {(step === "search" || step === "select" || step === "confirm") && (
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm">
          Operación: <strong>{opLabel}</strong>
        </div>
      )}

      {step === "search" && !ctx && (
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
                  <span className="ml-2 text-sm text-slate-500">{c.contract} · {c.cedula}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx && step !== "type" && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold text-[#0B1F3A]">Plan actual</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Cliente</dt><dd>{ctx.customer.name}</dd></div>
            <div><dt className="text-slate-500">Contrato</dt><dd>{ctx.customer.contract}</dd></div>
            <div><dt className="text-slate-500">Plan</dt><dd>{ctx.currentPlan.planName}</dd></div>
            <div><dt className="text-slate-500">Precio</dt><dd>{ctx.currentPlan.monthlyUsd != null ? formatUsd(ctx.currentPlan.monthlyUsd) : "—"}</dd></div>
            <div><dt className="text-slate-500">Permanencia cumplida</dt><dd>{ctx.currentPlan.monthsCompleted} meses</dd></div>
            <div><dt className="text-slate-500">Permanencia restante</dt><dd>{ctx.currentPlan.monthsRemaining} meses</dd></div>
          </dl>
        </section>
      )}

      {step === "select" && ctx && needsPlanSelection && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Seleccionar {operationType === "CAMBIO_PLAN" ? "nuevo plan" : "plan de renovación"}</h2>
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
                <p className="text-sm">Incremento mensual: <strong>{formatUsd(increment)}</strong></p>
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
                  <input
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Motivo del descuento *"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
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

      {step === "confirm" && ctx && (
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">Confirmar {opLabel.toLowerCase()}</h2>
          <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-2">
            <p><strong>Operación:</strong> {opLabel}</p>
            <p><strong>Plan actual:</strong> {ctx.currentPlan.planName} – {ctx.currentPlan.monthlyUsd != null ? formatUsd(ctx.currentPlan.monthlyUsd) : "—"}</p>
            <p><strong>{isRenewal ? "Plan renovado" : "Nuevo plan"}:</strong>{" "}
              {selectedPlan?.name ?? ctx.currentPlan.planName} – {formatUsd(approvedPrice)}
            </p>
            {!isRenewal && selectedPlan && ctx.currentPlan.planName === selectedPlan.name && (
              <p className="text-amber-700">Cambio: ninguno (mismo plan)</p>
            )}
            <p><strong>Nueva permanencia:</strong> {ctx.permanenceMonths} meses</p>
            <p><strong>Inicio estimado:</strong> {previewDates.start.toLocaleDateString("es-VE")}</p>
            <p><strong>Fin estimado:</strong> {previewDates.end.toLocaleDateString("es-VE")}</p>
          </div>
          <p className="text-xs text-slate-500">
            La fecha exacta se calculará al momento de la firma del documento.
          </p>
          {!planChangeId ? (
            <button
              type="button"
              disabled={loading}
              onClick={submitDraft}
              className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.navy }}
            >
              CREAR BORRADOR
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={confirmChange}
              className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.navy }}
            >
              CONFIRMAR Y GENERAR DOCUMENTO
            </button>
          )}
        </section>
      )}
    </div>
  );
}
