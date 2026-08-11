import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requirePermission("cancellations:create");
    const config = await prisma.tariffConfig.findFirst();
    return NextResponse.json({
      permanenceMonths: config?.permanenceMonths ?? 18,
      installCostUsd: Number(config?.installCostUsd ?? 200),
      tvMonthlyUsd: Number(config?.tvMonthlyUsd ?? 2),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
