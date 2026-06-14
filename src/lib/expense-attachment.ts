/** Максимум символов data URL (~2 МБ полезной нагрузки в base64). */
export const MAX_EXPENSE_ATTACHMENT_DATA_URL_CHARS = 2_800_000;

const DATA_IMAGE_HEADER = /^data:image\/(jpeg|jpg|png|webp|heic|heif);base64$/i;

/**
 * Проверяет data URL изображения (jpeg/png/webp/heic) для сохранения в expenses.attachment_url.
 */
export function parseExpenseImageDataUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < 32) return null;
  if (raw.length > MAX_EXPENSE_ATTACHMENT_DATA_URL_CHARS) return null;
  const comma = raw.indexOf(",");
  if (comma < 20) return null;
  const header = raw.slice(0, comma);
  if (!DATA_IMAGE_HEADER.test(header)) return null;
  const b64 = raw.slice(comma + 1).replace(/\s/g, "");
  if (b64.length < 16) return null;
  return raw;
}
