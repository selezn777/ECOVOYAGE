/** Ссылка wa.me по номеру (цифры, часто с кодом страны). Опционально — предзаполненный текст (обрезается по длине URL). */
export function waMeHref(phone: string, opts?: { minDigits?: number; text?: string }): string | null {
  const digits = phone.replace(/\D/g, "");
  const min = opts?.minDigits ?? 8;
  if (digits.length < min) return null;
  let url = `https://wa.me/${digits}`;
  const raw = opts?.text?.trim();
  if (raw) {
    const max = 1200;
    const t = raw.length > max ? raw.slice(0, max) : raw;
    url += `?text=${encodeURIComponent(t)}`;
  }
  return url;
}
