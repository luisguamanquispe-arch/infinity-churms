import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("config:manage");
    const { id } = await params;
    const body = await request.json();
    const plan = await prisma.servicePlan.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim().toUpperCase() } : {}),
        ...(body.speedMbps != null ? { speedMbps: Number(body.speedMbps) } : {}),
        ...(body.monthlyUsd != null ? { monthlyUsd: Number(body.monthlyUsd) } : {}),
        ...(body.installUsd != null ? { installUsd: Number(body.installUsd) } : {}),
        ...(body.active != null ? { active: !!body.active } : {}),
        ...(body.sortOrder != null ? { sortOrder: Number(body.sortOrder) } : {}),
      },
    });
    return NextResponse.json(plan);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("plan-changes:create");
    const { id } = await params;
    const plan = await prisma.servicePlan.findUnique({ where: { id } });
    if (!plan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
