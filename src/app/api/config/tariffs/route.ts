import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function GET() {
  try {
    await requirePermission("config:manage");
    const [tariff, equipment] = await Promise.all([
      prisma.tariffConfig.findFirst(),
      prisma.equipmentTariff.findMany({ orderBy: { type: "asc" } }),
    ]);
    return NextResponse.json({ tariff, equipment });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requirePermission("config:manage");
    const body = await request.json();

    if (body.tariff) {
      const existing = await prisma.tariffConfig.findFirst();
      if (existing) {
        await prisma.tariffConfig.update({
          where: { id: existing.id },
          data: {
            permanenceMonths: body.tariff.permanenceMonths,
            installCostUsd: body.tariff.installCostUsd,
            tvMonthlyUsd: body.tariff.tvMonthlyUsd,
          },
        });
      }
    }

    if (Array.isArray(body.equipment)) {
      for (const row of body.equipment) {
        await prisma.equipmentTariff.update({
          where: { type: row.type },
          data: {
            damagedUsd: row.damagedUsd,
            notReturnedUsd: row.notReturnedUsd,
          },
        });
      }
    }

    await audit({
      userId: session.userId,
      action: "UPDATE_TARIFFS",
      entity: "TariffConfig",
      detail: "Tarifas actualizadas",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
