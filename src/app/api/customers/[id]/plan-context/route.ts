import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getCustomerPlanContext } from "@/lib/services/plan-changes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("plan-changes:create");
    const { id } = await params;
    const ctx = await getCustomerPlanContext(id);
    if (!ctx) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(ctx);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
