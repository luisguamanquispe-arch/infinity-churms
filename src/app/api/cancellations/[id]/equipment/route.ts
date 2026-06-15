import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { addCancellationEquipment, updateEquipmentItem } from "@/lib/services/cancellations";
import { audit } from "@/lib/audit";
import type { EquipmentCondition, EquipmentType } from "@prisma/client";

const VALID_TYPES = ["ONU", "ROUTER", "STB", "ANTENA", "OTRO"] as const;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (
      !hasPermission(session.role, "cancellations:equipment") &&
      !hasPermission(session.role, "cancellations:charges") &&
      !hasPermission(session.role, "cancellations:create")
    ) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = await request.json();
    const { type } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo de equipo obligatorio" }, { status: 400 });
    }

    const brand = String(body.brand ?? "").trim();
    const model = String(body.model ?? "").trim();
    const serial = String(body.serial ?? "").trim();
    if (!brand || !model || !serial) {
      return NextResponse.json(
        { error: "Marca, modelo y serie son obligatorios para registrar el equipo como entregado" },
        { status: 400 }
      );
    }

    const item = await addCancellationEquipment(id, {
      type: type as EquipmentType,
      serial,
      brand,
      model,
    });

    await audit({
      userId: session.userId,
      action: "ADD_EQUIPMENT",
      entity: "CancellationEquipment",
      entityId: item.id,
      detail: type,
    });

    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Error && e.message === "CLOSED") {
      return NextResponse.json({ error: "La baja ya no admite equipos" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (
      !hasPermission(session.role, "cancellations:equipment") &&
      !hasPermission(session.role, "cancellations:charges") &&
      !hasPermission(session.role, "cancellations:create")
    ) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    const { equipmentId, delivered, condition, notes, brand, model, serial } = await request.json();

    if (!equipmentId || typeof equipmentId !== "string") {
      return NextResponse.json({ error: "equipmentId obligatorio" }, { status: 400 });
    }

    const item = await updateEquipmentItem(equipmentId, {
      delivered,
      condition: condition as EquipmentCondition | null,
      notes,
      brand,
      model,
      serial,
    });

    await audit({
      userId: session.userId,
      action: "EQUIPMENT",
      entity: "CancellationEquipment",
      entityId: equipmentId,
    });

    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
