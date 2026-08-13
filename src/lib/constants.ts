export const APP_NAME = "Gestión de Bajas — Infinity";

export const COLORS = {
  navy: "#0B1F3A",
  brand: "#00A9B5",
} as const;

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  CAMBIO_PLAN: "Cambio de plan",
  RENOVACION: "Renovación de contrato",
  RENOVACION_CAMBIO_PLAN: "Renovación + cambio de plan",
};

export const PLAN_CHANGE_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_DE_FIRMA: "Pendiente de firma",
  FIRMADO: "Firmado",
  ACTIVO: "Activo",
  CANCELADO: "Cancelado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
};

export const PLAN_CHANGE_STATUSES = [
  "BORRADOR",
  "PENDIENTE_DE_FIRMA",
  "FIRMADO",
  "ACTIVO",
  "CANCELADO",
  "RECHAZADO",
  "ANULADO",
] as const;

export const SIGNATURE_LINK_STATUS_LABELS: Record<string, string> = {
  GENERADO: "Pendiente de envío",
  ENVIADO: "Enviado",
  ABIERTO: "Cliente abrió enlace",
  EN_PROCESO: "En proceso",
  FIRMADO: "Firmado",
  COMPLETADO: "Completado",
  EXPIRADO: "Expirado",
  CANCELADO: "Cancelado",
};

export const DEFAULT_ADDENDUM_DECLARATION =
  "El cliente solicita y acepta voluntariamente la modificación de su plan de servicio. " +
  "A partir de la aceptación y firma del presente adendum, se establece un nuevo período de permanencia " +
  "asociado al nuevo plan contratado, manteniéndose vigentes las demás condiciones del contrato original " +
  "que no hayan sido modificadas expresamente por este documento.";

export const DEFAULT_RENEWAL_DECLARATION =
  "El cliente declara que desea continuar utilizando el servicio y acepta las condiciones correspondientes " +
  "al nuevo período contractual de permanencia. Las demás condiciones del contrato original que no sean " +
  "modificadas expresamente deben mantenerse vigentes.";

export const STATUS_LABELS: Record<string, string> = {
  SOLICITADA: "Solicitada",
  PRELIQUIDACION_EN_PROCESO: "Preliquidación en proceso",
  PRELIQUIDACION_GENERADA: "Preliquidación generada",
  PRELIQUIDACION_ENVIADA: "Enviada al cliente",
  PRELIQUIDACION_PENDIENTE: "Pendiente de aprobación",
  PRELIQUIDACION_RECHAZADA: "Preliquidación rechazada",
  PRELIQUIDACION_APROBADA: "Preliquidación aprobada",
  BAJA_AUTORIZADA: "Baja autorizada",
  EN_REVISION: "En revisión",
  PENDIENTE_DE_PAGO: "Pendiente de pago",
  PAGADA: "Pagada",
  EN_DEVOLUCION_EQUIPOS: "En devolución de equipos",
  LIQUIDACION_FINAL: "Liquidación final",
  EQUIPOS_RECUPERADOS: "Equipos recuperados",
  BAJA_COMPLETADA: "Baja completada",
  CANCELADA: "Cancelada",
};

export const PRELIQUIDACION_STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador",
  GENERADA: "Generada",
  ENVIADA: "Enviada",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  SUPERSEDED: "Reemplazada",
};

export const CANCELLATION_STATUSES = [
  "SOLICITADA",
  "PRELIQUIDACION_EN_PROCESO",
  "PRELIQUIDACION_GENERADA",
  "PRELIQUIDACION_ENVIADA",
  "PRELIQUIDACION_PENDIENTE",
  "PRELIQUIDACION_RECHAZADA",
  "PRELIQUIDACION_APROBADA",
  "BAJA_AUTORIZADA",
  "EN_REVISION",
  "PENDIENTE_DE_PAGO",
  "PAGADA",
  "EN_DEVOLUCION_EQUIPOS",
  "LIQUIDACION_FINAL",
  "EQUIPOS_RECUPERADOS",
  "BAJA_COMPLETADA",
  "CANCELADA",
] as const;

