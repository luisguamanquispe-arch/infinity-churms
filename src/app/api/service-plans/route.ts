import { NextRequest, NextResponse } from "next/server";
import { requirePermission, getSession } from "@/lib/auth";
import { listActiveServicePlans } from "@/lib/services/plan-changes";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const allPlans = hasPermission(session.role, "config:manage");
    const plans = allPlans
      ? await prisma.servicePlan.findMany({ orderBy: [{ sortOrder: "asc" }, { speedMbps: "asc" }] })
      : await listActiveServicePlans();
    return NextResponse.json(plans);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("config:manage");
    const body = await request.json();
    if (!body.name?.trim() || !body.speedMbps || body.monthlyUsd == null) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    const plan = await prisma.servicePlan.create({
      data: {
        name: body.name.trim().toUpperCase(),
        speedMbps: Number(body.speedMbps),
        monthlyUsd: Number(body.monthlyUsd),
        installUsd: Number(body.installUsd ?? 0),
        active: body.active !== false,
        sortOrder: Number(body.sortOrder ?? 0),
      },
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear plan" }, { status: 500 });
  }
}
