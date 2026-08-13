import { NextRequest, NextResponse } from "next/server";
import { processRemoteSelfieUpload } from "@/lib/services/plan-change-remote-signature";
import { getClientIp } from "@/lib/request-ip";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const formData = await request.formData();
    const file = formData.get("selfie");

    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "Debe adjuntar la selfie." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";

    const result = await processRemoteSelfieUpload(token, buffer, mime, {
      ip: getClientIp(request) ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status =
      msg === "SOLICITUD_COMPLETADA" ? 410 :
      msg === "ENLACE_EXPIRADO" ? 410 :
      msg === "ENLACE_CANCELADO" ? 410 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
