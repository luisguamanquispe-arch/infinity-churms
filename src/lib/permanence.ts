import { differenceInMonths } from "date-fns";
import type { ServiceTechnology } from "@prisma/client";
import {
  assertValidInstallCostUsd,
  assertValidPermanenceMonths,
  PermanenceConfigError,
} from "@/lib/permanence-config";

export const PERMANENCE_WARNING_INCOMPLETE =
  "No es posible calcular correctamente la permanencia de fibra porque falta la fecha de migración/instalación de fibra.";

export const PERMANENCE_AUDIT_REASON =
  "Cobro de instalación de fibra por incumplimiento del período mínimo de permanencia.";

export interface CustomerTechnologyInput {
  serviceStartDate: Date | string;
  originTechnology: ServiceTechnology | string;
  currentTechnology: ServiceTechnology | string;
  fiberInstallDate?: Date | string | null;
  fiberMigrationDate?: Date | string | null;
  migrationReviewRequired?: boolean;
  /** Permanencia contractual vigente (p. ej. tras cambio de plan firmado). */
  contractPermanenceStart?: Date | string | null;
  contractPermanenceEnd?: Date | string | null;
}

export interface PermanenceConfig {
  permanenceMonths: number;
  installCostUsd: number;
}

export interface PermanenceSummary {
  customerTypeLabel: string;
  originTechnology: ServiceTechnology;
  currentTechnology: ServiceTechnology;
  currentTechnologyLabel: string;
  originalInstallDate: string;
  fiberMigrationDate: string | null;
  fiberInstallDate: string | null;
  permanenceStartDate: string | null;
  contractPermanenceEnd: string | null;
  planChangeAddendum: string | null;
  requestDate: string;
  monthsInFiber: number;
  monthsRemaining: number;
  customerSeniorityMonths: number;
  minContractMonths: number;
  fiberInstallValue: number;
  permanenceMet: boolean;
  fiberInstallPending: boolean;
  installAmount: number;
  monthlyPermanenceRate: number;
  canCalculate: boolean;
  permanenceStatusLabel: string;
  fiberInstallStatusLabel: string;
  warning: string | null;
  auditReason: string | null;
}

export function technologyLabel(tech: ServiceTechnology | string): string {
  if (tech === "FIBRA") return "Fibra Óptica";
  if (tech === "RADIOENLACE") return "Radioenlace";
  return String(tech);
}

export function getCustomerTypeLabel(customer: CustomerTechnologyInput): string {
  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;
  if (origin === "FIBRA" && current === "FIBRA") return "Cliente original de Fibra";
  if (origin === "RADIOENLACE" && (current === "FIBRA" || customer.fiberMigrationDate)) {
    return "Cliente migrado de Radioenlace a Fibra";
  }
  if (origin === "RADIOENLACE" && current === "RADIOENLACE") {
    return "Cliente de Radioenlace";
  }
  return "Cliente con cambio tecnológico";
}

/** Cliente radio→fibra con fecha de migración registrada (aunque currentTechnology no esté actualizado). */
export function isMigratedRadioToFiber(customer: CustomerTechnologyInput): boolean {
  const origin = customer.originTechnology as ServiceTechnology;
  return origin === "RADIOENLACE" && !!customer.fiberMigrationDate;
}

export function resolvePermanenceStartDate(
  customer: CustomerTechnologyInput
): Date | null {
  if (customer.contractPermanenceStart) {
    return new Date(customer.contractPermanenceStart);
  }

  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;

  if (isMigratedRadioToFiber(customer)) {
    return new Date(customer.fiberMigrationDate!);
  }

  if (current === "FIBRA") {
    if (origin === "FIBRA") {
      if (customer.fiberInstallDate) return new Date(customer.fiberInstallDate);
      return new Date(customer.serviceStartDate);
    }
    if (origin === "RADIOENLACE") {
      if (!customer.fiberMigrationDate) return null;
      return new Date(customer.fiberMigrationDate);
    }
  }

  return new Date(customer.serviceStartDate);
}

