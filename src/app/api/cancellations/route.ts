import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  customerHasCancellation,
  initEquipmentChecklist,
  listCancellations,
  recalculateCancellation,
} from "@/lib/services/cancellations";
import type { CancellationReason } from "@prisma/client";

const VALID_REASONS: CancellationReason[] = [
  "FALLAS_CONTINUAS",
  "INCUMPLIMIENTO_CONTRATO",
  "MUDANZA",
  "PROBLEMAS_ATENCION",
  "MEJOR_OFERTA",
  "DECISION_VOLUNTARIA",
];

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
    const { customerId, notes, reason } = await request.json();

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Motivo de baja obligatorio" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (customer.hasTvStreaming && !customer.tvStreamingSince) {
      return NextResponse.json(
        { error: "Cliente con TV Streams debe tener fecha de inicio del servicio TV" },
        { status: 400 }
      );
    }

    if (await customerHasCancellation(customerId)) {
      return NextResponse.json(
        { error: "Este cliente ya tiene una baja registrada. No se puede crear otra." },
        { status: 409 }
      );
    }

    const cancellation = await prisma.cancellation.create({
      data: {
        customerId,
        reason,
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
      detail: `Baja ${customer.contract}`,
    });

    return NextResponse.json({ id: cancellation.id });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}
