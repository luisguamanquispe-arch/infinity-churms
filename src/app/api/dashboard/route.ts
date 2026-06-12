import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getDashboardKpis } from "@/lib/services/cancellations";

export async function GET() {
  try {
    await requireSession();
    const kpis = await getDashboardKpis();
    return NextResponse.json(kpis);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