export function validatePermanenceForCancellation(
  customer: CustomerTechnologyInput
): { ok: boolean; warning: string | null } {
  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;

  if (customer.migrationReviewRequired) {
    const migratedWithDate =
      origin === "RADIOENLACE" && customer.fiberMigrationDate;
    if (!migratedWithDate) {
      return {
        ok: false,
        warning:
          "Cliente marcado para revisión: complete la fecha de migración a fibra antes de registrar la baja.",
      };
    }
  }

  if (origin === "RADIOENLACE" && current === "FIBRA" && !customer.fiberMigrationDate) {
    return { ok: false, warning: PERMANENCE_WARNING_INCOMPLETE };
  }

  if (resolvePermanenceStartDate(customer) === null) {
    return { ok: false, warning: PERMANENCE_WARNING_INCOMPLETE };
  }

  return { ok: true, warning: null };
}

/** Calcula meses cumplidos, meses restantes y cobro de instalación desde fechas concretas. */
export function calculatePermanenceFromStartDate(
  permanenceStartDate: Date,
  requestDate: Date,
  config: PermanenceConfig
) {
  const permanenceMonths = assertValidPermanenceMonths(config.permanenceMonths);
  const installCostUsd = assertValidInstallCostUsd(config.installCostUsd);

  const monthsInFiber = Math.max(0, differenceInMonths(requestDate, permanenceStartDate));
  const permanenceMet = monthsInFiber >= permanenceMonths;
  const monthsRemaining = Math.max(0, permanenceMonths - monthsInFiber);
  const monthlyPermanenceRate = installCostUsd / permanenceMonths;
  const installAmount = permanenceMet
    ? 0
    : Math.round(monthsRemaining * monthlyPermanenceRate * 100) / 100;

  if (!Number.isFinite(installAmount)) {
    throw new PermanenceConfigError("El cálculo de permanencia produjo un valor inválido.");
  }

  return {
    monthsInFiber,
    monthsRemaining,
    permanenceMet,
    fiberInstallPending: !permanenceMet,
    installAmount,
    monthlyPermanenceRate,
  };
}

function buildInvalidConfigSummary(
  customer: CustomerTechnologyInput,
  requestDate: Date,
  extras: { planChangeAddendum?: string | null } | undefined,
  warning: string
): PermanenceSummary {
  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;
  const originalInstallDate = new Date(customer.serviceStartDate);
  const customerSeniorityMonths = Math.max(
    0,
    differenceInMonths(requestDate, originalInstallDate)
  );

  return {
    customerTypeLabel: getCustomerTypeLabel(customer),
    originTechnology: origin,
    currentTechnology: current,
    currentTechnologyLabel: technologyLabel(current),
    originalInstallDate: originalInstallDate.toISOString(),
    fiberMigrationDate: customer.fiberMigrationDate
      ? new Date(customer.fiberMigrationDate).toISOString()
      : null,
    fiberInstallDate: null,
    permanenceStartDate: null,
    contractPermanenceEnd: customer.contractPermanenceEnd
      ? new Date(customer.contractPermanenceEnd).toISOString()
      : null,
    planChangeAddendum: extras?.planChangeAddendum ?? null,
    requestDate: requestDate.toISOString(),
    monthsInFiber: 0,
    monthsRemaining: 0,
    customerSeniorityMonths,
    minContractMonths: 0,
    fiberInstallValue: 0,
    permanenceMet: false,
    fiberInstallPending: false,
    installAmount: 0,
    monthlyPermanenceRate: 0,
    canCalculate: false,
    permanenceStatusLabel: "REVISIÓN REQUERIDA",
    fiberInstallStatusLabel: "NO CALCULADO",
    warning,
    auditReason: null,
  };
}

