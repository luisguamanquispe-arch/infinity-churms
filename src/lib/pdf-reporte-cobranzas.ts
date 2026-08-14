import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME } from "@/lib/constants";
import { drawPdfBrandFooter, drawPdfBrandHeader } from "@/lib/pdf-branding";
import { formatUsd } from "@/lib/liquidation";
import type {
  CarteraReportRow,
  CollectionReportResult,
  GestionReportRow,
  PagoReportRow,
} from "@/lib/services/collection-reports";

const VIEW_TITLES = {
  cartera: "Cartera morosa",
  gestiones: "Gestiones de cobranza",
  pagos: "Pagos Fenix registrados",
} as const;

function filterSummary(report: CollectionReportResult): string[] {
  const lines: string[] = [];
  const { filters } = report;
  if (filters.from || filters.to) {
    const from = filters.from ? new Date(filters.from).toLocaleDateString("es-VE") : "—";
    const to = filters.to ? new Date(filters.to).toLocaleDateString("es-VE") : "—";
    lines.push(`Período: ${from} — ${to}`);
  }
  if (filters.zone) lines.push(`Zona: ${filters.zone}`);
  if (filters.managementType) lines.push(`Tipo gestión: ${filters.managementType}`);
  if (filters.result) lines.push(`Resultado: ${filters.result}`);
  if (filters.prelegalOnly) lines.push("Solo mora prelegal (+90 días)");
  if (filters.view === "cartera" && !filters.morosoOnly) lines.push("Incluye clientes sin saldo");
  return lines;
}

export function generateCollectionReportPdf(report: CollectionReportResult) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = drawPdfBrandHeader(doc, {
    title: "Reporte personalizado — Gestión de Cobranzas",
    subtitle: VIEW_TITLES[report.filters.view],
    yStart: 10,
  });

  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generado: ${new Date().toLocaleString("es-VE")}`, margin, y);
  doc.text(APP_NAME, pageWidth - margin, y, { align: "right" });
  y += 6;

  for (const line of filterSummary(report)) {
    doc.text(line, margin, y);
    y += 4;
  }
  y += 4;

  const { kpis } = report;
  autoTable(doc, {
    startY: y,
    head: [["Clientes morosos", "Cartera pendiente", "Gestiones", "Pagos período", "Monto pagos", "Promesas vigentes", "Prelegal"]],
    body: [[
      String(kpis.clientesMorosos),
      formatUsd(kpis.carteraPendiente),
      String(kpis.gestionesPeriodo),
      String(kpis.pagosPeriodo),
      formatUsd(kpis.montoPagosPeriodo),
      String(kpis.promesasVigentes),
      String(kpis.prelegalCount),
    ]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 31, 58], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  if (report.filters.view === "cartera") {
    autoTable(doc, {
      startY: y,
      head: [["Contrato", "Cliente", "Zona", "Plan", "Saldo", "Mora", "Prelegal", "Detalle cargos", "Última gestión"]],
      body: (report.rows as CarteraReportRow[]).map((row) => [
        row.contract,
        row.name,
        row.zone,
        row.planName,
        formatUsd(row.pendingBalance),
        `${row.overdueDays} d`,
        row.isPrelegal ? "Sí" : "No",
        row.chargesSummary,
        row.lastActionDate
          ? `${new Date(row.lastActionDate).toLocaleDateString("es-VE")} · ${row.lastActionResult ?? ""}`
          : "—",
      ]),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [0, 169, 181], textColor: 255 },
      columnStyles: { 7: { cellWidth: 60 } },
      margin: { left: margin, right: margin },
    });
  } else if (report.filters.view === "gestiones") {
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Contrato", "Cliente", "Zona", "Saldo", "Mora", "Tipo", "Resultado", "Agente", "Promesa"]],
      body: (report.rows as GestionReportRow[]).map((row) => [
        new Date(row.actionDate).toLocaleString("es-VE"),
        row.contract,
        row.customerName,
        row.zone,
        formatUsd(row.pendingBalance),
        `${row.overdueDays} d`,
        row.managementTypeLabel,
        row.resultLabel,
        row.userName,
        row.promiseDate
          ? `${new Date(row.promiseDate).toLocaleDateString("es-VE")}${row.promiseAmount != null ? ` · ${formatUsd(row.promiseAmount)}` : ""}`
          : "—",
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [0, 169, 181], textColor: 255 },
      margin: { left: margin, right: margin },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Contrato", "Cliente", "Zona", "Valor", "Fenix", "Método", "Registró"]],
      body: (report.rows as PagoReportRow[]).map((row) => [
        new Date(row.paymentDate).toLocaleDateString("es-VE"),
        row.contract,
        row.customerName,
        row.zone,
        formatUsd(row.amount),
        row.fenixDocument,
        row.paymentMethod ?? "—",
        row.userName,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [0, 169, 181], textColor: 255 },
      margin: { left: margin, right: margin },
    });
  }

  drawPdfBrandFooter(doc, `${report.rows.length} registro(s) · ${APP_NAME}`);

  return doc;
}

export function collectionReportPdfBuffer(report: CollectionReportResult) {
  return Buffer.from(generateCollectionReportPdf(report).output("arraybuffer"));
}
