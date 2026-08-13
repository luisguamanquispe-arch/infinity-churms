import { NextRequest, NextResponse } from "next/server";
import { resolveSignatureToken } from "@/lib/services/plan-change-remote-signature";
import { generateAdendumPdfForChange } from "@/lib/services/plan-changes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const resolved = await resolveSignatureToken(token);
    if ("error" in resolved && resolved.error !== undefined && !resolved.record) {
      return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
    }
    if (resolved.error === "EXPIRED" || resolved.error === "CANCELLED") {
      return NextResponse.json({ error: "Enlace no disponible" }, { status: 410 });
    }

    const pcId = resolved.record!.planChangeId;
    const pc = resolved.record!.planChange;

    if (pc.signedPdfData && pc.status === "ACTIVO") {
      const buf = Buffer.from(pc.signedPdfData, "base64");
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pc.addendumNumber ?? "adendum"}.pdf"`,
        },
      });
    }

    const pdf = await generateAdendumPdfForChange(pcId, "Infinity Internet");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pc.addendumNumber ?? "adendum"}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
