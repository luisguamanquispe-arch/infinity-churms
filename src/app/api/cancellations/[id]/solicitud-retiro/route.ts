import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getCancellation } from "@/lib/services/cancellations";
import {
  decodePdfDataUrl,
  sanitizePdfFileName,
} from "@/lib/cancellation-withdrawal-document";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    if (!row.withdrawalRequestFileData || !row.withdrawalRequestFileName) {
      return NextResponse.json(
        { error: "No hay solicitud de retiro archivada para esta baja" },
        { status: 404 }
      );
    }

    const pdf = decodePdfDataUrl(row.withdrawalRequestFileData);
    const filename = sanitizePdfFileName(
      row.withdrawalRequestFileName,
      `solicitud-retiro-${row.customer.contract}.pdf`
    );

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error al obtener documento" }, { status: 500 });
  }
}
