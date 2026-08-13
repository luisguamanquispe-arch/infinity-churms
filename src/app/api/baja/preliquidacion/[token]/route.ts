import { NextRequest, NextResponse } from "next/server";
import {
  approvePreliquidacionViaToken,
  markPreliquidacionLinkOpened,
  rejectPreliquidacionViaToken,
  resolvePreliquidacionToken,
} from "@/lib/services/preliquidacion-remote-approval";
import { getClientIp } from "@/lib/request-ip";

function publicPayload(record: NonNullable<Awaited<ReturnType<typeof resolvePreliquidacionToken>>["record"]>) {
  const { preliquidacion } = record;
  const { cancellation } = preliquidacion;
  return {
    version: preliquidacion.version,
    status: preliquidacion.status,
    totalAmount: Number(preliquidacion.totalAmount),
    creditsAmount: Number(preliquidacion.creditsAmount),
    subtotal: Number(preliquidacion.subtotal),
    customerName: cancellation.customer.name,
    contract: cancellation.customer.contract,
    planName: cancellation.customer.planName,
    requestDate: cancellation.requestDate,
    lineItems: preliquidacion.lineItems.map((l) => ({
      category: l.category,
      concept: l.concept,
      amount: Number(l.amount),
    })),
    tokenStatus: record.status,
    expiresAt: record.expiresAt,
    approved: preliquidacion.status === "APROBADA",
    rejected: preliquidacion.status === "RECHAZADA",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolvePreliquidacionToken(token);

  if ("error" in resolved && resolved.error) {
    const status =
      resolved.error === "EXPIRED" ? 410 : resolved.error === "COMPLETED" ? 200 : 404;
    return NextResponse.json(
      {
        error: resolved.error,
        ...(resolved.record ? { approved: resolved.record.preliquidacion.status === "APROBADA" } : {}),
      },
      { status }
    );
  }

  const { record } = resolved;
  await markPreliquidacionLinkOpened(
    record.id,
    getClientIp(request),
    request.headers.get("user-agent")
  );

  return NextResponse.json(publicPayload(record));
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
    if (body.action === "approve") {
      if (!body.confirmed) {
        return NextResponse.json(
          { error: "Debe confirmar que revisó la preliquidación." },
          { status: 400 }
        );
      }
      const preliq = await approvePreliquidacionViaToken(token, ip, userAgent);
      return NextResponse.json({ ok: true, approved: true, totalAmount: Number(preliq.totalAmount) });
    }

    if (body.action === "reject") {
      const preliq = await rejectPreliquidacionViaToken(token, body.reason ?? "", ip, userAgent);
      return NextResponse.json({ ok: true, rejected: true, version: preliq.version });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERROR";
    const status =
      msg === "REASON_REQUIRED" ? 400 : ["INVALID", "EXPIRED", "CANCELLED", "INVALID_STATE"].includes(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
