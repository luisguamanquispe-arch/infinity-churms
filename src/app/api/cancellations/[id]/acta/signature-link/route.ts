import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCancellation } from "@/lib/services/cancellations";
import {
  buildActaWhatsappUrl,
  DEFAULT_ACTA_WHATSAPP_MESSAGE,
  generateActaSignatureLink,
  getActiveActaSignatureToken,
  getLatestFinalLiquidation,
  markActaLinkSent,
} from "@/lib/services/cancellation-acta-remote-signature";
import { getClientIp } from "@/lib/request-ip";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("cancellations:acta_send");
    const { id } = await params;
    const finalLiq = await getLatestFinalLiquidation(id);
    const token = await getActiveActaSignatureToken(id);
    return NextResponse.json({ token, finalLiquidation: finalLiq });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:acta_send");
    const { id } = await params;
    const body = await request.json();

    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (row.status !== "LIQUIDACION_FINAL") {
      return NextResponse.json(
        { error: "Solo se puede enviar firma del acta en liquidación final." },
        { status: 400 }
      );
    }

    const finalLiq = row.finalLiquidations[0];
    if (finalLiq?.signedAt) {
      return NextResponse.json({ error: "El acta ya fue firmada." }, { status: 400 });
    }

    if (body.markSent) {
      await markActaLinkSent(id, session.userId);
      return NextResponse.json({ ok: true });
    }

    const { url, expiresAt } = await generateActaSignatureLink(id, session.userId);
    const whatsappUrl = buildActaWhatsappUrl(
      row.customer.phone,
      DEFAULT_ACTA_WHATSAPP_MESSAGE.replace("[NOMBRE]", row.customer.name),
      url
    );

    await audit({
      userId: session.userId,
      action: "ACTA_SIGNATURE_LINK",
      entity: "Cancellation",
      entityId: id,
      ipAddress: getClientIp(request),
    });

    const token = await getActiveActaSignatureToken(id);
    return NextResponse.json({ url, expiresAt, whatsappUrl, token });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_FINAL_LIQUIDATION") {
      return NextResponse.json({ error: "Genere la liquidación final primero." }, { status: 400 });
    }
    if (e instanceof Error && e.message === "ALREADY_SIGNED") {
      return NextResponse.json({ error: "Acta ya firmada." }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al generar enlace" }, { status: 500 });
  }
}
