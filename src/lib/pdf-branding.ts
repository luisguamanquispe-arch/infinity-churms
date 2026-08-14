import fs from "fs";
import path from "path";
import type { jsPDF } from "jspdf";
import { APP_SHORT_NAME, COLORS, COMPANY_NAME } from "@/lib/constants";

let cachedLogoBase64: string | null = null;

export function getLogoBase64(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  const logoPath = path.join(process.cwd(), "public", "brand", "logo-infinity-internet.png");
  const buffer = fs.readFileSync(logoPath);
  cachedLogoBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
  return cachedLogoBase64;
}

const BRAND_RGB = { r: 0, g: 169, b: 181 };
const NAVY_RGB = { r: 11, g: 31, b: 58 };

export interface PdfBrandHeaderOptions {
  title: string;
  subtitle?: string;
  /** Y inicial (default 12) */
  yStart?: number;
  /** Barra navy con título blanco (actas, adendums) */
  banner?: boolean;
  /** Referencia del documento (número, contrato, etc.) */
  docRef?: string;
}

/** Dibuja logo + identidad corporativa. Devuelve la posición Y donde continúa el contenido. */
export function drawPdfBrandHeader(doc: jsPDF, options: PdfBrandHeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const logo = getLogoBase64();
  const logoW = 28;
  const logoH = 22;

  if (options.banner) {
    doc.setFillColor(NAVY_RGB.r, NAVY_RGB.g, NAVY_RGB.b);
    doc.roundedRect(margin, options.yStart ?? 10, pageWidth - margin * 2, 30, 2, 2, "F");

    doc.addImage(logo, "PNG", margin + 4, (options.yStart ?? 10) + 4, logoW, logoH);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(options.title, pageWidth / 2, (options.yStart ?? 10) + 14, { align: "center" });
    if (options.subtitle) {
      doc.setFontSize(9);
      doc.text(options.subtitle, pageWidth / 2, (options.yStart ?? 10) + 22, { align: "center" });
    }
    if (options.docRef) {
      doc.setFontSize(8);
      doc.text(options.docRef, pageWidth / 2, (options.yStart ?? 10) + 28, { align: "center" });
    }
    return (options.yStart ?? 10) + 36;
  }

  let y = options.yStart ?? 12;
  doc.addImage(logo, "PNG", pageWidth / 2 - logoW / 2, y, logoW, logoH);
  y += logoH + 4;

  doc.setFontSize(14);
  doc.setTextColor(NAVY_RGB.r, NAVY_RGB.g, NAVY_RGB.b);
  doc.text(options.title, pageWidth / 2, y, { align: "center" });
  y += 6;

  if (options.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
    doc.text(options.subtitle, pageWidth / 2, y, { align: "center" });
    y += 6;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
    doc.text(`${COMPANY_NAME} · ${APP_SHORT_NAME}`, pageWidth / 2, y, { align: "center" });
    y += 6;
  }

  if (options.docRef) {
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(options.docRef, pageWidth / 2, y, { align: "center" });
    y += 5;
  }

  return y + 4;
}

export function drawPdfBrandFooter(doc: jsPDF, detail?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const y = pageHeight - 10;

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const line = detail
    ? `${COMPANY_NAME} · ${detail}`
    : `${COMPANY_NAME} · ${APP_SHORT_NAME}`;
  doc.text(line, pageWidth / 2, y, { align: "center" });
  doc.setDrawColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
  doc.setLineWidth(0.3);
  doc.line(margin, y - 3, pageWidth - margin, y - 3);
}
