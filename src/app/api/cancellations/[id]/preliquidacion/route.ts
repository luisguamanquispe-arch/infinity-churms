import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextPreliquidacionNumber } from "@/lib/acta-number";
import { getCancellation } from "@/lib/services/cancellations";
import { generatePreliquidacionPdf } from "@/lib/pdf-preliquidacion";
import { REASON_LABELS } from "@/lib/constants";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const docNumber = await nextPreliquidacionNumber();

    const pdf = generatePreliquidacionPdf({
      docNumber,
      cancellation: row,
      customer: row.customer,
      equipment: row.equipment,
      charges: row.charges,
      reasonLabel: REASON_LABELS[row.reason] ?? row.reason,
    });

    await audit({
      userId: session.userId,
      action: "PDF_PRELIQUIDACION",
      entity: "Cancellation",
      entityId: id,
      detail: docNumber,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="preliquidacion-${row.customer.contract}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error al generar PDF" }, { status: 500 });
  }
}
