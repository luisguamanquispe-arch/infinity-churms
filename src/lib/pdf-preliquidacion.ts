import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, SUSPENSION_POLICIES, INSTALLATION_PRORATION_LABEL, installationProrationDetail, STREAMS_SUPPORT_LABEL, STREAMS_SUPPORT_SINCE_LABEL } from "@/lib/constants";
import { drawPdfBrandFooter, drawPdfBrandHeader } from "@/lib/pdf-branding";
import { getCustomerTypeLabel, technologyLabel } from "@/lib/permanence";
import type { Cancellation, CancellationCharge, CancellationEquipment, Customer } from "@prisma/client";

export function generatePreliquidacionPdf(params: {
  docNumber: string;
  cancellation: Cancellation;
  customer: Customer;
  equipment: CancellationEquipment[];
  charges: CancellationCharge[];
  reasonLabel: string;
  lineItems?: { concept: string; amount: number }[];
  version?: number;
  totalOverride?: number;
}) {
  const doc = new jsPDF();
  const { cancellation: c, customer, charges } = params;

  let y = drawPdfBrandHeader(doc, {
    title: "PRE-LIQUIDACIÓN DE BAJA DE SERVICIO",
    subtitle: APP_NAME,
  });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(`N° Documento: ${params.docNumber}`, 14, y);
  if (params.version) {
    doc.text(`Versión: V${params.version}`, 14, y + 6);
  }
  doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-VE")}`, 14, y + (params.version ? 12 : 6));
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 120, y);
  doc.text(`Estado: Informativo — valores a pagar`, 120, y + (params.version ? 12 : 6));

  y += params.version ? 18 : 12;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const aviso = doc.splitTextToSize(
    "AVISO: Este documento es únicamente informativo sobre los montos a cancelar. " +
      "En esta etapa el cliente aún no entrega equipos. La recepción de equipos y el acta correspondiente " +
      "se tramitarán después del pago de esta pre-liquidación.",
    180
  );
  doc.text(aviso, 14, y);
  doc.setTextColor(0, 0, 0);

  y += aviso.length * 4 + 8;
  doc.setFontSize(11);
  doc.text("Datos del cliente", 14, y);

  autoTable(doc, {
    startY: y + 4,
    theme: "plain",
    styles: { fontSize: 9 },
    body: [
      ["Contrato", customer.contract],
      ["Cliente", customer.name],
      ["Cédula", customer.cedula],
      ["Zona", customer.zone ?? "—"],
      ["Dirección", customer.address],
      ["Plan", customer.planName],
      ["Tipo cliente", getCustomerTypeLabel(customer)],
      ["Tecnología original", technologyLabel(customer.originTechnology)],
      ["Tecnología actual", technologyLabel(customer.currentTechnology)],
      ["Alta servicio (original)", customer.serviceStartDate.toLocaleDateString("es-VE")],
      [
        "Fecha migración fibra",
        customer.fiberMigrationDate
          ? customer.fiberMigrationDate.toLocaleDateString("es-VE")
          : "—",
      ],
      [
        "Fecha instalación fibra",
        customer.fiberInstallDate
          ? customer.fiberInstallDate.toLocaleDateString("es-VE")
          : "—",
      ],
      [
        "Inicio permanencia fibra",
        c.permanenceStartDate
          ? c.permanenceStartDate.toLocaleDateString("es-VE")
          : "—",
      ],
      ["Meses en fibra / servicio", `${c.monthsCompleted} meses`],
      [
        "Estado permanencia",
        c.fiberInstallPending ? "NO CUMPLE PERMANENCIA" : "PERMANENCIA CUMPLIDA",
      ],
      ["Motivo de baja", params.reasonLabel],
      ...(customer.hasTvStreaming && customer.tvStreamingSince
        ? [[STREAMS_SUPPORT_SINCE_LABEL, customer.tvStreamingSince.toLocaleDateString("es-VE")]]
        : []),
    ],
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

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
    body: params.lineItems?.length
      ? [
          ...params.lineItems.map((l) => [l.concept, "", l.amount.toFixed(2)]),
          [
            { content: "TOTAL PRELIQUIDADO", colSpan: 2, styles: { fontStyle: "bold" } },
            (params.totalOverride ?? Number(c.totalAmount)).toFixed(2),
          ],
        ]
      : [
          [
            INSTALLATION_PRORATION_LABEL,
            installationProrationDetail(c.monthsCompleted),
            Number(c.permanenceAmount).toFixed(2),
          ],
          [
            STREAMS_SUPPORT_LABEL,
            customer.hasTvStreaming ? "Soporte de Streams activo" : "No aplica",
            Number(c.tvAmount).toFixed(2),
          ],
          ["Mensualidades pendientes", "Saldo de facturación pendiente", Number(c.monthlyAmount).toFixed(2)],
          ...charges.map((ch) => ["Otros cargos", ch.concept, Number(ch.amount).toFixed(2)]),
          [
            { content: "TOTAL A PAGAR", colSpan: 2, styles: { fontStyle: "bold" } },
            Number(c.totalAmount).toFixed(2),
          ],
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

  drawPdfBrandFooter(doc, "Pre-liquidación informativa de baja de servicio");

  return Buffer.from(doc.output("arraybuffer"));
}
