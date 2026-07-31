import { NextResponse } from "next/server";
import { manualCobranzaPdfBuffer } from "@/lib/pdf-manual-cobranza";

export async function GET() {
  const pdf = manualCobranzaPdfBuffer();
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="manual-gestion-cobranza.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
