import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listCollectionAgentUsers } from "@/lib/services/collections";

export async function GET() {
  try {
    await requirePermission("customers:manage");
    const agents = await listCollectionAgentUsers();
    return NextResponse.json(agents);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
