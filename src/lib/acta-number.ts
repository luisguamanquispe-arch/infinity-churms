import { prisma } from "@/lib/prisma";

async function nextSequence(key: string): Promise<number> {
  const row = await prisma.$transaction(async (tx) => {
    return tx.documentSequence.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    });
  });
  return row.value;
}

export async function nextActaNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`acta-${year}`);
  return `ACTA-${year}-${String(seq).padStart(6, "0")}`;
}

export async function nextActaPhysicalCode(): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`acta-physical-${year}`);
  return `IDF-${year}-${String(seq).padStart(6, "0")}`;
}

export async function nextPreliquidacionNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`preliq-${year}`);
  return `PRE-${year}-${String(seq).padStart(6, "0")}`;
}
