import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Customer, PlanChange } from "@prisma/client";

const DEFAULT_DECLARATION =
  "El cliente solicita y acepta voluntariamente la modificación de su plan de servicio. " +
  "A partir de la aceptación y firma del presente adendum, se establece un nuevo período de permanencia " +
  "asociado al nuevo plan contratado, manteniéndose vigentes las demás condiciones del contrato original " +
  "que no hayan sido modificadas expresamente por este documento.";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-VE");
}

function fmtUsd(n: number | string): string {
  return `$${Number(n).toFixed(2)}`;
}

export function generateAdendumPdf(params: {
  planChange: PlanChange;
  customer: Customer;
  declarationText?: string | null;
  processedByName?: string;
}) {
  const { planChange: pc, customer } = params;
  const doc = new jsPDF();
  const declaration = params.declarationText?.trim() || DEFAULT_DECLARATION;

  doc.setFillColor(11, 31, 58);
  doc.rect(14, 12, 182, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text("ADENDUM AL CONTRATO DE PRESTACIÓN", 105, 22, { align: "center" });
  doc.text("DE SERVICIO DE INTERNET", 105, 30, { align: "center" });
  doc.setFontSize(9);
  doc.text(pc.addendumNumber ?? "BORRADOR", 105, 38, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Fecha documento: ${fmtDate(pc.confirmedAt ?? pc.requestDate)}`, 14, 48);

  autoTable(doc, {
    startY: 54,
    head: [["DATOS DEL CLIENTE", ""]],
    body: [
      ["Nombre completo", customer.name],
      ["Cédula/RUC", customer.cedula],
      ["Dirección", customer.address],
      ["Teléfono", customer.phone ?? "—"],
      ["Correo", customer.email ?? "—"],
      ["N° Contrato", customer.contract],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });

  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [["CONTRATO ORIGINAL", ""]],
    body: [
      ["N° Contrato", customer.contract],
      ["Fecha contrato original", fmtDate(pc.originalContractDate)],
      ["Plan anterior", pc.previousPlanName],
      ["Velocidad anterior", pc.previousSpeedMbps ? `${pc.previousSpeedMbps} Mbps` : "—"],
      ["Precio anterior", fmtUsd(Number(pc.previousMonthlyUsd))],
      [
        "Permanencia anterior",
        pc.previousPermanenceStart
          ? `${fmtDate(pc.previousPermanenceStart)} → ${fmtDate(pc.previousPermanenceEnd)}`
          : "—",
      ],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [["MODIFICACIÓN SOLICITADA", ""]],
    body: [
      ["Nuevo plan", pc.newPlanName],
      ["Nueva velocidad", `${pc.newSpeedMbps} Mbps`],
      ["Nuevo precio mensual", fmtUsd(Number(pc.newMonthlyUsd))],
      ...(Number(pc.newMonthlyUsd) < Number(pc.standardMonthlyUsd)
        ? [
            ["Precio estándar", fmtUsd(Number(pc.standardMonthlyUsd))],
            ["Descuento aplicado", fmtUsd(Number(pc.standardMonthlyUsd) - Number(pc.newMonthlyUsd))],
            ["Motivo descuento", pc.discountReason ?? "—"],
          ]
        : []),
      ["Fecha de modificación", fmtDate(pc.signedAt ?? pc.confirmedAt ?? pc.requestDate)],
      ["Nueva permanencia", `${pc.permanenceMonths} meses`],
      ["Inicio nueva permanencia", fmtDate(pc.newPermanenceStart)],
      ["Fin nueva permanencia", fmtDate(pc.newPermanenceEnd)],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARACIÓN CONTRACTUAL", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(declaration, 182);
  doc.text(lines, 14, y + 7);

  const sigY = y + 7 + lines.length * 5 + 12;
  if (pc.signatureImageData?.startsWith("data:image")) {
    try {
      doc.addImage(pc.signatureImageData, "PNG", 14, sigY - 18, 70, 22);
    } catch {
      doc.line(14, sigY, 90, sigY);
    }
  } else {
    doc.line(14, sigY, 90, sigY);
  }
  doc.setFontSize(9);
  doc.text("Firma del cliente", 14, sigY + 6);
  doc.text(pc.clientSignatureName?.trim() || "_______________________________", 14, sigY + 12);
  doc.text(`C.I.: ${pc.clientSignatureCedula ?? customer.cedula}`, 14, sigY + 18);
  doc.text(`Fecha y hora firma: ${pc.signedAt ? new Date(pc.signedAt).toLocaleString("es-VE") : "—"}`, 14, sigY + 24);

  doc.line(110, sigY, 190, sigY);
  doc.text("Infinity Internet", 110, sigY + 6);
  doc.text(params.processedByName ?? "_______________________________", 110, sigY + 12);
  doc.text(`Procesado: ${fmtDate(pc.signedAt ?? pc.confirmedAt)}`, 110, sigY + 18);

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Documento generado electrónicamente. El historial contractual original permanece vigente como referencia.",
    14,
    285
  );

  return Buffer.from(doc.output("arraybuffer"));
}
