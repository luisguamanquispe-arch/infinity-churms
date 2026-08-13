import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("plan-changes:view-identity");
    const { id } = await params;
    const ip = getClientIp(_req);

    const pc = await prisma.planChange.findUnique({
      where: { id },
      select: {
        identitySelfieData: true,
        identitySelfieId: true,
        identitySelfieAt: true,
        customer: { select: { name: true } },
      },
    });
    if (!pc?.identitySelfieData) {
      return NextResponse.json({ error: "Sin evidencia de identidad" }, { status: 404 });
    }

    await audit({
      userId: session.userId,
      action: "VIEW_SELFIE",
      entity: "PlanChange",
      entityId: id,
      detail: `Acceso selfie · ${pc.identitySelfieId ?? "—"}`,
      ipAddress: ip,
    });

    return NextResponse.json({
      identitySelfieId: pc.identitySelfieId,
      identitySelfieAt: pc.identitySelfieAt,
      identitySelfieData: pc.identitySelfieData,
      customerName: pc.customer.name,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
