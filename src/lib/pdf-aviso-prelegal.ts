import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME } from "@/lib/constants";
import { drawPdfBrandFooter, drawPdfBrandHeader } from "@/lib/pdf-branding";
import { formatUsd } from "@/lib/liquidation";
import {
  PRELEGAL_NOTICE,
  buildPrelegalOverdueSummary,
  type PrelegalOverdueSummary,
} from "@/lib/services/overdue";
import type { CollectionChargeView } from "@/lib/services/collection-charges";

export function generatePrelegalNoticePdf(
  customer: {
    name: string;
    contract: string;
    cedula: string;
    address: string;
    zone: string;
    pendingBalance: number | string;
    overdueSince: Date | string | null;
    planName: string;
    hasTvStreaming: boolean;
    tvStreamingSince: Date | string | null;
    equipment: { type: string; brand?: string | null; model?: string | null }[];
  },
  equipmentTariffs: { type: string; notReturnedUsd: number | string }[],
  collectionCharges?: CollectionChargeView[]
) {
  const summary = buildPrelegalOverdueSummary({
    ...customer,
    equipmentTariffs,
    collectionCharges,
  });

  if (!summary) {
    throw new Error("NOT_PRELEGAL");
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = drawPdfBrandHeader(doc, {
    title: PRELEGAL_NOTICE.title,
    subtitle: APP_NAME,
  });

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Contrato: ${customer.contract}`, margin, y);
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-VE")}`, pageWidth - margin, y, {
    align: "right",
  });
  y += 10;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(PRELEGAL_NOTICE.greeting, margin, y);
  y += 7;

  const intro = doc.splitTextToSize(
    PRELEGAL_NOTICE.intro
      .replace(/\*\*/g, "")
      .replace("90 días", `${summary.overdueDays} días`),
    contentWidth
  );
  doc.text(intro, margin, y);
  y += intro.length * 5 + 6;

  y = renderOverdueValues(doc, summary, margin, y, contentWidth);

  doc.setFontSize(9);
  doc.text(`Cliente: ${customer.name}`, margin, y);
  y += 5;
  doc.text(`Cédula: ${customer.cedula}`, margin, y);
  y += 5;
  doc.text(`Dirección: ${customer.address} · ${customer.zone}`, margin, y);
  y += 8;

  const contractIntro = doc.splitTextToSize(
    PRELEGAL_NOTICE.contractIntro.replace(/\*\*/g, ""),
    contentWidth
  );
  doc.text(contractIntro, margin, y);
  y += contractIntro.length * 5 + 4;

  PRELEGAL_NOTICE.bullets.forEach((bullet) => {
    const lines = doc.splitTextToSize(`• ${bullet.replace(/\*\*/g, "")}`, contentWidth - 4);
    doc.text(lines, margin + 2, y);
    y += lines.length * 5 + 2;
  });

  if (summary.equipmentExposure.length > 0) {
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Referencia — valor equipos en comodato (si no se devuelven):", margin, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Equipo", "Valor factura USD"]],
      body: summary.equipmentExposure.map((e) => [e.label, formatUsd(e.amount)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [11, 31, 58], textColor: 255 },
      margin: { left: margin, right: margin },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Total equipos: ${formatUsd(summary.totalEquipmentExposure)}`,
      margin,
      y
    );
    y += 10;
    doc.setTextColor(0, 0, 0);
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text(PRELEGAL_NOTICE.callToAction, margin, y);
  doc.setFont("helvetica", "normal");
  y += 7;

  const invitation = doc.splitTextToSize(PRELEGAL_NOTICE.invitation, contentWidth);
  doc.text(invitation, margin, y);
  y += invitation.length * 5 + 12;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 31, 58);
  doc.text(PRELEGAL_NOTICE.company, margin, y);
  y += 6;
  doc.text(PRELEGAL_NOTICE.department, margin, y);
  y += 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(0, 169, 181);
  doc.text(`"${PRELEGAL_NOTICE.tagline}"`, margin, y);

  drawPdfBrandFooter(
    doc,
    `Cobranza prelegal (+${summary.overdueDays} días de mora) · ${APP_NAME}`
  );

  return doc;
}

function renderOverdueValues(
  doc: jsPDF,
  summary: PrelegalOverdueSummary,
  margin: number,
  y: number,
  contentWidth: number
) {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(PRELEGAL_NOTICE.valuesIntro, margin, y);
  doc.setFont("helvetica", "normal");
  y += 7;

  if (summary.overdueSince) {
    doc.setFontSize(9);
    doc.text(
      `Mora desde: ${summary.overdueSince.toLocaleDateString("es-VE")} (${summary.overdueDays} días)`,
      margin,
      y
    );
    y += 8;
  }

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Detalle", "Valor USD"]],
    body: [
      ...summary.overdueItems.map((i) => [i.concept, i.detail, formatUsd(i.amount)]),
      ["TOTAL VENCIDO", "Según registro Infinity", formatUsd(summary.totalOverdue)],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 169, 181], textColor: 255 },
    margin: { left: margin, right: margin },
    columnStyles: { 2: { halign: "right" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  return y;
}

export function prelegalNoticePdfBuffer(
  customer: Parameters<typeof generatePrelegalNoticePdf>[0],
  equipmentTariffs: Parameters<typeof generatePrelegalNoticePdf>[1],
  collectionCharges?: Parameters<typeof generatePrelegalNoticePdf>[2]
) {
  return Buffer.from(
    generatePrelegalNoticePdf(customer, equipmentTariffs, collectionCharges).output("arraybuffer")
  );
}
