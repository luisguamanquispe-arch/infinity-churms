import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { assertPreliquidacionApproved } from "@/lib/preliquidacion-guards";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:payment");
    const { id } = await params;

    try {
      await assertPreliquidacionApproved(id);
    } catch (e) {
      if (e instanceof Error && e.message === "PRELIQUIDACION_NOT_APPROVED") {
        return NextResponse.json(
          { error: "La preliquidación debe estar aprobada por el cliente antes de registrar el pago." },
          { status: 403 }
        );
      }
      if (e instanceof Error && e.message === "PRELIQUIDACION_REQUIRED") {
        return NextResponse.json(
          { error: "Debe generar y obtener la aprobación de la preliquidación antes del pago." },
          { status: 403 }
        );
      }
      throw e;
    }

    const cancellation = await prisma.cancellation.findUnique({ where: { id } });
    if (!cancellation) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!["BAJA_AUTORIZADA", "PENDIENTE_DE_PAGO"].includes(cancellation.status)) {
      return NextResponse.json(
        { error: "La baja no está en estado válido para registrar pago." },
        { status: 400 }
      );
    }

    const { paymentDate, method, invoiceNumber, amountPaid, notes } = await request.json();

    if (!invoiceNumber?.trim()) {
      return NextResponse.json({ error: "Número de factura obligatorio" }, { status: 400 });
    }

    await prisma.cancellationPayment.create({
      data: {
        cancellationId: id,
        paymentDate: new Date(paymentDate),
        method,
        invoiceNumber: invoiceNumber.trim(),
        amountPaid,
        notes,
      },
    });

    await prisma.cancellation.update({
      where: { id },
      data: { invoiceNumber: invoiceNumber.trim(), status: "PAGADA" },
    });

    await audit({
      userId: session.userId,
      action: "PAYMENT",
      entity: "Cancellation",
      entityId: id,
      detail: invoiceNumber,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
