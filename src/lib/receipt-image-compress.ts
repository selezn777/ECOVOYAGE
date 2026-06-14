import { parseExpenseImageDataUrl } from "@/lib/expense-attachment";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

/**
 * Сжимает фото чека в JPEG data URL (меньше тело запроса, совместимость с HEIC через createImageBitmap там, где браузер умеет).
 */
export async function receiptFileToJpegDataUrl(file: File, maxEdge = 1600, quality = 0.82): Promise<string> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    const raw = await readFileAsDataUrl(file);
    const ok = parseExpenseImageDataUrl(raw);
    if (!ok) throw new Error("UNSUPPORTED_IMAGE");
    return raw;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const raw = await readFileAsDataUrl(file);
    const ok = parseExpenseImageDataUrl(raw);
    if (!ok) throw new Error("UNSUPPORTED_IMAGE");
    return raw;
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("NO_CANVAS");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const ok = parseExpenseImageDataUrl(dataUrl);
    if (!ok) throw new Error("ENCODE_FAIL");
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
