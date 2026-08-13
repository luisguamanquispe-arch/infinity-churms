import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getContractHistory } from "@/lib/services/plan-changes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const history = await getContractHistory(id);
    if (!history) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json(history);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
