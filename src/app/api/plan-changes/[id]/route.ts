import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  cancelPlanChange,
  confirmPlanChange,
  getPlanChange,
  signPlanChange,
  voidPlanChange,
} from "@/lib/services/plan-changes";
import { getPlanChangePermissions } from "@/lib/plan-change-permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const row = await getPlanChange(id);
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const perms = getPlanChangePermissions(session.role);
    const { id } = await params;
    const body = await request.json();
    const ip = getClientIp(request);

    if (body.action === "confirm") {
      if (!perms.canConfirm) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      const row = await confirmPlanChange(id);
      await audit({
        userId: session.userId,
        action: "UPDATE",
        entity: "PlanChange",
        entityId: id,
        detail: `Adendum generado · ${row.addendumNumber}`,
        ipAddress: ip,
      });
      return NextResponse.json(row);
    }

    if (body.action === "sign") {
      if (!perms.canSign) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      const row = await signPlanChange({
        id,
        signatureName: body.signatureName ?? "",
        signatureCedula: body.signatureCedula ?? "",
        signatureImageData: body.signatureImageData ?? "",
        signatureConsent: !!body.signatureConsent,
        signatureIp: ip ?? undefined,
        processedByName: session.name,
      });
      await audit({
        userId: session.userId,
        action: "SIGNATURE",
        entity: "PlanChange",
        entityId: id,
        detail: `Adendum firmado y plan activado · ${row.addendumNumber}`,
        ipAddress: ip,
      });
      return NextResponse.json(row);
    }

    if (body.action === "cancel") {
      if (!perms.canCancel) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      const row = await cancelPlanChange(id);
      await audit({
        userId: session.userId,
        action: "STATUS",
        entity: "PlanChange",
        entityId: id,
        detail: "Cambio de plan cancelado",
        ipAddress: ip,
      });
      return NextResponse.json(row);
    }

    if (body.action === "void") {
      if (!perms.canVoid) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      const row = await voidPlanChange(id, session.userId, body.reason ?? "");
      await audit({
        userId: session.userId,
        action: "STATUS",
        entity: "PlanChange",
        entityId: id,
        detail: `Adendum anulado · ${body.reason}`,
        ipAddress: ip,
      });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
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
