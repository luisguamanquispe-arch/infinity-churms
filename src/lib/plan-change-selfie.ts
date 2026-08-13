/** Tamaño máximo selfie base64 (~1.2 MB en data URL). */
export const MAX_SELFIE_DATA_URL_LENGTH = 1_600_000;

/** Tamaño máximo binario al subir multipart (~1.2 MB). */
export const MAX_SELFIE_BYTES = 1_200_000;

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

export function validateSelfieBuffer(buffer: Buffer, mime: string): string | null {
  if (!buffer.length) return "Debe adjuntar la selfie con documento de identidad.";
  if (buffer.length > MAX_SELFIE_BYTES) {
    return "La imagen es demasiado grande. Acérquese un poco más a la cámara.";
  }
  const normalized = (mime || "image/jpeg").toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(normalized)) {
    return "La fotografía debe ser JPEG o PNG.";
  }
  return null;
}

export function bufferToSelfieDataUrl(buffer: Buffer, mime: string): string {
  const normalized = /png/i.test(mime) ? "image/png" : "image/jpeg";
  return `data:${normalized};base64,${buffer.toString("base64")}`;
}

export function decodeSelfieDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  return Buffer.from(base64, "base64");
}
