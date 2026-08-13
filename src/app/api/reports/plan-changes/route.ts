import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listPlanChanges } from "@/lib/services/plan-changes";
import { PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-VE");
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:view");
    const sp = request.nextUrl.searchParams;
    const format = sp.get("format");

    const rows = await listPlanChanges({
      status: sp.get("status") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      userId: sp.get("userId") ?? undefined,
      signed: sp.get("signed") ?? undefined,
    });

    if (format === "json") {
      return NextResponse.json(rows);
    }

    if (format === "csv" || format === "excel") {
      const header =
        "Cliente,Contrato,Plan anterior,Nuevo plan,Precio anterior,Nuevo precio,Fecha,Nueva fin permanencia,Estado,Adendum\n";
      const lines = rows.map((r) =>
        [
          r.customer.name,
          r.customer.contract,
          r.previousPlanName,
          r.newPlanName,
          Number(r.previousMonthlyUsd).toFixed(2),
          Number(r.newMonthlyUsd).toFixed(2),
          fmtDate(r.signedAt ?? r.requestDate),
          fmtDate(r.newPermanenceEnd),
          PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status,
          r.addendumNumber ?? "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      );
      const csv = header + lines.join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="cambios-de-plan.csv"',
        },
      });
    }

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Reporte — Cambios de Plan", 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [
          [
            "Cliente",
            "Contrato",
            "Plan ant.",
            "Plan nuevo",
            "$ ant.",
            "$ nuevo",
            "Fecha",
            "Fin permanencia",
            "Estado",
            "Adendum",
          ],
        ],
        body: rows.map((r) => [
          r.customer.name,
          r.customer.contract,
          r.previousPlanName,
          r.newPlanName,
          Number(r.previousMonthlyUsd).toFixed(2),
          Number(r.newMonthlyUsd).toFixed(2),
          fmtDate(r.signedAt ?? r.requestDate),
          fmtDate(r.newPermanenceEnd),
          PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status,
          r.addendumNumber ?? "—",
        ]),
        styles: { fontSize: 7 },
      });
      return new NextResponse(new Uint8Array(doc.output("arraybuffer")), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="cambios-de-plan.pdf"',
        },
      });
    }

    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
