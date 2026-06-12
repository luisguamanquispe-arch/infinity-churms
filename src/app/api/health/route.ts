import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ database: "connected" });
  } catch {
    return NextResponse.json({ database: "disconnected", ok: false }, { status: 503 });
  }
}
