import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  deleteCollectionCharge,
  listCollectionCharges,
  totalCharges,
  updateCollectionCharge,
} from "@/lib/services/collection-charges";
import type { CollectionChargeTypeValue } from "@/lib/constants";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id, chargeId } = await params;
    const body = await request.json();

    const result = await updateCollectionCharge(id, chargeId, {
      chargeType: body.chargeType as CollectionChargeTypeValue | undefined,
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      description: body.description,
      periodLabel: body.periodLabel,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
    });

    await audit({
      userId: session.userId,
      action: "COLLECTION_CHARGE_UPDATE",
      entity: "CollectionCharge",
      entityId: chargeId,
      detail: `${result.charge.chargeType} · ${result.charge.amount}`,
      ipAddress: getClientIp(request),
    });

    const charges = await listCollectionCharges(id);

    return NextResponse.json({
      charge: result.charge,
      charges,
      totalCharges: totalCharges(charges),
      pendingBalance: String(result.customer.pendingBalance),
      overdueSince: result.customer.overdueSince?.toISOString() ?? null,
      inCollectionWhitelist: result.customer.inCollectionWhitelist,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "AMOUNT_REQUIRED") {
      return NextResponse.json({ error: "Indique un valor válido mayor a cero" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Cargo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error al actualizar cargo" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id, chargeId } = await params;

    const result = await deleteCollectionCharge(id, chargeId);

    await audit({
      userId: session.userId,
      action: "COLLECTION_CHARGE_DELETE",
      entity: "CollectionCharge",
      entityId: chargeId,
      detail: "Cargo eliminado",
      ipAddress: getClientIp(request),
    });

    const charges = await listCollectionCharges(id);

    return NextResponse.json({
      charges,
      totalCharges: totalCharges(charges),
      pendingBalance: String(result.customer.pendingBalance),
      overdueSince: result.customer.overdueSince?.toISOString() ?? null,
      inCollectionWhitelist: result.customer.inCollectionWhitelist,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Cargo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error al eliminar cargo" }, { status: 500 });
  }
}
