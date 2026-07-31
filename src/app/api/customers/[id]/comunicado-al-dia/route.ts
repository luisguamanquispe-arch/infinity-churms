import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { paidInFullPdfBuffer } from "@/lib/pdf-comunicado-al-dia";
import { listCollectionPayments } from "@/lib/services/collection-payments";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (!customer.inCollectionWhitelist || Number(customer.pendingBalance) > 0) {
      return NextResponse.json(
        { error: "El cliente debe estar al día (lista blanca) para generar el comunicado" },
        { status: 400 }
      );
    }

    const payments = await listCollectionPayments(id);
    if (payments.length === 0) {
      return NextResponse.json(
        { error: "No hay pagos registrados para este cliente" },
        { status: 400 }
      );
    }

    const pdf = paidInFullPdfBuffer({
      customer: {
        name: customer.name,
        contract: customer.contract,
        cedula: customer.cedula,
      },
      payments,
    });

    const filename = `comunicado-al-dia-${customer.contract}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al generar comunicado" }, { status: 500 });
  }
}
