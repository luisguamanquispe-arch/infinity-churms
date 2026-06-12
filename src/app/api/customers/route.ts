import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { EquipmentType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const all = request.nextUrl.searchParams.get("all") === "1";
    const customers = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { cedula: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      include: { equipment: true },
      orderBy: { name: "asc" },
      take: all ? 100 : 20,
    });
    return NextResponse.json(customers);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("customers:manage");
    const body = await request.json();

    const customer = await prisma.customer.create({
      data: {
        code: body.code,
        name: body.name,
        cedula: body.cedula,
        address: body.address,
        phone: body.phone ?? null,
        serviceStartDate: new Date(body.serviceStartDate),
        planName: body.planName,
        hasTvStreaming: Boolean(body.hasTvStreaming),
        tvStreamingSince: body.hasTvStreaming && body.tvStreamingSince
          ? new Date(body.tvStreamingSince)
          : null,
        pendingBalance: body.pendingBalance ?? 0,
        equipment: {
          create: (body.equipment ?? []).map((eq: { type: EquipmentType; serial?: string; brand?: string }) => ({
            type: eq.type,
            serial: eq.serial ?? null,
            brand: eq.brand ?? null,
          })),
        },
      },
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      detail: customer.code,
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
