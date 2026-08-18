import type { jsPDF } from "jspdf";
import { drawPdfBrandFooter } from "@/lib/pdf-branding";

export function imageFormatFromDataUrl(dataUrl: string): "JPEG" | "PNG" {
  const lower = dataUrl.toLowerCase();
  if (lower.includes("image/png")) return "PNG";
  return "JPEG";
}

export function hasIdentitySelfie(data?: string | null): boolean {
  return !!data?.trim().startsWith("data:image");
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
  try {
    const props = doc.getImageProperties(dataUrl);
    let width = maxWidth;
    let height = (props.height * width) / props.width;
    if (height > maxHeight) {
      height = maxHeight;
      width = (props.width * height) / props.height;
    }
    return { width, height };
  } catch {
    return { width: maxWidth, height: maxHeight * 0.75 };
  }
}

/** Agrega una página con la selfie de verificación de identidad (cliente con cédula). */
export function appendPlanChangeIdentitySelfiePage(
  doc: jsPDF,
  params: PlanChangeIdentitySelfieParams
): boolean {
  const data = params.identitySelfieData?.trim();
  if (!hasIdentitySelfie(data)) return false;

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
  const { width, height } = fitImageDimensions(doc, data!, maxW, maxH);
  const imgX = margin + (maxW - width) / 2;

  try {
    doc.addImage(data!, imageFormatFromDataUrl(data!), imgX, metaY + 4, width, height);
  } catch {
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
  const withSelfie = rows.filter((r) => hasIdentitySelfie(r.identitySelfieData));
  if (withSelfie.length === 0) return 0;

  doc.addPage("a4", "landscape");
  doc.setFontSize(14);
  doc.setTextColor(11, 31, 58);
  doc.text(`${reportTitle} — Anexo: verificación de identidad`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `${withSelfie.length} registro(s) con selfie de identidad adjunta.`,
    14,
    26
  );

  for (const row of withSelfie) {
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

  return withSelfie.length;
}
