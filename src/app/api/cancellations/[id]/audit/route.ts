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
      where: {
        OR: [
          { entity: "Cancellation", entityId: id },
          {
            entity: "CancellationEquipment",
            entityId: {
              in: (
                await prisma.cancellationEquipment.findMany({
                  where: { cancellationId: id },
                  select: { id: true },
                })
              ).map((e) => e.id),
            },
          },
        ],
      },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      logs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        detail: l.detail,
        createdAt: l.createdAt.toISOString(),
        user: l.user
          ? { name: l.user.name, email: l.user.email, role: l.user.role }
          : null,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
