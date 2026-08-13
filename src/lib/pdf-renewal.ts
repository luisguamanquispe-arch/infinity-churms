import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Customer, PlanChange } from "@prisma/client";

const DEFAULT_RENEWAL_DECLARATION =
  "El cliente declara que desea continuar utilizando el servicio y acepta las condiciones " +
  "correspondientes al nuevo período contractual de permanencia. Las demás condiciones del " +
  "contrato original que no sean modificadas expresamente por este documento se mantienen vigentes.";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-VE");
}

function fmtUsd(n: number | string): string {
  return `$${Number(n).toFixed(2)}`;
}

export function generateRenewalPdf(params: {
  planChange: PlanChange;
  customer: Customer;
  declarationText?: string | null;
  processedByName?: string;
  digitallySigned?: boolean;
}) {
  const { planChange: pc, customer } = params;
  const doc = new jsPDF();
  const declaration = params.declarationText?.trim() || DEFAULT_RENEWAL_DECLARATION;
  const digitallySigned = params.digitallySigned ?? pc.signedDigitally;
  const isPlanChange =
    pc.operationType === "RENOVACION_CAMBIO_PLAN" ||
    (pc.previousPlanName !== pc.newPlanName ||
      Number(pc.previousMonthlyUsd) !== Number(pc.newMonthlyUsd));

  doc.setFillColor(11, 31, 58);
  doc.rect(14, 12, 182, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("RENOVACIÓN DEL CONTRATO DE PRESTACIÓN", 105, 22, { align: "center" });
  doc.text("DEL SERVICIO DE INTERNET", 105, 30, { align: "center" });
  doc.setFontSize(9);
  doc.text(pc.addendumNumber ?? "BORRADOR", 105, 38, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Fecha documento: ${fmtDate(pc.confirmedAt ?? pc.requestDate)}`, 14, 48);
  if (digitallySigned) {
    doc.setFontSize(9);
    doc.setTextColor(0, 120, 100);
    doc.text("FIRMADO DIGITALMENTE", 14, 54);
    doc.setTextColor(0, 0, 0);
  }

  autoTable(doc, {
    startY: 60,
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
    head: [["CONTRATO ANTERIOR", ""]],
    body: [
      ["N° Contrato", customer.contract],
      ["Fecha inicio", fmtDate(pc.previousPermanenceStart ?? pc.originalContractDate)],
      ["Fecha finalización", fmtDate(pc.previousPermanenceEnd)],
      ["Plan", pc.previousPlanName],
      ["Velocidad", pc.previousSpeedMbps ? `${pc.previousSpeedMbps} Mbps` : "—"],
      ["Precio mensual", fmtUsd(Number(pc.previousMonthlyUsd))],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const renewalBody: string[][] = [
    ["Fecha de renovación", fmtDate(pc.signedAt ?? pc.confirmedAt ?? pc.requestDate)],
    ["Nuevo período", `${pc.permanenceMonths} meses`],
    ["Inicio nueva permanencia", fmtDate(pc.newPermanenceStart)],
    ["Fin nueva permanencia", fmtDate(pc.newPermanenceEnd)],
    ["Plan", pc.newPlanName],
    ["Velocidad", `${pc.newSpeedMbps} Mbps`],
    ["Precio mensual", fmtUsd(Number(pc.newMonthlyUsd))],
  ];

  if (isPlanChange) {
    renewalBody.unshift(
      ["Tipo operación", "Renovación con cambio de plan"],
      ["Plan anterior", `${pc.previousPlanName} · ${fmtUsd(Number(pc.previousMonthlyUsd))}`]
    );
  } else {
    renewalBody.unshift(["Tipo operación", "Renovación sin cambio de plan"]);
  }

  autoTable(doc, {
    startY: y,
    head: [["RENOVACIÓN", ""]],
    body: renewalBody,
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 55, fontStyle: "bold" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARACIÓN", 14, y);
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

  return Buffer.from(doc.output("arraybuffer"));
}
