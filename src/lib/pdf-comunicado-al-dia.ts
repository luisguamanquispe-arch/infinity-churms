import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME } from "@/lib/constants";
import { formatUsd } from "@/lib/liquidation";
import { PAID_IN_FULL_NOTICE } from "@/lib/services/paid-in-full-notice";

export function generatePaidInFullPdf(params: {
  customer: { name: string; contract: string; cedula: string };
  payments: {
    paymentDate: Date;
    amount: unknown;
    fenixDocument: string;
    paymentMethod: string | null;
  }[];
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 22;

  doc.setFontSize(16);
  doc.setTextColor(11, 31, 58);
  doc.text(PAID_IN_FULL_NOTICE.title, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(0, 169, 181);
  doc.text(APP_NAME, pageWidth / 2, y, { align: "center" });
  y += 12;

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Contrato: ${params.customer.contract}`, margin, y);
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-VE")}`, pageWidth - margin, y, {
    align: "right",
  });
  y += 12;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(PAID_IN_FULL_NOTICE.greeting, margin, y);
  y += 7;

  for (const paragraph of [
    PAID_IN_FULL_NOTICE.intro,
    PAID_IN_FULL_NOTICE.body,
    PAID_IN_FULL_NOTICE.reminder,
  ]) {
    const lines = doc.splitTextToSize(paragraph, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  doc.setFont("helvetica", "bold");
  doc.text(PAID_IN_FULL_NOTICE.thanks, margin, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  const closing = doc.splitTextToSize(PAID_IN_FULL_NOTICE.closing, contentWidth);
  doc.text(closing, margin, y);
  y += closing.length * 5 + 10;

  if (params.payments.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Pagos registrados (sistema Fenix)", margin, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Recibo / Factura Fenix", "Método", "Valor USD"]],
      body: params.payments.map((p) => [
        p.paymentDate.toLocaleDateString("es-VE"),
        p.fenixDocument,
        p.paymentMethod ?? "—",
        formatUsd(Number(p.amount)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 169, 181], textColor: 255 },
      margin: { left: margin, right: margin },
      columnStyles: { 3: { halign: "right" } },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(11, 31, 58);
  doc.text(PAID_IN_FULL_NOTICE.company, margin, y);
  y += 6;
  doc.text(PAID_IN_FULL_NOTICE.department, margin, y);
  y += 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(0, 169, 181);
  doc.text(`"${PAID_IN_FULL_NOTICE.tagline}"`, margin, y);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${params.customer.name} · Cédula ${params.customer.cedula} · Lista blanca cobranza`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" }
  );

  return doc;
}

export function paidInFullPdfBuffer(params: Parameters<typeof generatePaidInFullPdf>[0]) {
  return Buffer.from(generatePaidInFullPdf(params).output("arraybuffer"));
}
