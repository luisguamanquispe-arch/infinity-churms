import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasPermission, NAV_ITEMS } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  return NextResponse.json({
    ...session,
    nav: NAV_ITEMS.filter((item) => hasPermission(session.role, item.permission)),
  });
}
