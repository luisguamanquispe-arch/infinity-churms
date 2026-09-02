/**
 * Fechas de negocio (Ecuador, America/Guayaquil, sin DST).
 * Se almacenan como mediodía UTC del calendario indicado para evitar
 * desplazamiento de día al serializar o comparar.
 */
export const BUSINESS_TIMEZONE = "America/Guayaquil";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class BusinessDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessDateError";
  }
}

/** Parsea YYYY-MM-DD como fecha de negocio (sin hora local del browser). */
export function parseBusinessDateOnly(value: string): Date {
  const trimmed = value.trim();
  const m = DATE_ONLY.exec(trimmed);
  if (!m) throw new BusinessDateError(`Fecha inválida: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month ||
    d.getUTCDate() !== day
  ) {
    throw new BusinessDateError(`Fecha inválida: ${value}`);
  }
  return d;
}

/** Acepta YYYY-MM-DD o ISO completo; normaliza a fecha de negocio. */
export function parseBusinessDateInput(value: string): Date {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return parseBusinessDateOnly(trimmed);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new BusinessDateError(`Fecha inválida: ${value}`);
  return parseBusinessDateOnly(parsed.toISOString().slice(0, 10));
}

/** Formato YYYY-MM-DD desde fecha almacenada como business date. */
export function formatBusinessDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fin inclusive del día de negocio para filtros de rango. */
export function endOfBusinessDateOnly(value: string): Date {
  const start = parseBusinessDateOnly(value);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Fecha calendario actual en zona de negocio (America/Guayaquil). */
export function businessDateToday(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date());
  return parseBusinessDateOnly(ymd);
}

/** Normaliza respuesta API (ISO o YYYY-MM-DD) a YYYY-MM-DD para formularios. */
export function formatBusinessDateFromApi(value: string): string {
  return formatBusinessDateOnly(parseBusinessDateInput(value));
}
