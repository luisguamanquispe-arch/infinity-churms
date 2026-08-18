import type { jsPDF } from "jspdf";
import { drawPdfBrandFooter } from "@/lib/pdf-branding";

export type PdfImageFormat = "JPEG" | "PNG" | "WEBP";

export function normalizeSelfieDataUrl(data?: string | null): string | null {
  const trimmed = data?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image")) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

export function imageFormatFromDataUrl(dataUrl: string): PdfImageFormat {
  const lower = dataUrl.toLowerCase();
  if (lower.includes("image/png")) return "PNG";
  if (lower.includes("image/webp")) return "WEBP";
  return "JPEG";
}

export function extractBase64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function hasIdentitySelfie(data?: string | null): boolean {
  const normalized = normalizeSelfieDataUrl(data);
  return !!normalized?.startsWith("data:image");
}

export function isIdentitySelfieRecorded(row: {
  identitySelfieData?: string | null;
  identitySelfieAt?: Date | string | null;
}): boolean {
  return hasIdentitySelfie(row.identitySelfieData) || !!row.identitySelfieAt;
}

export interface PlanChangeIdentitySelfieParams {
  identitySelfieData?: string | null;
  identitySelfieId?: string | null;
  identitySelfieAt?: Date | null;
  customerName: string;
  cedula: string;
  docRef?: string | null;
  footerDetail?: string;
}

function fitImageDimensions(
  doc: jsPDF,
  dataUrl: string,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const candidates = [dataUrl, extractBase64FromDataUrl(dataUrl)];
  for (const candidate of candidates) {
    try {
      const props = doc.getImageProperties(candidate);
      let width = maxWidth;
      let height = (props.height * width) / props.width;
      if (height > maxHeight) {
        height = maxHeight;
        width = (props.width * height) / props.height;
      }
      return { width, height };
    } catch {
      continue;
    }
  }
  return { width: maxWidth, height: maxHeight * 0.75 };
}

function addSelfieImageToPdf(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  const normalized = normalizeSelfieDataUrl(dataUrl);
  if (!normalized) return false;

  const format = imageFormatFromDataUrl(normalized);
  const attempts = [normalized, extractBase64FromDataUrl(normalized)];

  for (const imageData of attempts) {
    try {
      doc.addImage(imageData, format, x, y, width, height, undefined, "FAST");
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Agrega una página con la selfie de verificación de identidad (cliente con cédula). */
export function appendPlanChangeIdentitySelfiePage(
  doc: jsPDF,
  params: PlanChangeIdentitySelfieParams
): boolean {
  const data = normalizeSelfieDataUrl(params.identitySelfieData);
  if (!data) return false;

  doc.addPage("a4", "portrait");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  doc.setFontSize(12);
  doc.setTextColor(11, 31, 58);
  doc.text("VERIFICACIÓN DE IDENTIDAD", pageWidth / 2, 22, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  let metaY = 32;
  doc.text(`Cliente: ${params.customerName}`, margin, metaY);
  metaY += 6;
  doc.text(`C.I.: ${params.cedula}`, margin, metaY);
  metaY += 6;
  if (params.docRef) {
    doc.text(`Documento: ${params.docRef}`, margin, metaY);
    metaY += 6;
  }
  if (params.identitySelfieId) {
    doc.text(`ID archivo: ${params.identitySelfieId}`, margin, metaY);
    metaY += 6;
  }
  if (params.identitySelfieAt) {
    doc.text(
      `Registrada: ${new Date(params.identitySelfieAt).toLocaleString("es-VE")}`,
      margin,
      metaY
    );
    metaY += 6;
  }

  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - metaY - 28;
  const { width, height } = fitImageDimensions(doc, data, maxW, maxH);
  const imgX = margin + (maxW - width) / 2;

  if (!addSelfieImageToPdf(doc, data, imgX, metaY + 4, width, height)) {
    doc.setFontSize(10);
    doc.setTextColor(180, 0, 0);
    doc.text("No se pudo renderizar la imagen de verificación.", margin, metaY + 12);
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Selfie del cliente sosteniendo documento de identidad — verificación de firma digital.",
    pageWidth / 2,
    pageHeight - 18,
    { align: "center" }
  );

  drawPdfBrandFooter(doc, params.footerDetail ?? "Verificación de identidad");
  return true;
}

export interface PlanChangeReportRow {
  identitySelfieData?: string | null;
  identitySelfieId?: string | null;
  identitySelfieAt?: Date | null;
  addendumNumber?: string | null;
  customer: { name: string; cedula: string; contract: string };
}

/** Anexo al reporte PDF con una página por operación que tenga selfie registrada. */
export function appendPlanChangeReportSelfiesAppendix(
  doc: jsPDF,
  rows: PlanChangeReportRow[],
  reportTitle: string
): number {
  const withSelfieData = rows.filter((r) => hasIdentitySelfie(r.identitySelfieData));
  if (withSelfieData.length === 0) return 0;

  doc.addPage("a4", "landscape");
  doc.setFontSize(14);
  doc.setTextColor(11, 31, 58);
  doc.text(`${reportTitle} — Anexo: verificación de identidad`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `${withSelfieData.length} registro(s) con selfie de identidad adjunta.`,
    14,
    26
  );

  for (const row of withSelfieData) {
    appendPlanChangeIdentitySelfiePage(doc, {
      identitySelfieData: row.identitySelfieData,
      identitySelfieId: row.identitySelfieId,
      identitySelfieAt: row.identitySelfieAt,
      customerName: row.customer.name,
      cedula: row.customer.cedula,
      docRef: row.addendumNumber ?? row.customer.contract,
      footerDetail: row.addendumNumber ?? "Verificación de identidad",
    });
  }

  return withSelfieData.length;
}
