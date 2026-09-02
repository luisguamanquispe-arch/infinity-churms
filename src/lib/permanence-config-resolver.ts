import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertValidInstallCostUsd,
  assertValidPermanenceMonths,
  assertValidTvMonthlyUsd,
  type PermanenceTariffSnapshot,
  type ResolvedPermanenceTariff,
  tariffFromCancellationSnapshot,
} from "@/lib/permanence-config";

const GOVERNING_PLAN_CHANGE_STATUSES = ["ACTIVO", "FIRMADO"] as const;

export async function resolvePermanenceConfigForCustomer(
  customerId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<ResolvedPermanenceTariff> {
  const tariffRow = await tx.tariffConfig.findFirst();
  const installCostUsd = assertValidInstallCostUsd(tariffRow?.installCostUsd ?? 200);
  const tvMonthlyUsd = assertValidTvMonthlyUsd(tariffRow?.tvMonthlyUsd ?? 2);
  const defaultMonths = assertValidPermanenceMonths(tariffRow?.permanenceMonths ?? 18);

  const planChange = await tx.planChange.findFirst({
    where: {
      customerId,
      status: { in: [...GOVERNING_PLAN_CHANGE_STATUSES] },
    },
    orderBy: [{ activatedAt: "desc" }, { signedAt: "desc" }, { requestDate: "desc" }],
    select: {
      id: true,
      addendumNumber: true,
      permanenceMonths: true,
    },
  });

  if (planChange) {
    return {
      permanenceMonths: assertValidPermanenceMonths(planChange.permanenceMonths),
      installCostUsd,
      tvMonthlyUsd,
      source: "PLAN_CHANGE",
      planChangeId: planChange.id,
      planChangeAddendum: planChange.addendumNumber,
    };
  }

  return {
    permanenceMonths: defaultMonths,
    installCostUsd,
    tvMonthlyUsd,
    source: "TARIFF_DEFAULT",
    planChangeId: null,
    planChangeAddendum: null,
  };
}

export async function resolvePermanenceTariffForCancellation(
  cancellation: {
    customerId: string;
    permanenceMonthsSnapshot?: number | null;
    installCostUsdSnapshot?: unknown | null;
    tvMonthlyUsdSnapshot?: unknown | null;
  },
  tx: Prisma.TransactionClient = prisma
): Promise<PermanenceTariffSnapshot & { source: ResolvedPermanenceTariff["source"]; planChangeAddendum: string | null }> {
  const snapshot = tariffFromCancellationSnapshot(cancellation);
  if (snapshot) {
    try {
      const resolved = await resolvePermanenceConfigForCustomer(cancellation.customerId, tx);
      return {
        ...snapshot,
        source: resolved.source,
        planChangeAddendum: resolved.planChangeAddendum,
      };
    } catch {
      return {
        ...snapshot,
        source: "TARIFF_DEFAULT",
        planChangeAddendum: null,
      };
    }
  }

  const resolved = await resolvePermanenceConfigForCustomer(cancellation.customerId, tx);
  return {
    permanenceMonths: resolved.permanenceMonths,
    installCostUsd: resolved.installCostUsd,
    tvMonthlyUsd: resolved.tvMonthlyUsd,
    source: resolved.source,
    planChangeAddendum: resolved.planChangeAddendum,
  };
}

export function permanenceConfigLabel(source: ResolvedPermanenceTariff["source"]): string {
  return source === "PLAN_CHANGE" ? "Plan contractual firmado" : "Tarifa base del sistema";
}
