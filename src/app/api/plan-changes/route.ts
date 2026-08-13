import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createPlanChange,
  listPlanChanges,
} from "@/lib/services/plan-changes";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("plan-changes:list");
    const sp = request.nextUrl.searchParams;
    const rows = await listPlanChanges({
      status: sp.get("status") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      userId: sp.get("userId") ?? undefined,
      customerId: sp.get("customerId") ?? undefined,
      previousPlanId: sp.get("previousPlanId") ?? undefined,
      newPlanId: sp.get("newPlanId") ?? undefined,
      signed: sp.get("signed") ?? undefined,
    });
    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("plan-changes:create");
    const body = await request.json();

    if (!body.customerId || !body.newPlanId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const row = await createPlanChange({
      customerId: body.customerId,
      newPlanId: body.newPlanId,
      approvedMonthlyUsd: body.approvedMonthlyUsd,
      discountReason: body.discountReason,
      userId: session.userId,
      discountAuthorizedById:
        body.approvedMonthlyUsd != null && body.discountReason
          ? session.userId
          : undefined,
    });

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "PlanChange",
      entityId: row.id,
      detail: `Cambio de plan borrador · ${row.customer.contract} · ${row.previousPlanName} → ${row.newPlanName}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al crear" },
      { status: 400 }
    );
  }
}
