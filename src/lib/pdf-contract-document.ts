import type { Customer, PlanChange } from "@prisma/client";
import { generateAdendumPdf } from "@/lib/pdf-adendum";
import { generateRenewalPdf } from "@/lib/pdf-renewal";

export function generateContractDocumentPdf(params: {
  planChange: PlanChange;
  customer: Customer;
  addendumDeclarationText?: string | null;
  renewalDeclarationText?: string | null;
  processedByName?: string;
  digitallySigned?: boolean;
}) {
  const { planChange } = params;
  const digitallySigned = params.digitallySigned ?? planChange.signedDigitally;

  if (planChange.operationType === "CAMBIO_PLAN") {
    return generateAdendumPdf({
      planChange: params.planChange,
      customer: params.customer,
      declarationText: params.addendumDeclarationText,
      processedByName: params.processedByName,
      digitallySigned,
    });
  }

  return generateRenewalPdf({
    planChange: params.planChange,
    customer: params.customer,
    declarationText: params.renewalDeclarationText,
    processedByName: params.processedByName,
    digitallySigned,
  });
}

export function contractDocumentTitle(operationType: string): string {
  if (operationType === "CAMBIO_PLAN") return "Adendum al contrato";
  if (operationType === "RENOVACION_CAMBIO_PLAN") return "Renovación con cambio de plan";
  return "Renovación de contrato";
}
