import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listClosedForAnalysis } from "@/lib/services/cancellations";
import {
  collectionReportToCsv,
  getCollectionReport,
  parseCollectionReportFilters,
} from "@/lib/services/collection-reports";
import { collectionReportPdfBuffer } from "@/lib/pdf-reporte-cobranzas";
import { REASON_LABELS, getEquipmentReportStatus } from "@/lib/constants";
import { PENDING_EQUIPMENT_RECOVERY_WHERE } from "@/lib/dashboard-kpi-definitions";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const type = request.nextUrl.searchParams.get("type") ?? "bajas";
    const format = request.nextUrl.searchParams.get("format") ?? "json";

    if (type === "cobranzas") {
      const filters = parseCollectionReportFilters(request.nextUrl.searchParams);
      const report = await getCollectionReport(filters);

      if (format === "pdf") {
        const pdf = collectionReportPdfBuffer(report);
        const filename = `reporte-cobranzas-${filters.view}-${new Date().toISOString().slice(0, 10)}.pdf`;
        return new NextResponse(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${filename}"`,
          },
        });
      }

      if (format === "csv") {
        const csv = collectionReportToCsv(report);
        const filename = `reporte-cobranzas-${filters.view}-${new Date().toISOString().slice(0, 10)}.csv`;
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      return NextResponse.json(report);
    }

    if (type === "causas") {
      if (!session || !["ADMIN", "SUPERVISOR"].includes(session.role)) {
        return NextResponse.json({ error: "Solo gerencia" }, { status: 403 });
      }
      const rows = await listClosedForAnalysis();
      const byReason: Record<string, number> = {};
      for (const r of rows) {
        byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
      }
      return NextResponse.json({
        rows: rows.map((r) => ({
          id: r.id,
          contract: r.customer.contract,
          customerName: r.customer.name,
          cedula: r.customer.cedula,
          planName: r.customer.planName,
          reason: r.reason,
          reasonLabel: REASON_LABELS[r.reason] ?? r.reason,
          closeDate: r.closeDate,
          totalAmount: r.totalAmount,
          createdBy: r.createdBy.name,
        })),
        byReason: Object.entries(byReason).map(([reason, count]) => ({
          reason,
          label: REASON_LABELS[reason] ?? reason,
          count,
        })),
      });
    }

    if (type === "equipos") {
      const items = await prisma.cancellationEquipment.findMany({
        where: PENDING_EQUIPMENT_RECOVERY_WHERE,
        include: {
          cancellation: {
            include: {
              customer: { select: { contract: true, name: true, cedula: true } },
            },
          },
        },
        orderBy: { cancellation: { requestDate: "desc" } },
      });

      return NextResponse.json({
        definition:
          "Equipos pendientes de recuperación en bajas abiertas (no completadas ni canceladas). Alineado con KPI notRecovered del dashboard.",
        pendingRecovery: items.length,
        lost: items.length,
        items: items.map((i) => ({
          id: i.id,
          contract: i.cancellation.customer.contract,
          customerName: i.cancellation.customer.name,
          cedula: i.cancellation.customer.cedula,
          cancellationId: i.cancellationId,
          cancellationStatus: i.cancellation.status,
          type: i.type,
          serial: i.serial,
          brand: i.brand,
          model: i.model,
          delivered: i.delivered,
          condition: i.condition,
          statusLabel: getEquipmentReportStatus(i.delivered, i.condition),
          notes: i.notes,
        })),
      });
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
