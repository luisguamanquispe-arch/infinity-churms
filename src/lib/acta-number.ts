import { prisma } from "@/lib/prisma";

export async function nextActaNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `acta-${year}`;

  const seq = await prisma.$transaction(async (tx) => {
    const row = await tx.documentSequence.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    });
    return row.value;
  });

  return `ACTA-${year}-${String(seq).padStart(6, "0")}`;
}
