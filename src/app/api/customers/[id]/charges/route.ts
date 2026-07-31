import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import {
  createCollectionCharge,
  listCollectionCharges,
  totalCharges,
} from "@/lib/services/collection-charges";
import type { CollectionChargeTypeValue } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;
    const charges = await listCollectionCharges(id);
    return NextResponse.json({
      charges,
      totalCharges: totalCharges(charges),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("customers:manage");
    const { id } = await params;
    const body = await request.json();

    const result = await createCollectionCharge(id, session.userId, {
      chargeType: body.chargeType as CollectionChargeTypeValue,
      amount: Number(body.amount),
      description: body.description,
      periodLabel: body.periodLabel,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
    });

    await audit({
      userId: session.userId,
      action: "COLLECTION_CHARGE_CREATE",
      entity: "CollectionCharge",
      entityId: result.charge.id,
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
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error al registrar cargo" }, { status: 500 });
  }
}
