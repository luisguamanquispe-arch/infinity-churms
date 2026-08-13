import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  buildWhatsappMessage,
  buildWhatsappUrl,
  generateSignatureLink,
  getActiveSignatureToken,
  markLinkSent,
  regenerateSignatureLink,
} from "@/lib/services/plan-change-remote-signature";
import { getPlanChange, getTariffConfig } from "@/lib/services/plan-changes";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("plan-changes:send-link");
    const { id } = await params;
    const token = await getActiveSignatureToken(id);
    return NextResponse.json({ token });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("plan-changes:send-link");
    const { id } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const baseUrl = getAppBaseUrl(request);

    const pc = await getPlanChange(id);
    if (!pc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (pc.status !== "PENDIENTE_DE_FIRMA") {
      return NextResponse.json({ error: "El cambio debe estar pendiente de firma." }, { status: 400 });
    }

    const link =
      body.action === "regenerate"
        ? await regenerateSignatureLink(id, session.userId, baseUrl)
        : await generateSignatureLink(id, session.userId, baseUrl);

    const config = await getTariffConfig();
    const message = buildWhatsappMessage({
      customerName: pc.customer.name,
      link: link.url,
      template: config.whatsappSignatureMessage,
    });
    const whatsappUrl = buildWhatsappUrl(pc.customer.phone, message);

    if (body.markSent === true) {
      await markLinkSent(id, session.userId);
    }

    await audit({
      userId: session.userId,
      action: body.action === "regenerate" ? "REGENERATE_LINK" : "GENERATE_LINK",
      entity: "PlanChange",
      entityId: id,
      detail: `Enlace firma remota · expira ${link.expiresAt.toISOString()}`,
      ipAddress: ip,
    });

    return NextResponse.json({
      url: link.url,
      expiresAt: link.expiresAt,
      whatsappUrl,
      message,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
