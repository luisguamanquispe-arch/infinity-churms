import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  initEquipmentChecklist,
  listCancellations,
  recalculateCancellation,
} from "@/lib/services/cancellations";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const sp = request.nextUrl.searchParams;
    const rows = await listCancellations({
      status: sp.get("status") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
    });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("cancellations:create");
    const { customerId, notes } = await request.json();

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const cancellation = await prisma.cancellation.create({
      data: {
        customerId,
        notes,
        createdById: session.userId,
        status: "SOLICITADA",
      },
    });

    await initEquipmentChecklist(cancellation.id, customerId);

    await prisma.cancellation.update({
      where: { id: cancellation.id },
      data: { status: "EN_REVISION" },
    });

    await recalculateCancellation(cancellation.id);

    await prisma.cancellation.update({
      where: { id: cancellation.id },
      data: { status: "PENDIENTE_DE_PAGO" },
    });

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "Cancellation",
      entityId: cancellation.id,
      detail: `Baja ${customer.code}`,
    });

    return NextResponse.json({ id: cancellation.id });
  } catch {
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}
