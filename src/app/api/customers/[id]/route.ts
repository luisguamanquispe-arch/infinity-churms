import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAnyPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-ip";
import { customerHasCancellation } from "@/lib/services/cancellations";
import { deleteCustomer } from "@/lib/services/customer-delete";
import { getBajaEligibility } from "@/lib/services/collections";
import {
  prepareCustomerUpdate,
  syncCustomerEquipment,
  type CustomerPatchBody,
} from "@/lib/services/customer-update";
import { formatCustomerPayload } from "@/lib/customer-form";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAnyPermission("customers:edit", "customers:manage");
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!customer) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const hasCancellation = await customerHasCancellation(id);
    const eligibility = await getBajaEligibility(id);

    return NextResponse.json({ ...customer, hasCancellation, eligibility });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAnyPermission("customers:edit", "customers:manage");
    const { id } = await params;
    const body = (await request.json()) as CustomerPatchBody;

    const existing = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const { data, error } = await prepareCustomerUpdate(existing, body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const formatted = formatCustomerPayload({
      contract: body.contract ?? existing.contract,
      name: body.name ?? existing.name,
      cedula: body.cedula ?? existing.cedula,
      address: body.address ?? existing.address,
      zone: body.zone ?? existing.zone,
      planName: body.planName ?? existing.planName,
      phone: body.phone ?? existing.phone ?? undefined,
      equipment: body.equipment,
    });

    const customer = await prisma.customer.update({
      where: { id },
      data,
      include: { equipment: true },
    });

    await syncCustomerEquipment(id, body.equipment, formatted.equipment);

    const refreshed = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });

    await audit({
      userId: session.userId,
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      detail: `Cliente ${customer.contract} actualizado`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(refreshed);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const removed = await deleteCustomer(id);

    await audit({
      userId: session.userId,
      action: "DELETE",
      entity: "Customer",
      entityId: id,
      detail: `Cliente eliminado · ${removed.contract} · ${removed.name}`,
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    console.error("[DELETE /api/customers/[id]]", e);
    return NextResponse.json({ error: "No se pudo eliminar el cliente" }, { status: 500 });
  }
}
