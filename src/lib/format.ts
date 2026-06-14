export function formatVnd(value: number): string {
  const safe = Math.round(Number(value) || 0);
  return `${safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

/** Базовый курс ₫ за 1 USD для отчётов, если в операции не указаны доллары. */
export const DEFAULT_REPORT_USD_VND_RATE = 26000;

export const REPORT_USD_VND_RATE_MIN = 1000;
export const REPORT_USD_VND_RATE_MAX = 500_000;

/** Курс из query `usd_rate` для страницы отчётов; при неверном значении - дефолт. */
export function resolveReportUsdVndRate(raw: string | string[] | undefined): number {
  const s =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? String(raw[0] ?? "").trim()
        : "";
  if (!s) return DEFAULT_REPORT_USD_VND_RATE;
  const n = Math.round(Number.parseFloat(s.replace(",", ".")));
  if (!Number.isFinite(n) || n < REPORT_USD_VND_RATE_MIN || n > REPORT_USD_VND_RATE_MAX) {
    return DEFAULT_REPORT_USD_VND_RATE;
  }
  return n;
}

/** Фрагмент query `usd_rate=…` только если отличается от дефолта (без `?` и `&`). */
export function reportUsdRateSearchParam(usdRate: number): string | null {
  if (usdRate === DEFAULT_REPORT_USD_VND_RATE) return null;
  return `usd_rate=${encodeURIComponent(String(usdRate))}`;
}

/** Доллары для отчётов сдачи наличности (2 знака). */
export function formatUsd(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0,00 $";
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** Ввод суммы с разделителями тысяч (800.000). Убираем пробелы, точки (в т.ч. U+FF0E), запятые - без strip всех нецифр, чтобы не ломать пошаговый ввод. */
export function parseVndInput(raw: string): number {
  let s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\uFF0E/g, ".")
    .replace(/\./g, "")
    .replace(/,/g, "");
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function formatVndInput(n: number): string {
  const safe = Math.round(Number(n) || 0);
  if (safe <= 0) return "";
  return safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  return `+${digits}`;
}
