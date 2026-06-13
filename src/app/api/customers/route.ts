import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { formatCustomerPayload, validateCustomerInput } from "@/lib/customer-form";
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
              { contract: { contains: q, mode: "insensitive" } },
              { cedula: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      include: {
        equipment: true,
        cancellations: { select: { id: true, status: true } },
      },
      orderBy: { name: "asc" },
      take: all ? 100 : 20,
    });

    return NextResponse.json(
      customers.map((c) => ({
        ...c,
        hasCancellation: c.cancellations.length > 0,
        cancellations: undefined,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("customers:manage");
    const body = await request.json();

    if (body.hasTvStreaming && !body.tvStreamingSince) {
      return NextResponse.json(
        { error: "Indique la fecha de inicio del servicio TV Streams" },
        { status: 400 }
      );
    }

    const formatted = formatCustomerPayload(body);
    const validationError = validateCustomerInput(formatted);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        contract: formatted.contract,
        name: formatted.name,
        cedula: formatted.cedula,
        address: formatted.address,
        zone: formatted.zone,
        phone: formatted.phone,
        serviceStartDate: new Date(body.serviceStartDate),
        planName: formatted.planName,
        hasTvStreaming: Boolean(body.hasTvStreaming),
        tvStreamingSince:
          body.hasTvStreaming && body.tvStreamingSince
            ? new Date(body.tvStreamingSince)
            : null,
        pendingBalance: body.pendingBalance ?? 0,
        equipment: {
          create: (body.equipment ?? []).map(
            (eq: { type: EquipmentType; serial?: string; brand?: string; model?: string }, i: number) => ({
              type: eq.type,
              serial: formatted.equipment[i]?.serial ?? null,
              brand: formatted.equipment[i]?.brand ?? null,
              model: formatted.equipment[i]?.model ?? null,
            })
          ),
        },
      },
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      detail: customer.contract,
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
