import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getActivePreliquidacion } from "@/lib/services/preliquidaciones";
import {
  buildWhatsappUrl,
  DEFAULT_PRELIQUIDACION_WHATSAPP_MESSAGE,
  generatePreliquidacionLink,
  getActivePreliquidacionToken,
  markPreliquidacionLinkSent,
} from "@/lib/services/preliquidacion-remote-approval";
import { getCancellation } from "@/lib/services/cancellations";
import { getClientIp } from "@/lib/request-ip";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("cancellations:preliquidate_send");
    const { id } = await params;
    const active = await getActivePreliquidacion(id);
    if (!active) return NextResponse.json({ token: null });

    const token = await getActivePreliquidacionToken(active.id);
    return NextResponse.json({ token, preliquidacion: active });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:preliquidate_send");
    const { id } = await params;
    const body = await request.json();

    const row = await getCancellation(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const active = row.activePreliquidacion;
    if (!active) {
      return NextResponse.json({ error: "Genere una preliquidación primero." }, { status: 400 });
    }
    if (active.status === "APROBADA") {
      return NextResponse.json({ error: "La preliquidación ya fue aprobada." }, { status: 400 });
    }

    if (body.markSent) {
      await markPreliquidacionLinkSent(active.id, session.userId);
      return NextResponse.json({ ok: true });
    }

    const { url, expiresAt } = await generatePreliquidacionLink(active.id, session.userId);
    const whatsappUrl = buildWhatsappUrl(
      row.customer.phone,
      DEFAULT_PRELIQUIDACION_WHATSAPP_MESSAGE.replace("[NOMBRE]", row.customer.name),
      url
    );

    await audit({
      userId: session.userId,
      action: "PRELIQUIDACION_LINK",
      entity: "Cancellation",
      entityId: id,
      detail: `V${active.version}`,
      ipAddress: getClientIp(request),
    });

    const token = await getActivePreliquidacionToken(active.id);
    return NextResponse.json({ url, expiresAt, whatsappUrl, token });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_APPROVED") {
      return NextResponse.json({ error: "Preliquidación ya aprobada." }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al generar enlace" }, { status: 500 });
  }
}