export const SERVICE_TECHNOLOGIES = [
  { value: "FIBRA", label: "Fibra Óptica" },
  { value: "RADIOENLACE", label: "Radioenlace" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  COBRANZAS: "Cobranzas",
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
};

export const CANCELLATION_REASONS = [
  { value: "FALLAS_CONTINUAS", label: "Indisponibilidad o fallas continuas" },
  { value: "INCUMPLIMIENTO_CONTRATO", label: "Incumplimiento del contrato" },
  { value: "MUDANZA", label: "Mudanza o cambio de domicilio" },
  { value: "PROBLEMAS_ATENCION", label: "Problemas de atención al cliente" },
  { value: "MEJOR_OFERTA", label: "Mejor oferta comercial" },
  { value: "DECISION_VOLUNTARIA", label: "Decisión voluntaria" },
] as const;

export const REASON_LABELS: Record<string, string> = Object.fromEntries(
  CANCELLATION_REASONS.map((r) => [r.value, r.label])
);

export const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Depósito"] as const;

export const EQUIPMENT_TYPES = ["ONU", "ROUTER", "STB", "ANTENA", "OTRO"] as const;

export const CUSTOMER_ZONES = [
  "PASA",
  "UNAMUNCHO",
  "CHIQUICHA",
  "JB.VELA",
  "IZAMBA",
  "CENTRO",
  "SAN FERNANDO",
  "AMBATILLO",
  "QUISAPINCHA",
  "HUACHI",
  "TOTORAS",
  "SANTA ROSA",
  "CUNCHIBAMBA",
  "CASHAPAMBA",
  "LA PENINSULA",
  "TRES JUANES",
  "LA CONCEPCION",
  "MARTINEZ",
  "ATAHUALPA",
  "PINLLO",
  "SALASACA",
  "RUMICHACA",
  "NITON",
  "TECHO PROPIO",
  "PICAIHUA",
  "HUACHI LORETO",
] as const;

export type CustomerZone = (typeof CUSTOMER_ZONES)[number];

export const CUSTOMER_STATUSES = ["ACTIVO", "SUSPENDIDO", "INACTIVO", "CANCELADO"] as const;

export function toUpperInput(value: string): string {
  return value.toUpperCase();
}

export const INSTALLATION_PRORATION_LABEL = "Prorrateo por instalación de servicio";

export function installationProrationDetail(monthsCompleted: number) {
  return `${INSTALLATION_PRORATION_LABEL} (${monthsCompleted} meses cumplidos)`;
}

export const STREAMS_SUPPORT_LABEL = "Soporte de Streams";
export const HAS_STREAMS_SUPPORT_LABEL = "Tiene soporte de Streams";
export const STREAMS_SUPPORT_SINCE_LABEL = "Soporte de Streams desde";

export const WITHDRAWAL_REQUEST_PDF_LABEL = "Solicitud de retiro (PDF)";

export const EQUIPMENT_CONDITIONS = [
  { value: "BUENO", label: "Bueno" },
  { value: "DANADO", label: "Dañado" },
  { value: "NO_ENTREGADO", label: "No entregado" },
] as const;

export const EQUIPMENT_CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  EQUIPMENT_CONDITIONS.map((c) => [c.value, c.label])
);

export function getEquipmentReportStatus(delivered: boolean, condition: string | null) {
  if (!delivered || condition === "NO_ENTREGADO") return "No entregado";
  if (condition === "DANADO") return "Entregado (dañado)";
  return "Entregado";
}

export const SUSPENSION_POLICIES = [
  "Las solicitudes de cancelación de servicio se receptan únicamente hasta el día 15 de cada mes.",
  "El cliente debe enviar fotografía de los equipos prestados (ONU, router, decodificador u otros) al momento de solicitar la baja.",
  "Debe cancelar todos los valores pendientes previo a la entrega de equipos prestados en oficina.",
  "La entrega física de equipos se realiza únicamente en oficina, una vez verificado el pago de la pre-liquidación.",
] as const;

export const COLLECTION_MANAGEMENT_TYPES = [
  { value: "LLAMADA", label: "Llamada" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "VISITA", label: "Visita" },
  { value: "CORREO", label: "Correo" },
  { value: "SMS", label: "Mensaje SMS" },
  { value: "OTRO", label: "Otro" },
] as const;

export const COLLECTION_RESULTS = [
  { value: "CONTESTO", label: "Contestó" },
  { value: "NO_CONTESTO", label: "No contestó" },
  { value: "PROMESA_DE_PAGO", label: "Promesa de Pago" },
  { value: "PAGO", label: "Pagó" },
  { value: "CONVENIO", label: "Convenio" },
  { value: "SE_NIEGA_A_PAGAR", label: "Se niega a pagar" },
  { value: "CLIENTE_NO_UBICADO", label: "Cliente no ubicado" },
] as const;

export const COLLECTION_RESULT_LABELS: Record<string, string> = Object.fromEntries(
  COLLECTION_RESULTS.map((r) => [r.value, r.label])
);

export const COLLECTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  COLLECTION_MANAGEMENT_TYPES.map((t) => [t.value, t.label])
);

export const COLLECTION_CHARGE_TYPES = [
  { value: "CONSUMO_MENSUAL", label: "Meses de consumo" },
  { value: "CAMBIO_DOMICILIO", label: "Cambio de domicilio" },
  { value: "EXCEDENTE_FIBRA", label: "Excedente de fibra" },
  { value: "INSTALACION", label: "Instalación" },
  { value: "STREAMS", label: "Soporte Streams" },
  { value: "RECONEXION", label: "Reconexión" },
  { value: "OTRO", label: "Otro concepto" },
] as const;

export type CollectionChargeTypeValue = (typeof COLLECTION_CHARGE_TYPES)[number]["value"];

export const COLLECTION_CHARGE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  COLLECTION_CHARGE_TYPES.map((t) => [t.value, t.label])
);
