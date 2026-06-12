import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const type = request.nextUrl.searchParams.get("type") ?? "bajas";

    if (type === "equipos") {
      const items = await prisma.cancellationEquipment.findMany({
        include: { cancellation: { include: { customer: true } } },
      });
      const recovered = items.filter((i) => i.delivered && i.condition === "BUENO").length;
      const damaged = items.filter((i) => i.condition === "DANADO").length;
      const lost = items.filter((i) => !i.delivered || i.condition === "NO_ENTREGADO").length;
      const onu = items.filter((i) => i.type === "ONU" && i.delivered).length;
      const routers = items.filter((i) => i.type === "ROUTER" && i.delivered).length;
      return NextResponse.json({ recovered, damaged, lost, onu, routers, items });
    }

    if (type === "valores") {
      const rows = await prisma.cancellation.findMany({
        where: { status: "BAJA_COMPLETADA" },
      });
      const sum = (fn: (r: (typeof rows)[0]) => number) =>
        rows.reduce((s, r) => s + fn(r), 0);
      return NextResponse.json({
        permanence: sum((r) => Number(r.permanenceAmount)),
        tv: sum((r) => Number(r.tvAmount)),
        equipment: sum((r) => Number(r.equipmentAmount)),
        monthly: sum((r) => Number(r.monthlyAmount)),
        total: sum((r) => Number(r.totalAmount)),
      });
    }

    const rows = await prisma.cancellation.findMany({
      include: { customer: true, createdBy: { select: { name: true } } },
      orderBy: { requestDate: "desc" },
    });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
