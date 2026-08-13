import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const logs = await prisma.auditLog.findMany({
      where: { entity: "PlanChange", entityId: id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
