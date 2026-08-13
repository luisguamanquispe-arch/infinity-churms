/** Tamaño máximo selfie base64 (~2.5 MB imagen). */
export const MAX_SELFIE_DATA_URL_LENGTH = 3_500_000;

export function validateIdentitySelfie(dataUrl: string | undefined | null): string | null {
  const data = dataUrl?.trim();
  if (!data) return "Debe adjuntar la selfie con documento de identidad.";
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(data)) {
    return "La fotografía debe ser una imagen válida (JPEG o PNG).";
  }
  if (data.length > MAX_SELFIE_DATA_URL_LENGTH) {
    return "La imagen excede el tamaño máximo permitido.";
  }
  return null;
}

export function decodeSelfieDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  return Buffer.from(base64, "base64");
}
