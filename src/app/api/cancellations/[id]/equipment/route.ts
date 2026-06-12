import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { updateEquipmentItem } from "@/lib/services/cancellations";
import { audit } from "@/lib/audit";
import type { EquipmentCondition } from "@prisma/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("cancellations:equipment");
    const { equipmentId, delivered, condition, notes, brand, model } = await request.json();

    await updateEquipmentItem(equipmentId, {
      delivered,
      condition: condition as EquipmentCondition | null,
      notes,
      brand,
      model,
    });

    await audit({
      userId: session.userId,
      action: "EQUIPMENT",
      entity: "CancellationEquipment",
      entityId: equipmentId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
