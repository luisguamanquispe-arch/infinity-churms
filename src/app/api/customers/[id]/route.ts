import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.pendingBalance !== undefined) data.pendingBalance = body.pendingBalance;
    if (body.planName !== undefined) data.planName = body.planName;
    if (body.status !== undefined) data.status = body.status;
    if (body.hasTvStreaming !== undefined) {
      data.hasTvStreaming = body.hasTvStreaming;
      if (!body.hasTvStreaming) data.tvStreamingSince = null;
    }
    if (body.tvStreamingSince !== undefined && body.hasTvStreaming) {
      data.tvStreamingSince = new Date(body.tvStreamingSince);
    }

    const customer = await prisma.customer.update({
      where: { id },
      data,
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      detail: body.pendingBalance !== undefined ? `Saldo: ${body.pendingBalance}` : undefined,
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
