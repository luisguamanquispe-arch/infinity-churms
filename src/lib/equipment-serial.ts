import type { Prisma } from "@prisma/client";
import { toUpperInput } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * Regla de negocio (AUD-027): serial de equipo es case-insensitive.
 * El sistema normaliza a MAYÚSCULAS (misma regla que customer-form / toUpperInput).
 * Unicidad global en CustomerEquipment para serial no vacío.
 */
export function normalizeEquipmentSerial(serial?: string | null): string | null {
  if (serial == null) return null;
  const trimmed = serial.trim();
  if (!trimmed) return null;
  return toUpperInput(trimmed);
}

export class EquipmentSerialConflictError extends Error {
  readonly code = "EQUIPMENT_SERIAL_DUPLICATE" as const;

  constructor(message = "EQUIPMENT_SERIAL_DUPLICATE") {
    super(message);
    this.name = "EquipmentSerialConflictError";
  }
}

export function isPrismaUniqueViolation(error: unknown, fieldHint?: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if ((error as { code: string }).code !== "P2002") return false;
  if (!fieldHint) return true;
  const target = (error as { meta?: { target?: string[] } }).meta?.target;
  return Array.isArray(target) && target.some((t) => t.toLowerCase().includes(fieldHint.toLowerCase()));
}

type EquipmentClient = Prisma.TransactionClient | typeof prisma;

export async function assertUniqueEquipmentSerial(
  serial: string | null | undefined,
  excludeEquipmentId?: string,
  client: EquipmentClient = prisma
): Promise<void> {
  const normalized = normalizeEquipmentSerial(serial);
  if (!normalized) return;

  const existing = await client.customerEquipment.findFirst({
    where: {
      serial: normalized,
      ...(excludeEquipmentId ? { id: { not: excludeEquipmentId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new EquipmentSerialConflictError();
}

/** Rechaza duplicados dentro del mismo payload (create/update batch). */
export function assertNoDuplicateSerialsInPayload(serials: (string | null | undefined)[]): void {
  const seen = new Set<string>();
  for (const raw of serials) {
    const normalized = normalizeEquipmentSerial(raw);
    if (!normalized) continue;
    if (seen.has(normalized)) throw new EquipmentSerialConflictError();
    seen.add(normalized);
  }
}

export function isEquipmentSerialConflict(error: unknown): boolean {
  return error instanceof EquipmentSerialConflictError || isPrismaUniqueViolation(error, "serial");
}

export function mapEquipmentSerialWriteError(error: unknown): never {
  if (error instanceof EquipmentSerialConflictError) throw error;
  if (isPrismaUniqueViolation(error, "serial")) {
    throw new EquipmentSerialConflictError();
  }
  throw error;
}
