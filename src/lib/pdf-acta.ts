import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Cancellation, CancellationEquipment, CancellationCharge, Customer, CancellationPayment } from "@prisma/client";

export async function generateActaPdf(params: {
  cancellation: Cancellation;
  customer: Customer;
  equipment: CancellationEquipment[];
  charges: CancellationCharge[];
  payment: CancellationPayment | null;
  verifyUrl: string;
  qrDataUrl?: string;
}) {
  const doc = new jsPDF();
  const { cancellation: c, customer, equipment, charges, payment } = params;

  doc.setFontSize(16);
  doc.text("ACTA DE ENTREGA Y RECEPCIÓN", 14, 20);
  doc.setFontSize(10);
  doc.text(`N° ${c.actaNumber ?? "—"}`, 14, 28);

  doc.text(`Cliente: ${customer.name} (${customer.code})`, 14, 38);
  doc.text(`Cédula: ${customer.cedula}`, 14, 44);
  doc.text(`Fecha solicitud: ${c.requestDate.toLocaleDateString("es-VE")}`, 14, 50);

  autoTable(doc, {
    startY: 58,
    head: [["Equipo", "Serie", "Estado"]],
    body: equipment.map((e) => [
      e.type,
      e.serial ?? "—",
      e.delivered ? (e.condition ?? "BUENO") : "NO ENTREGADO",
    ]),
  });

  const y1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: y1,
    head: [["Concepto", "Valor USD"]],
    body: [
      ["Permanencia", Number(c.permanenceAmount).toFixed(2)],
      ["TV Streams", Number(c.tvAmount).toFixed(2)],
      ["Mensualidades", Number(c.monthlyAmount).toFixed(2)],
      ["Equipos", Number(c.equipmentAmount).toFixed(2)],
      ...charges.map((ch) => [ch.concept, Number(ch.amount).toFixed(2)]),
      ["TOTAL", Number(c.totalAmount).toFixed(2)],
    ],
  });

  const y2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.text(`Factura: ${payment?.invoiceNumber ?? c.invoiceNumber ?? "—"}`, 14, y2);

  if (params.qrDataUrl) {
    doc.addImage(params.qrDataUrl, "PNG", 150, y2 - 5, 40, 40);
    doc.setFontSize(8);
    doc.text("Verificar:", 150, y2 + 40);
    doc.text(params.verifyUrl.slice(0, 40), 14, y2 + 48);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