export function buildPermanenceSummary(
  customer: CustomerTechnologyInput,
  requestDate: Date,
  config: PermanenceConfig,
  extras?: { planChangeAddendum?: string | null }
): PermanenceSummary {
  let validatedMonths: number;
  let validatedInstall: number;
  try {
    validatedMonths = assertValidPermanenceMonths(config.permanenceMonths);
    validatedInstall = assertValidInstallCostUsd(config.installCostUsd);
  } catch (error) {
    if (error instanceof PermanenceConfigError) {
      return buildInvalidConfigSummary(customer, requestDate, extras, error.message);
    }
    throw error;
  }

  const validatedConfig: PermanenceConfig = {
    permanenceMonths: validatedMonths,
    installCostUsd: validatedInstall,
  };

  const validation = validatePermanenceForCancellation(customer);
  const permanenceStart = resolvePermanenceStartDate(customer);
  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;
  const originalInstallDate = new Date(customer.serviceStartDate);
  const fiberMigrationDate = customer.fiberMigrationDate
    ? new Date(customer.fiberMigrationDate)
    : null;
  const fiberInstallDate =
    customer.fiberInstallDate != null
      ? new Date(customer.fiberInstallDate)
      : origin === "FIBRA"
        ? originalInstallDate
        : fiberMigrationDate;

  const customerSeniorityMonths = Math.max(
    0,
    differenceInMonths(requestDate, originalInstallDate)
  );

  if (!validation.ok || !permanenceStart) {
    return {
      customerTypeLabel: getCustomerTypeLabel(customer),
      originTechnology: origin,
      currentTechnology: current,
      currentTechnologyLabel: technologyLabel(current),
      originalInstallDate: originalInstallDate.toISOString(),
      fiberMigrationDate: fiberMigrationDate?.toISOString() ?? null,
      fiberInstallDate: fiberInstallDate?.toISOString() ?? null,
      permanenceStartDate: null,
      contractPermanenceEnd: customer.contractPermanenceEnd
        ? new Date(customer.contractPermanenceEnd).toISOString()
        : null,
      planChangeAddendum: extras?.planChangeAddendum ?? null,
      requestDate: requestDate.toISOString(),
      monthsInFiber: 0,
      monthsRemaining: validatedMonths,
      customerSeniorityMonths,
      minContractMonths: validatedMonths,
      fiberInstallValue: validatedInstall,
      permanenceMet: false,
      fiberInstallPending: false,
      installAmount: 0,
      monthlyPermanenceRate: validatedInstall / validatedMonths,
      canCalculate: false,
      permanenceStatusLabel: "REVISIÓN REQUERIDA",
      fiberInstallStatusLabel: "NO CALCULADO",
      warning: validation.warning,
      auditReason: null,
    };
  }

  const charge = calculatePermanenceFromStartDate(permanenceStart, requestDate, validatedConfig);

  return {
    customerTypeLabel: getCustomerTypeLabel(customer),
    originTechnology: origin,
    currentTechnology: current,
    currentTechnologyLabel: technologyLabel(current),
    originalInstallDate: originalInstallDate.toISOString(),
    fiberMigrationDate: fiberMigrationDate?.toISOString() ?? null,
    fiberInstallDate: fiberInstallDate?.toISOString() ?? null,
    permanenceStartDate: permanenceStart.toISOString(),
    contractPermanenceEnd: customer.contractPermanenceEnd
      ? new Date(customer.contractPermanenceEnd).toISOString()
      : null,
    planChangeAddendum: extras?.planChangeAddendum ?? null,
    requestDate: requestDate.toISOString(),
    monthsInFiber: charge.monthsInFiber,
    monthsRemaining: charge.monthsRemaining,
    customerSeniorityMonths,
    minContractMonths: validatedMonths,
    fiberInstallValue: validatedInstall,
    permanenceMet: charge.permanenceMet,
    fiberInstallPending: charge.fiberInstallPending,
    installAmount: charge.installAmount,
    monthlyPermanenceRate: charge.monthlyPermanenceRate,
    canCalculate: true,
    permanenceStatusLabel: charge.permanenceMet ? "PERMANENCIA CUMPLIDA" : "NO CUMPLE PERMANENCIA",
    fiberInstallStatusLabel: charge.fiberInstallPending ? "PENDIENTE" : "NO PENDIENTE",
    warning: null,
    auditReason: charge.fiberInstallPending ? PERMANENCE_AUDIT_REASON : null,
  };
}

export function serializePermanenceSummary(summary: PermanenceSummary) {
  return {
    ...summary,
    originalInstallDate: summary.originalInstallDate,
    fiberMigrationDate: summary.fiberMigrationDate,
    fiberInstallDate: summary.fiberInstallDate,
    permanenceStartDate: summary.permanenceStartDate,
    requestDate: summary.requestDate,
  };
}
