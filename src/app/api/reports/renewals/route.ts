import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listPlanChanges } from "@/lib/services/plan-changes";
import { OPERATION_TYPE_LABELS, PLAN_CHANGE_STATUS_LABELS } from "@/lib/constants";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatUsd } from "@/lib/liquidation";

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-VE");
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports:view");
    const sp = request.nextUrl.searchParams;
    const format = sp.get("format");
    const operationFilter = sp.get("operationType") ?? "RENOVACION";

    const rows = await listPlanChanges({
      status: sp.get("status") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      userId: sp.get("userId") ?? undefined,
      signed: sp.get("signed") ?? undefined,
      operationType: operationFilter === "all" ? undefined : operationFilter,
    });

    const renewals = rows.filter((r) =>
      r.operationType === "RENOVACION" || r.operationType === "RENOVACION_CAMBIO_PLAN"
    );

    const data = operationFilter === "all" ? rows : renewals;

    if (format === "csv" || format === "excel") {
      const header =
        "Cliente,Contrato,Tipo,Plan anterior,Nuevo plan,Precio,Fecha firma,Fin permanencia,Estado,Documento\n";
      const lines = data.map((r) =>
        [
          r.customer.name,
          r.customer.contract,
          OPERATION_TYPE_LABELS[r.operationType] ?? r.operationType,
          r.previousPlanName,
          r.newPlanName,
          Number(r.newMonthlyUsd).toFixed(2),
          fmtDate(r.signedAt ?? r.requestDate),
          fmtDate(r.newPermanenceEnd),
          PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status,
          r.addendumNumber ?? "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      );
      return new NextResponse(header + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="renovaciones.csv"',
        },
      });
    }

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Reporte — Renovaciones contractuales", 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [["Cliente", "Contrato", "Tipo", "Plan ant.", "Plan nuevo", "Precio", "Firma", "Estado", "Doc."]],
        body: data.map((r) => [
          r.customer.name,
          r.customer.contract,
          OPERATION_TYPE_LABELS[r.operationType] ?? r.operationType,
          r.previousPlanName,
          r.newPlanName,
          formatUsd(Number(r.newMonthlyUsd)),
          fmtDate(r.signedAt ?? r.requestDate),
          PLAN_CHANGE_STATUS_LABELS[r.status] ?? r.status,
          r.addendumNumber ?? "—",
        ]),
        styles: { fontSize: 7 },
      });
      return new NextResponse(new Uint8Array(doc.output("arraybuffer")), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="renovaciones.pdf"',
        },
      });
    }

    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
