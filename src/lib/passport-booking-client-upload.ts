import { receiptFileToJpegDataUrl } from "@/lib/receipt-image-compress";

/** Без fetch(dataUrl) — в Safari крупные data URL иногда падают при втором чтении. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("bad data url");
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(meta)) throw new Error("expected base64 data url");
  const mimeMatch = /^data:([^;]+)/i.exec(meta);
  const mime = mimeMatch?.[1]?.trim() || "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Загрузка в storage + PATCH passport_photo_urls (как в карточке брони). */
export async function addPassportPhotoToBooking(
  bookingId: string,
  tourId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let dataUrl: string;
  try {
    dataUrl = await receiptFileToJpegDataUrl(file, 2000, 0.86);
  } catch {
    return { ok: false, error: "Не удалось обработать изображение. Попробуйте JPEG или PNG." };
  }
  try {
    const blob = dataUrlToBlob(dataUrl);
    const fd = new FormData();
    fd.set(
      "file",
      new File([blob], blob.type === "image/png" ? "passport.png" : "passport.jpg", {
        type: blob.type || "image/jpeg",
      }),
    );
    fd.set("kind", "passport_booking");
    fd.set("bookingId", bookingId);
    fd.set("tourId", tourId);
    const up = await fetch("/api/uploads", { method: "POST", body: fd });
    const uj = (await up.json().catch(() => ({}))) as { url?: string; error?: unknown };
    if (!up.ok) {
      const msg =
        typeof uj.error === "string"
          ? uj.error
          : uj.error != null
            ? JSON.stringify(uj.error)
            : `Ошибка загрузки (${up.status})`;
      return { ok: false, error: msg };
    }
    if (!uj.url) return { ok: false, error: "Нет URL файла после загрузки." };
    const patch = await fetch(`/api/bookings/${bookingId}/passport-photos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: uj.url }),
    });
    const pj = (await patch.json().catch(() => ({}))) as { error?: unknown };
    if (!patch.ok) {
      const msg =
        typeof pj.error === "string" ? pj.error : pj.error != null ? JSON.stringify(pj.error) : "Не удалось прикрепить фото";
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ошибка сети" };
  }
}
