import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL, getEquipmentReportStatus } from "@/lib/constants";
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
}) {
  const doc = new jsPDF();
  const { cancellation: c, customer, equipment, charges, payment } = params;
  const physicalCode = c.actaPhysicalCode ?? "—";

  doc.setFillColor(11, 31, 58);
  doc.rect(14, 12, 182, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text("ACTA DE RECEPCIÓN DE EQUIPOS", 105, 20, { align: "center" });
  doc.setFontSize(8);
  doc.text("CÓDIGO IDENTIFICACIÓN FÍSICA", 105, 27, { align: "center" });
  doc.setFontSize(13);
  doc.text(physicalCode, 105, 33, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`N° Acta: ${c.actaNumber ?? "—"}`, 14, 42);
  doc.setFontSize(9);
  doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-VE")}`, 14, 48);
  doc.text(`Contrato: ${customer.contract}`, 120, 42);
  doc.text(`Cédula: ${customer.cedula}`, 120, 48);

  doc.setFontSize(10);
  doc.text(`Cliente: ${customer.name}`, 14, 56);
  doc.text(`Dirección: ${customer.address}`, 14, 62);
  doc.text(`Plan: ${customer.planName}`, 14, 68);
  doc.text(`Motivo baja: ${params.reasonLabel}`, 14, 74);
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 14, 80);

  autoTable(doc, {
    startY: 86,
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

  autoTable(doc, {
    startY: y1,
    head: [["Concepto liquidación", "Valor USD"]],
    body: [
      [INSTALLATION_PRORATION_LABEL, Number(c.permanenceAmount).toFixed(2)],
      [STREAMS_SUPPORT_LABEL, Number(c.tvAmount).toFixed(2)],
      ["Mensualidades", Number(c.monthlyAmount).toFixed(2)],
      ...charges.map((ch) => [ch.concept, Number(ch.amount).toFixed(2)]),
      ["TOTAL", Number(c.totalAmount).toFixed(2)],
    ],
    styles: { fontSize: 9 },
  });

  const y2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  doc.setFontSize(10);
  doc.text(`Factura pago: ${payment?.invoiceNumber ?? c.invoiceNumber ?? "—"}`, 14, y2);

  const sigY = y2 + 20;
  doc.line(14, sigY, 90, sigY);
  doc.setFontSize(9);
  doc.text("Firma del cliente", 14, sigY + 6);
  doc.text(c.clientSignature?.trim() || "_______________________________", 14, sigY + 12);
  doc.text(`C.I.: ${customer.cedula}`, 14, sigY + 18);

  doc.line(110, sigY, 190, sigY);
  doc.text("Firma Infinity / Técnico", 110, sigY + 6);
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
    285
  );

  return Buffer.from(doc.output("arraybuffer"));
}
