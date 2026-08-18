import { formatUsd } from "@/lib/liquidation";

export interface PlanSnapshot {
  name: string;
  speedMbps: number | null;
  monthlyUsd: number | null;
}

export interface PlanComparisonResult {
  speedDeltaMbps: number | null;
  priceDeltaUsd: number | null;
  attractiveBySpeed: boolean;
  attractiveByPrice: boolean;
  isAttractive: boolean;
  summary: string;
  detail: string;
}

export function parsePlanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function comparePlanOffer(
  current: PlanSnapshot,
  offered: PlanSnapshot
): PlanComparisonResult | null {
  const currentSpeed = parsePlanNumber(current.speedMbps);
  const offeredSpeed = parsePlanNumber(offered.speedMbps);
  const currentPrice = parsePlanNumber(current.monthlyUsd);
  const offeredPrice = parsePlanNumber(offered.monthlyUsd);

  if (
    currentSpeed === null &&
    offeredSpeed === null &&
    currentPrice === null &&
    offeredPrice === null
  ) {
    return null;
  }

  const speedDelta =
    currentSpeed !== null && offeredSpeed !== null ? offeredSpeed - currentSpeed : null;
  const priceDelta =
    currentPrice !== null && offeredPrice !== null ? offeredPrice - currentPrice : null;

  const attractiveBySpeed = speedDelta !== null && speedDelta > 0 && (priceDelta === null || priceDelta <= 0);
  const attractiveByPrice = priceDelta !== null && priceDelta < 0 && (speedDelta === null || speedDelta >= 0);
  const isAttractive =
    attractiveBySpeed ||
    attractiveByPrice ||
    (speedDelta !== null && priceDelta !== null && speedDelta > 0 && priceDelta < 0);

  const parts: string[] = [];
  if (speedDelta !== null && speedDelta !== 0) {
    parts.push(
      speedDelta > 0
        ? `+${speedDelta} Mbps de capacidad`
        : `${speedDelta} Mbps de capacidad`
    );
  }
  if (priceDelta !== null && priceDelta !== 0) {
    parts.push(
      priceDelta < 0
        ? `ahorro de ${formatUsd(Math.abs(priceDelta))}/mes`
        : `incremento de ${formatUsd(priceDelta)}/mes`
    );
  }

  let summary: string;
  if (isAttractive) {
    if (speedDelta !== null && speedDelta > 0 && priceDelta !== null && priceDelta < 0) {
      summary = "Oferta atractiva: más megas y menor costo mensual.";
    } else if (attractiveBySpeed) {
      summary = "Oferta atractiva por capacidad: más megas sin aumento de precio.";
    } else {
      summary = "Oferta atractiva por precio: mismo o mayor servicio a menor costo.";
    }
  } else if (speedDelta === 0 && priceDelta === 0) {
    summary = "Plan equivalente al actual en megas y costo.";
  } else {
    summary = "Revise la propuesta: no mejora claramente precio ni capacidad frente al plan actual.";
  }

  return {
    speedDeltaMbps: speedDelta,
    priceDeltaUsd: priceDelta,
    attractiveBySpeed,
    attractiveByPrice,
    isAttractive,
    summary,
    detail: parts.length > 0 ? parts.join(" · ") : "Complete megas y costo para comparar.",
  };
}
