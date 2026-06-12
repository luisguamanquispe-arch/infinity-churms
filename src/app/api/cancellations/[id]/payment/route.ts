import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:payment");
    const { id } = await params;
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
