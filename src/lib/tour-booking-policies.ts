import type { Role } from "@/lib/types";
import { tourCalendarDateFromStartAtIso } from "@/lib/scheduling";

/** Смещение часового пояса туров (Вьетнам, без DST). */
const TOUR_TZ_OFFSET = "+07:00";

/** Вечер накануне выезда: после этого момента бесплатный перенос недоступен, правки карточки - только у директора. */
export const TOUR_BOOKING_EDIT_CUTOFF_HOUR = 17;

/** YYYY-MM-DD минус один календарный день (без привязки к локали сервера). */
export function ymdMinusOneDay(ymd: string): string {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Момент времени: 17:00 накануне календарного дня выезда (в часовом поясе туров).
 * До этого момента перенос бесплатен; после - удержание 30% по правилам оферты.
 */
export function tourBookingEditCutoffMs(tourStartAtIso: string): number | null {
  const depYmd = tourCalendarDateFromStartAtIso(tourStartAtIso);
  if (!depYmd) return null;
  const dayBefore = ymdMinusOneDay(depYmd);
  if (!dayBefore) return null;
  const hh = String(TOUR_BOOKING_EDIT_CUTOFF_HOUR).padStart(2, "0");
  return Date.parse(`${dayBefore}T${hh}:00:00${TOUR_TZ_OFFSET}`);
}

export function isPastTourBookingEditCutoff(tourStartAtIso: string, nowMs: number = Date.now()): boolean {
  const t = tourBookingEditCutoffMs(tourStartAtIso);
  if (t == null || Number.isNaN(t)) return false;
  return nowMs >= t;
}

/** Начало календарного дня выезда (00:00) в часовом поясе туров. */
export function tourDepartureDayStartMs(tourStartAtIso: string): number | null {
  const depYmd = tourCalendarDateFromStartAtIso(tourStartAtIso);
  if (!depYmd) return null;
  return Date.parse(`${depYmd}T00:00:00${TOUR_TZ_OFFSET}`);
}

/**
 * Отмена: до дня выезда (не включая 00:00 дня тура) - 30%; с 00:00 дня тура и при неявке - 100%.
 */
export function cancellationPenaltyPercent(
  tourStartAtIso: string,
  nowMs: number = Date.now(),
): 30 | 100 {
  const dayStart = tourDepartureDayStartMs(tourStartAtIso);
  if (dayStart == null || Number.isNaN(dayStart)) return 30;
  return nowMs >= dayStart ? 100 : 30;
}

/** Перенос: бесплатно до вечернего дедлайна накануне; после - 30%. */
export function reschedulePenaltyPercent(
  tourStartAtIso: string,
  nowMs: number = Date.now(),
): 0 | 30 {
  return isPastTourBookingEditCutoff(tourStartAtIso, nowMs) ? 30 : 0;
}

/** Краткая справка для подсказок в UI. */
export const TOUR_BOOKING_POLICY_HINT_RU =
  "Перенос бесплатен до 17:00 накануне выезда; после - удержание 30%. Отмена: 30% до дня тура, в день тура и при неявке - 100%. Данные туриста и оплаты после дедлайна - только директор.";

/**
 * Менеджер после дедлайна оферты не меняет карточку брони (данные, доплаты, паспорта) - только директор.
 * Остальные роли не используют эту функцию (у них свои правила в UI/API).
 */
export function isTourBookingCardLockedForManager(
  role: Role,
  tourStartAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (role !== "manager") return false;
  const iso = tourStartAtIso != null ? String(tourStartAtIso).trim() : "";
  if (!iso) return false;
  return isPastTourBookingEditCutoff(iso, nowMs);
}
