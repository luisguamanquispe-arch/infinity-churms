import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL, getEquipmentReportStatus, COMPANY_NAME } from "@/lib/constants";
import { drawPdfBrandFooter, drawPdfBrandHeader } from "@/lib/pdf-branding";
import { getCustomerTypeLabel, technologyLabel } from "@/lib/permanence";
import type {
  Cancellation,
  CancellationEquipment,
  CancellationCharge,
  Customer,
  CancellationPayment,
} from "@prisma/client";

export async function generateActaPdf(params: {
  cancellation: Cancellation;
  customer: Customer;
  equipment: CancellationEquipment[];
  charges: CancellationCharge[];
  payment: CancellationPayment | null;
  verifyUrl: string;
  qrDataUrl?: string;
  reasonLabel: string;
  finalLiquidation?: {
    preliquidacionTotal: number;
    equipmentAdjustment: number;
    totalAmount: number;
    preliquidacionVersion?: number;
    signatureImageData?: string | null;
    clientSignature?: string | null;
  } | null;
}) {
  const doc = new jsPDF();
  const { cancellation: c, customer, equipment, charges, payment } = params;
  const physicalCode = c.actaPhysicalCode ?? "—";

  const contentY = drawPdfBrandHeader(doc, {
    banner: true,
    title: "ACTA DE RECEPCIÓN DE EQUIPOS",
    subtitle: "CÓDIGO IDENTIFICACIÓN FÍSICA",
    docRef: physicalCode,
  });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`N° Acta: ${c.actaNumber ?? "—"}`, 14, contentY);
  doc.setFontSize(9);
  doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-VE")}`, 14, contentY + 6);
  doc.text(`Contrato: ${customer.contract}`, 120, contentY);
  doc.text(`Cédula: ${customer.cedula}`, 120, contentY + 6);

  doc.setFontSize(10);
  doc.text(`Cliente: ${customer.name}`, 14, contentY + 14);
  doc.text(`Dirección: ${customer.address}`, 14, contentY + 20);
  doc.text(`Plan: ${customer.planName}`, 14, contentY + 26);
  doc.text(`Motivo baja: ${params.reasonLabel}`, 14, contentY + 32);
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 14, contentY + 38);
  doc.setFontSize(8);
  doc.text(`Tecnología: ${technologyLabel(customer.originTechnology)} → ${technologyLabel(customer.currentTechnology)}`, 14, contentY + 44);
  doc.text(`Permanencia fibra desde: ${c.permanenceStartDate?.toLocaleDateString("es-VE") ?? "—"} · ${c.monthsCompleted} meses`, 14, contentY + 49);
  doc.text(`Estado: ${c.fiberInstallPending ? "Instalación pendiente" : "Permanencia cumplida"}`, 14, contentY + 54);
  doc.setFontSize(10);

  autoTable(doc, {
    startY: contentY + 60,
    head: [["Tipo", "Marca", "Modelo", "Serie", "Estado", "Observaciones"]],
    body: equipment.map((e) => [
      e.type,
      e.brand ?? "—",
      e.model ?? "—",
      e.serial ?? "—",
      getEquipmentReportStatus(e.delivered, e.condition),
      e.notes ?? "—",
    ]),
    styles: { fontSize: 8 },
  });

  const y1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const fl = params.finalLiquidation;
  const liquidationBody = fl
    ? [
        [`Preliquidación aprobada (V${fl.preliquidacionVersion ?? 1})`, fl.preliquidacionTotal.toFixed(2)],
        ...(fl.equipmentAdjustment !== 0
          ? [["Ajuste por equipos devueltos", fl.equipmentAdjustment.toFixed(2)]]
          : []),
        ["TOTAL LIQUIDACIÓN FINAL", fl.totalAmount.toFixed(2)],
      ]
    : [
        [INSTALLATION_PRORATION_LABEL, Number(c.permanenceAmount).toFixed(2)],
        [STREAMS_SUPPORT_LABEL, Number(c.tvAmount).toFixed(2)],
        ["Mensualidades", Number(c.monthlyAmount).toFixed(2)],
        ...charges.map((ch) => [ch.concept, Number(ch.amount).toFixed(2)]),
        ["TOTAL", Number(c.totalAmount).toFixed(2)],
      ];

  autoTable(doc, {
    startY: y1,
    head: [["Concepto liquidación", "Valor USD"]],
    body: liquidationBody,
    styles: { fontSize: 9 },
  });

  const y2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  doc.setFontSize(10);
  doc.text(`Factura pago: ${payment?.invoiceNumber ?? c.invoiceNumber ?? "—"}`, 14, y2);

  const sigY = y2 + 20;
  const sigName = fl?.clientSignature?.trim() || c.clientSignature?.trim() || "";
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9);
  doc.text("Firma del cliente", 14, sigY + 6);
  if (fl?.signatureImageData?.startsWith("data:image")) {
    try {
      doc.addImage(fl.signatureImageData, "PNG", 14, sigY + 8, 70, 28);
    } catch {
      doc.text(sigName || "_______________________________", 14, sigY + 12);
    }
  } else {
    doc.text(sigName || "_______________________________", 14, sigY + 12);
  }
  doc.text(`C.I.: ${customer.cedula}`, 14, sigY + (fl?.signatureImageData ? 40 : 18));

  doc.line(110, sigY, 190, sigY);
  doc.text(`Firma ${COMPANY_NAME} / Técnico`, 110, sigY + 6);
  doc.text("_______________________________", 110, sigY + 12);

  if (params.qrDataUrl) {
    doc.addImage(params.qrDataUrl, "PNG", 150, sigY + 22, 35, 35);
    doc.setFontSize(7);
    doc.text("Verificación QR", 150, sigY + 60);
    doc.text(physicalCode, 150, sigY + 65, { maxWidth: 35 });
  }

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Conserve este código en el documento físico entregado al cliente para identificación y verificación.",
    14,
    280
  );

  drawPdfBrandFooter(doc, `Acta ${c.actaNumber ?? "—"} · Contrato ${customer.contract}`);

  return Buffer.from(doc.output("arraybuffer"));
}
