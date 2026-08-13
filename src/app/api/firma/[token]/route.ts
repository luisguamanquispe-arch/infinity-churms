import { NextRequest, NextResponse } from "next/server";
import {
  getPublicSignatureSession,
  processRemoteSignatureAction,
} from "@/lib/services/plan-change-remote-signature";
import { getClientIp } from "@/lib/request-ip";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const session = await getPublicSignatureSession(token);
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const result = await processRemoteSignatureAction(token, body.action, body, {
      ip: ip ?? undefined,
      userAgent,
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
