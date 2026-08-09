import { parseExpenseImageDataUrl, MAX_EXPENSE_ATTACHMENT_DATA_URL_CHARS } from "@/lib/expense-attachment";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

/** Декодирует через `<img>` там, где не сработал createImageBitmap (частый случай с HEIC в некоторых WebView). */
function loadHtmlImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img-decode"));
    img.src = objectUrl;
  });
}

function drawToJpegDataUrl(
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  maxEdge: number,
  quality: number,
): string | null {
  const scale = Math.min(1, maxEdge / Math.max(sourceW, sourceH, 1));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Сжимает фото чека в JPEG data URL (меньше тело запроса, совместимость с HEIC).
 * Пробует по очереди: createImageBitmap → <img> → сырой файл. Между шагами
 * снижает качество/размер, чтобы почти никогда не упереться в серверный лимит
 * (иначе бэкенд отбрасывает фото целиком, а расход раньше вовсе не сохранялся).
 */
export async function receiptFileToJpegDataUrl(file: File, maxEdge = 1600, quality = 0.82): Promise<string> {
  const canCanvas = typeof document !== "undefined";

  if (canCanvas && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        for (const [edge, q] of [
          [maxEdge, quality],
          [1200, 0.72],
          [900, 0.6],
        ] as const) {
          const dataUrl = drawToJpegDataUrl(bitmap, bitmap.width, bitmap.height, edge, q);
          if (dataUrl && parseExpenseImageDataUrl(dataUrl)) return dataUrl;
        }
      } finally {
        bitmap.close();
      }
    } catch {
      // createImageBitmap не смог декодировать (частый случай HEIC вне Safari) - пробуем <img>.
    }
  }

  if (canCanvas) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(objectUrl);
      for (const [edge, q] of [
        [maxEdge, quality],
        [1200, 0.72],
        [900, 0.6],
      ] as const) {
        const dataUrl = drawToJpegDataUrl(img, img.naturalWidth, img.naturalHeight, edge, q);
        if (dataUrl && parseExpenseImageDataUrl(dataUrl)) return dataUrl;
      }
    } catch {
      // <img> тоже не смог - последний шанс ниже.
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const raw = await readFileAsDataUrl(file);
  const ok = parseExpenseImageDataUrl(raw);
  if (!ok) throw new Error("UNSUPPORTED_IMAGE");
  if (raw.length > MAX_EXPENSE_ATTACHMENT_DATA_URL_CHARS) throw new Error("PHOTO_TOO_LARGE");
  return raw;
}
