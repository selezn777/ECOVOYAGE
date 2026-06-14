/**
 * Нормализует ввод ника Telegram: убирает @, приводит к нижнему регистру.
 * Возвращает null, если строка пустая или не похожа на валидный username (5-32 символа, [a-z0-9_]).
 */
export function normalizeTelegramUsername(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9_]{3,31}$/.test(s)) return null;
  return s;
}

export function telegramProfileHref(username: string): string {
  const u = String(username ?? "")
    .trim()
    .replace(/^@+/, "");
  return `https://t.me/${encodeURIComponent(u)}`;
}

/** Открыть чат Telegram с предзаполненным сообщением (tg:// scheme для мобильных). */
export function telegramMsgHref(username: string, text?: string | null): string {
  const u = String(username ?? "")
    .trim()
    .replace(/^@+/, "");
  if (!u) return "";
  if (text?.trim()) {
    return `tg://msg?to=@${encodeURIComponent(u)}&text=${encodeURIComponent(text.trim())}`;
  }
  return `https://t.me/${encodeURIComponent(u)}`;
}
