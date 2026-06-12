import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getCancellation, recalculateCancellation } from "@/lib/services/cancellations";
import type { CancellationStatus } from "@prisma/client";

const FLOW: Partial<Record<CancellationStatus, CancellationStatus>> = {
  PAGADA: "EQUIPOS_RECUPERADOS",
  EQUIPOS_RECUPERADOS: "BAJA_COMPLETADA",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "add_charge") {
      const session = await requirePermission("cancellations:charges");
      await prisma.cancellationCharge.create({
        data: { cancellationId: id, concept: body.concept, amount: body.amount },
      });
      await recalculateCancellation(id);
      await audit({ userId: session.userId, action: "ADD_CHARGE", entity: "Cancellation", entityId: id });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "advance_status") {
      const current = await prisma.cancellation.findUnique({ where: { id } });
      if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

      const next = FLOW[current.status];
      if (!next) {
        return NextResponse.json({ error: "Transición no permitida" }, { status: 400 });
      }

      const perm =
        next === "EQUIPOS_RECUPERADOS"
          ? "cancellations:advance_equipment"
          : "cancellations:close";
      const session = await requirePermission(perm);

      if (next === "EQUIPOS_RECUPERADOS") {
        const pending = await prisma.cancellationEquipment.count({
          where: { cancellationId: id, delivered: false },
        });
        if (pending > 0) {
          return NextResponse.json({ error: "Registre todos los equipos primero" }, { status: 400 });
        }
      }

      if (next === "BAJA_COMPLETADA") {
        const invoice = current.invoiceNumber ?? (await prisma.cancellationPayment.findFirst({ where: { cancellationId: id } }))?.invoiceNumber;
        if (!invoice) {
          return NextResponse.json({ error: "Factura obligatoria para cerrar la baja" }, { status: 400 });
        }
      }

      const updated = await prisma.cancellation.update({
        where: { id },
        data: {
          status: next,
          ...(next === "BAJA_COMPLETADA" ? { closeDate: new Date() } : {}),
        },
      });

      await audit({ userId: session.userId, action: "STATUS", entity: "Cancellation", entityId: id, detail: next });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
