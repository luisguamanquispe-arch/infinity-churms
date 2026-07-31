import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const version = process.env.RENDER_GIT_COMMIT ?? "dev";
  try {
    await prisma.$queryRaw`SELECT 1`;
    let collectionsReady = false;
    try {
      await prisma.$queryRaw`SELECT 1 FROM "CollectionAction" LIMIT 1`;
      collectionsReady = true;
    } catch {
      collectionsReady = false;
    }
    return NextResponse.json({
      database: "connected",
      version,
      collectionsReady,
    });
  } catch {
    return NextResponse.json(
      { database: "disconnected", ok: false, version, collectionsReady: false },
      { status: 503 }
    );
  }
}
