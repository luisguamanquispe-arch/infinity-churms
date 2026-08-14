import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const version = process.env.RENDER_GIT_COMMIT ?? "dev";
  try {
    await prisma.$queryRaw`SELECT 1`;
    let collectionsReady = false;
    let preliquidacionReady = false;
    let documentSequenceReady = false;
    let orphanPreliquidacionCount = 0;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "CollectionAction" LIMIT 1`;
      collectionsReady = true;
    } catch {
      collectionsReady = false;
    }
    try {
      await prisma.$queryRaw`SELECT 1 FROM "CancellationPreliquidacion" LIMIT 1`;
      preliquidacionReady = true;
    } catch {
      preliquidacionReady = false;
    }
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DocumentSequence" LIMIT 1`;
      documentSequenceReady = true;
    } catch {
      documentSequenceReady = false;
    }
    if (preliquidacionReady) {
      const orphan = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Cancellation" c
        WHERE c."activePreliquidacionId" IS NULL
          AND c."status" IN (
            'SOLICITADA', 'PRELIQUIDACION_EN_PROCESO', 'PRELIQUIDACION_GENERADA',
            'PRELIQUIDACION_ENVIADA', 'PRELIQUIDACION_PENDIENTE', 'PRELIQUIDACION_RECHAZADA', 'EN_REVISION'
          )
          AND NOT EXISTS (
            SELECT 1 FROM "CancellationPreliquidacion" p WHERE p."cancellationId" = c."id"
          )
      `;
      orphanPreliquidacionCount = Number(orphan[0]?.count ?? 0);
    }
    return NextResponse.json({
      database: "connected",
      version,
      collectionsReady,
      preliquidacionReady,
      documentSequenceReady,
      orphanPreliquidacionCount,
    });
  } catch {
    return NextResponse.json(
      { database: "disconnected", ok: false, version, collectionsReady: false },
      { status: 503 }
    );
  }
}
