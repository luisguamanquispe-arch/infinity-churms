import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prelegalNoticePdfBuffer } from "@/lib/pdf-aviso-prelegal";
import { buildPrelegalOverdueSummary, isPrelegalOverdue } from "@/lib/services/overdue";
import { listCollectionCharges } from "@/lib/services/collection-charges";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (
      !isPrelegalOverdue({
        pendingBalance: Number(customer.pendingBalance),
        overdueSince: customer.overdueSince,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "El cliente no cumple mora superior a 90 días. Verifique saldo pendiente y fecha de inicio de mora.",
        },
        { status: 400 }
      );
    }

    const tariffs = await prisma.equipmentTariff.findMany();
    const collectionCharges = await listCollectionCharges(id);

    const pdf = prelegalNoticePdfBuffer(
      {
        name: customer.name,
        contract: customer.contract,
        cedula: customer.cedula,
        address: customer.address,
        zone: customer.zone,
        pendingBalance: Number(customer.pendingBalance),
        overdueSince: customer.overdueSince,
        planName: customer.planName,
        hasTvStreaming: customer.hasTvStreaming,
        tvStreamingSince: customer.tvStreamingSince,
        equipment: customer.equipment,
      },
      tariffs.map((t) => ({ type: t.type, notReturnedUsd: Number(t.notReturnedUsd) })),
      collectionCharges
    );

    const filename = `aviso-prelegal-${customer.contract}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_PRELEGAL") {
      return NextResponse.json({ error: "Cliente no elegible para aviso prelegal" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al generar aviso" }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("customers:manage");
    const { id } = await params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { equipment: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const tariffs = await prisma.equipmentTariff.findMany();
    const collectionCharges = await listCollectionCharges(id);

    const summary = buildPrelegalOverdueSummary({
      pendingBalance: Number(customer.pendingBalance),
      overdueSince: customer.overdueSince,
      planName: customer.planName,
      hasTvStreaming: customer.hasTvStreaming,
      tvStreamingSince: customer.tvStreamingSince,
      equipment: customer.equipment,
      equipmentTariffs: tariffs.map((t) => ({
        type: t.type,
        notReturnedUsd: Number(t.notReturnedUsd),
      })),
      collectionCharges,
    });

    if (!summary) {
      return NextResponse.json(
        {
          eligible: false,
          overdueDays: 0,
          message: "Requiere saldo pendiente y mora ≥ 90 días (fecha inicio mora).",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      eligible: true,
      summary: {
        ...summary,
        overdueSince: summary.overdueSince?.toISOString() ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
