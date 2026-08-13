import { MAX_SELFIE_DATA_URL_LENGTH } from "@/lib/plan-change-selfie";

const MAX_SIDE_PX = 1600;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Intente con otra foto."));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Reduce tamaño y normaliza a JPEG para envío por API. */
export async function compressSelfieImage(file: File): Promise<string> {
  const img = await loadImageFromFile(file);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("La imagen no tiene dimensiones válidas.");
  }

  if (width > MAX_SIDE_PX || height > MAX_SIDE_PX) {
    if (width > height) {
      height = Math.round((height * MAX_SIDE_PX) / width);
      width = MAX_SIDE_PX;
    } else {
      width = Math.round((width * MAX_SIDE_PX) / height);
      height = MAX_SIDE_PX;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");

  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const dataUrl = canvasToJpeg(canvas, quality);
    if (dataUrl.length <= MAX_SELFIE_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error(
    "La imagen sigue siendo demasiado grande. Acérquese más o use mejor iluminación."
  );
}
