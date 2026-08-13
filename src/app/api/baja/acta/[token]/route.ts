import { NextRequest, NextResponse } from "next/server";
import {
  completeActaRemoteSignature,
  markActaLinkOpened,
  publicActaPayload,
  resolveActaSignatureToken,
} from "@/lib/services/cancellation-acta-remote-signature";
import { getClientIp } from "@/lib/request-ip";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveActaSignatureToken(token);

  if ("error" in resolved && resolved.error) {
    const status =
      resolved.error === "EXPIRED" ? 410 : resolved.error === "COMPLETED" ? 200 : 404;
    return NextResponse.json(
      {
        error: resolved.error,
        ...(resolved.record ? { signed: !!resolved.record.finalLiquidation.signedAt } : {}),
      },
      { status }
    );
  }

  const { record } = resolved;
  await markActaLinkOpened(
    record.id,
    getClientIp(request),
    request.headers.get("user-agent")
  );

  return NextResponse.json(publicActaPayload(record));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json();
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  try {
    if (body.action === "complete") {
      await completeActaRemoteSignature(
        token,
        {
          clientName: body.clientName ?? "",
          signatureImageData: body.signatureImageData ?? "",
          accepted: Boolean(body.accepted),
        },
        ip,
        userAgent
      );
      return NextResponse.json({ ok: true, signed: true });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    const status =
      msg === "ACCEPT_REQUIRED" || msg === "NAME_REQUIRED" || msg === "SIGNATURE_INVALID"
        ? 400
        : ["INVALID", "EXPIRED", "CANCELLED", "INVALID_STATE"].includes(msg)
          ? 404
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
