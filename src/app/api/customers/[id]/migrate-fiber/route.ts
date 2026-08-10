import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { registerFiberMigration } from "@/lib/services/customer-migration";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id } = await params;
    const body = await request.json();

    const customer = await registerFiberMigration(id, session.userId, {
      fiberMigrationDate: body.fiberMigrationDate,
      notes: body.notes,
    });

    await audit({
      userId: session.userId,
      action: "MIGRATION",
      entity: "Customer",
      entityId: id,
      detail: `RADIOENLACE → FIBRA · ${body.fiberMigrationDate}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(customer);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "DATE_INVALID") {
      return NextResponse.json({ error: "Fecha de migración inválida" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "ALREADY_FIBRA") {
      return NextResponse.json({ error: "El cliente ya es fibra original" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al registrar migración" }, { status: 500 });
  }
}
