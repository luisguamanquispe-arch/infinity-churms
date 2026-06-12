export const APP_NAME = "Gestión de Bajas — Infinity";

export const COLORS = {
  navy: "#0B1F3A",
  brand: "#00A9B5",
} as const;

export const STATUS_LABELS: Record<string, string> = {
  SOLICITADA: "Solicitada",
  EN_REVISION: "En revisión",
  PENDIENTE_DE_PAGO: "Pendiente de pago",
  PAGADA: "Pagada",
  EQUIPOS_RECUPERADOS: "Equipos recuperados",
  BAJA_COMPLETADA: "Baja completada",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  COBRANZAS: "Cobranzas",
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
};

export const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Depósito"] as const;

export const EQUIPMENT_TYPES = ["ONU", "ROUTER", "STB", "ANTENA", "OTRO"] as const;

export const EQUIPMENT_CONDITIONS = [
  { value: "BUENO", label: "Bueno" },
  { value: "DANADO", label: "Dañado" },
  { value: "NO_ENTREGADO", label: "No entregado" },
] as const;
