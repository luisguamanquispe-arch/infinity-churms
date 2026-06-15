import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { INSTALLATION_PRORATION_LABEL, STREAMS_SUPPORT_LABEL } from "@/lib/constants";
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

  doc.setFontSize(16);
  doc.text("ACTA DE RECEPCIÓN DE EQUIPOS", 14, 18);
  doc.setFontSize(11);
  doc.text(`N° Acta: ${c.actaNumber ?? "—"}`, 14, 26);
  doc.setFontSize(9);
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-VE")}`, 14, 32);

  doc.setFontSize(10);
  doc.text(`Contrato: ${customer.contract}`, 14, 42);
  doc.text(`Cliente: ${customer.name}`, 14, 48);
  doc.text(`Cédula: ${customer.cedula}`, 14, 54);
  doc.text(`Dirección: ${customer.address}`, 14, 60);
  doc.text(`Plan: ${customer.planName}`, 14, 66);
  doc.text(`Motivo baja: ${params.reasonLabel}`, 14, 72);
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 14, 78);

  autoTable(doc, {
    startY: 84,
    head: [["Tipo", "Marca", "Modelo", "Serie", "Estado", "Observaciones"]],
    body: equipment.map((e) => [
      e.type,
      e.brand ?? "—",
      e.model ?? "—",
      e.serial ?? "—",
      e.delivered ? (e.condition ?? "BUENO") : "NO ENTREGADO",
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
  }

  return Buffer.from(doc.output("arraybuffer"));
}
