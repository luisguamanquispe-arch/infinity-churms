import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listCustomersForRenewal } from "@/lib/contract-eligibility";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("plan-changes:list");
    const filter = request.nextUrl.searchParams.get("filter") ?? "elegibles";
    const rows = await listCustomersForRenewal(filter);
    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
