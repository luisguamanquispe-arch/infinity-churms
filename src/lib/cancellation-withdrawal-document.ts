/** Tamaño máximo del data URL base64 (~1.5 MB de PDF). */
export const MAX_WITHDRAWAL_REQUEST_PDF_DATA_URL_LENGTH = 2_000_000;

export function validateWithdrawalRequestPdf(
  fileName: string | undefined | null,
  fileData: string | undefined | null
): string | null {
  const name = fileName?.trim();
  const data = fileData?.trim();

  if (!name || !data) {
    return "Debe adjuntar el PDF de Solicitud de retiro del cliente";
  }
  if (!name.toLowerCase().endsWith(".pdf")) {
    return "El archivo debe ser PDF (.pdf)";
  }
  if (!data.startsWith("data:application/pdf")) {
    return "El archivo debe ser un documento PDF válido";
  }
  if (data.length > MAX_WITHDRAWAL_REQUEST_PDF_DATA_URL_LENGTH) {
    return "El PDF excede el tamaño máximo permitido (aprox. 1.5 MB)";
  }
  return null;
}

export function decodePdfDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  return Buffer.from(base64, "base64");
}

export function sanitizePdfFileName(name: string, fallback = "solicitud-retiro.pdf"): string {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/[^\w.\-() áéíóúñÁÉÍÓÚÑ]/g, "_");
}
