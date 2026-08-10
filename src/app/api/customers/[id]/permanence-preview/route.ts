import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getPermanencePreviewForCustomer } from "@/lib/services/cancellations";
import { serializePermanenceSummary } from "@/lib/permanence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("cancellations:create");
    const { id } = await params;
    const dateParam = request.nextUrl.searchParams.get("requestDate");
    const requestDate = dateParam ? new Date(dateParam) : new Date();
    const summary = await getPermanencePreviewForCustomer(id, requestDate);
    return NextResponse.json(serializePermanenceSummary(summary));
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
