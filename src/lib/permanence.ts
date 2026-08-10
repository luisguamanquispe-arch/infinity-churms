import { differenceInMonths } from "date-fns";
import type { ServiceTechnology } from "@prisma/client";

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
  requestDate: string;
  monthsInFiber: number;
  customerSeniorityMonths: number;
  minContractMonths: number;
  fiberInstallValue: number;
  permanenceMet: boolean;
  fiberInstallPending: boolean;
  installAmount: number;
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
  if (origin === "RADIOENLACE" && current === "FIBRA") {
    return "Cliente migrado de Radioenlace a Fibra";
  }
  if (origin === "RADIOENLACE" && current === "RADIOENLACE") {
    return "Cliente de Radioenlace";
  }
  return "Cliente con cambio tecnológico";
}

export function resolvePermanenceStartDate(
  customer: CustomerTechnologyInput
): Date | null {
  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;

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
  if (customer.migrationReviewRequired) {
    return {
      ok: false,
      warning:
        "Cliente marcado para revisión: complete la fecha de migración a fibra antes de registrar la baja.",
    };
  }

  const origin = customer.originTechnology as ServiceTechnology;
  const current = customer.currentTechnology as ServiceTechnology;

  if (origin === "RADIOENLACE" && current === "FIBRA" && !customer.fiberMigrationDate) {
    return { ok: false, warning: PERMANENCE_WARNING_INCOMPLETE };
  }

  if (resolvePermanenceStartDate(customer) === null) {
    return { ok: false, warning: PERMANENCE_WARNING_INCOMPLETE };
  }

  return { ok: true, warning: null };
}

export function buildPermanenceSummary(
  customer: CustomerTechnologyInput,
  requestDate: Date,
  config: PermanenceConfig
): PermanenceSummary {
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
      requestDate: requestDate.toISOString(),
      monthsInFiber: 0,
      customerSeniorityMonths,
      minContractMonths: config.permanenceMonths,
      fiberInstallValue: config.installCostUsd,
      permanenceMet: false,
      fiberInstallPending: false,
      installAmount: 0,
      canCalculate: false,
      permanenceStatusLabel: "REVISIÓN REQUERIDA",
      fiberInstallStatusLabel: "NO CALCULADO",
      warning: validation.warning,
      auditReason: null,
    };
  }

  const monthsInFiber = Math.max(0, differenceInMonths(requestDate, permanenceStart));
  const permanenceMet = monthsInFiber >= config.permanenceMonths;
  const fiberInstallPending = !permanenceMet;
  const monthsPending = Math.max(0, config.permanenceMonths - monthsInFiber);
  const monthlyPermanence = config.installCostUsd / config.permanenceMonths;
  const installAmount = permanenceMet
    ? 0
    : Math.round(monthsPending * monthlyPermanence * 100) / 100;

  return {
    customerTypeLabel: getCustomerTypeLabel(customer),
    originTechnology: origin,
    currentTechnology: current,
    currentTechnologyLabel: technologyLabel(current),
    originalInstallDate: originalInstallDate.toISOString(),
    fiberMigrationDate: fiberMigrationDate?.toISOString() ?? null,
    fiberInstallDate: fiberInstallDate?.toISOString() ?? null,
    permanenceStartDate: permanenceStart.toISOString(),
    requestDate: requestDate.toISOString(),
    monthsInFiber,
    customerSeniorityMonths,
    minContractMonths: config.permanenceMonths,
    fiberInstallValue: config.installCostUsd,
    permanenceMet,
    fiberInstallPending,
    installAmount,
    canCalculate: true,
    permanenceStatusLabel: permanenceMet ? "PERMANENCIA CUMPLIDA" : "NO CUMPLE PERMANENCIA",
    fiberInstallStatusLabel: fiberInstallPending ? "PENDIENTE" : "NO PENDIENTE",
    warning: null,
    auditReason: fiberInstallPending ? PERMANENCE_AUDIT_REASON : null,
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
