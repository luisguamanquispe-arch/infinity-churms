import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, SUSPENSION_POLICIES, INSTALLATION_PRORATION_LABEL, installationProrationDetail } from "@/lib/constants";
import type { Cancellation, CancellationCharge, CancellationEquipment, Customer } from "@prisma/client";

export function generatePreliquidacionPdf(params: {
  docNumber: string;
  cancellation: Cancellation;
  customer: Customer;
  equipment: CancellationEquipment[];
  charges: CancellationCharge[];
  reasonLabel: string;
}) {
  const doc = new jsPDF();
  const { cancellation: c, customer, charges } = params;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setTextColor(11, 31, 58);
  doc.text("PRE-LIQUIDACIÓN DE BAJA DE SERVICIO", pageWidth / 2, 18, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(0, 169, 181);
  doc.text(APP_NAME, pageWidth / 2, 25, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(`N° Documento: ${params.docNumber}`, 14, 34);
  doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-VE")}`, 14, 40);
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 120, 34);
  doc.text(`Estado: Informativo — valores a pagar`, 120, 40);

  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const aviso = doc.splitTextToSize(
    "AVISO: Este documento es únicamente informativo sobre los montos a cancelar. " +
      "En esta etapa el cliente aún no entrega equipos. La recepción de equipos y el acta correspondiente " +
      "se tramitarán después del pago de esta pre-liquidación.",
    180
  );
  doc.text(aviso, 14, 46);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.text("Datos del cliente", 14, 58);

  autoTable(doc, {
    startY: 62,
    theme: "plain",
    styles: { fontSize: 9 },
    body: [
      ["Contrato", customer.contract],
      ["Cliente", customer.name],
      ["Cédula", customer.cedula],
      ["Dirección", customer.address],
      ["Plan", customer.planName],
      ["Alta servicio", customer.serviceStartDate.toLocaleDateString("es-VE")],
      ["Meses cumplidos", `${c.monthsCompleted} meses`],
      ["Motivo de baja", params.reasonLabel],
      ...(customer.hasTvStreaming && customer.tvStreamingSince
        ? [["TV Streams desde", customer.tvStreamingSince.toLocaleDateString("es-VE")]]
        : []),
    ],
  });

  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFontSize(11);
  doc.text("Detalle de valores a pagar", 14, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Los equipos prestados no se incluyen en este cálculo.", 14, y + 4);
  doc.setTextColor(0, 0, 0);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Detalle", "Valor USD"]],
    body: [
      [
        INSTALLATION_PRORATION_LABEL,
        installationProrationDetail(c.monthsCompleted),
        Number(c.permanenceAmount).toFixed(2),
      ],
      [
        "TV Streams",
        customer.hasTvStreaming ? "Servicio de TV activo" : "No aplica",
        Number(c.tvAmount).toFixed(2),
      ],
      ["Mensualidades pendientes", "Saldo de facturación pendiente", Number(c.monthlyAmount).toFixed(2)],
      ...charges.map((ch) => ["Otros cargos", ch.concept, Number(ch.amount).toFixed(2)]),
      [{ content: "TOTAL A PAGAR", colSpan: 2, styles: { fontStyle: "bold" } }, Number(c.totalAmount).toFixed(2)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [11, 31, 58] },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(255, 251, 235);
  doc.rect(14, y, 182, 8 + SUSPENSION_POLICIES.length * 14, "F");
  doc.setFontSize(11);
  doc.setTextColor(180, 83, 9);
  doc.text("Políticas de suspensión y cancelación", 18, y + 7);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);

  let policyY = y + 14;
  SUSPENSION_POLICIES.forEach((policy, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${policy}`, 175);
    doc.text(lines, 18, policyY);
    policyY += lines.length * 5 + 3;
  });

  policyY += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const footer = doc.splitTextToSize(
    "Pre-liquidación informativa de montos a cancelar. No constituye acta de entrega de equipos. " +
      "Los valores pueden ajustarse si se registran cargos adicionales antes del pago. " +
      "Una vez cancelado el total indicado, se coordinará la entrega de equipos en oficina según las políticas vigentes.",
    180
  );
  doc.text(footer, 14, policyY);

  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const signY = policyY + footer.length * 4 + 15;
  doc.line(14, signY, 90, signY);
  doc.text("Firma cliente (conforme montos informados)", 14, signY + 6);
  doc.text("_______________________________", 14, signY + 12);

  doc.line(110, signY, 190, signY);
  doc.text("Firma Infinity", 110, signY + 6);
  doc.text("_______________________________", 110, signY + 12);

  return Buffer.from(doc.output("arraybuffer"));
}
