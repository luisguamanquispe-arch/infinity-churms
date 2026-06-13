import { CUSTOMER_ZONES, toUpperInput } from "@/lib/constants";
import { normalizeCedula, validateEcuadorianCedula } from "@/lib/cedula";

export function formatCustomerPayload(body: {
  contract?: string;
  name?: string;
  cedula?: string;
  address?: string;
  zone?: string;
  planName?: string;
  phone?: string;
  equipment?: { serial?: string; brand?: string; model?: string }[];
}) {
  return {
    contract: toUpperInput(String(body.contract ?? "").trim()),
    name: toUpperInput(String(body.name ?? "").trim()),
    cedula: normalizeCedula(String(body.cedula ?? "")),
    address: toUpperInput(String(body.address ?? "").trim()),
    zone: toUpperInput(String(body.zone ?? "").trim()),
    planName: toUpperInput(String(body.planName ?? "").trim()),
    phone: body.phone ? toUpperInput(String(body.phone).trim()) : null,
    equipment: (body.equipment ?? []).map((eq) => ({
      ...eq,
      serial: eq.serial ? toUpperInput(eq.serial.trim()) : eq.serial,
      brand: eq.brand ? toUpperInput(eq.brand.trim()) : eq.brand,
      model: eq.model ? toUpperInput(eq.model.trim()) : eq.model,
    })),
  };
}

export function validateCustomerInput(data: ReturnType<typeof formatCustomerPayload>) {
  if (!data.contract) return "El contrato es obligatorio";
  if (!data.name) return "El nombre es obligatorio";
  if (!data.address) return "La dirección es obligatoria";
  if (!data.planName) return "El plan es obligatorio";
  if (!data.zone) return "La zona es obligatoria";
  if (!CUSTOMER_ZONES.includes(data.zone as (typeof CUSTOMER_ZONES)[number])) {
    return "Seleccione una zona válida";
  }
  if (!validateEcuadorianCedula(data.cedula)) {
    return "Cédula ecuatoriana inválida. Verifique los 10 dígitos y el dígito verificador";
  }
  return null;
}
