import { prisma } from "@/lib/prisma";

export async function audit(params: {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
}) {
  try {
    await prisma.auditLog.create({ data: params });
  } catch {
    /* demo sin DB */
  }
}

export function docNumber(prefix: string) {
  const d = new Date();
  return `${prefix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
