import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAdendumPdfForChange } from "@/lib/services/plan-changes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const pc = await prisma.planChange.findUnique({ where: { id } });
    if (!pc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    if (pc.signedPdfData && pc.status === "ACTIVO") {
      const buf = Buffer.from(pc.signedPdfData, "base64");
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pc.addendumNumber ?? "adendum"}.pdf"`,
        },
      });
    }

    const pdf = await generateAdendumPdfForChange(id, session.name);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pc.addendumNumber ?? "adendum-borrador"}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
