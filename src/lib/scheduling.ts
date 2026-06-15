/** Максимум запланированных выходных на календарный месяц (менеджеры и гиды в профиле). */
export const MAX_PLANNED_DAYS_OFF_PER_MONTH = 15;

/** Короткое имя дня недели (0 = вс … 6 = сб), без точек - единообразно везде. */
const WEEKDAY_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

/** Полное название дня недели (0 = воскресенье … 6 = суббота). */
const WEEKDAY_LONG_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

/** Читает текущую локаль из cookie (работает на клиенте и сервере через заголовки). */
function getActiveLocale(): string {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
    return m?.[1] ?? "ru";
  }
  return "ru";
}

/** «пн, 28.03.2026» — локализованная версия. */
export function formatYmdWithWeekday(ymd: string, locale?: string): string {
  const dt = parseYmdLocal(ymd);
  if (!dt) return ymd;
  const loc = locale ?? getActiveLocale();
  if (loc === "ru") {
    const wd = WEEKDAY_SHORT_RU[dt.getDay()];
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${wd}, ${dd}.${mm}.${yyyy}`;
  }
  // EN / VI: use Intl
  const intlLocale = loc === "vi" ? "vi-VN" : "en-GB";
  const wd = new Intl.DateTimeFormat(intlLocale, { weekday: "short" }).format(dt);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${wd}, ${dd}.${mm}.${yyyy}`;
}

/** «Июнь 2026» — локализованное название месяца и года. */
export function formatMonthYearLong(year: number, month: number, locale?: string): string {
  const loc = locale ?? getActiveLocale();
  const intlLocale = loc === "ru" ? "ru-RU" : loc === "vi" ? "vi-VN" : "en-GB";
  return new Date(year, month - 1, 1).toLocaleDateString(intlLocale, { month: "long", year: "numeric" });
}

/** «28.03.2026, 14:05» — локализованная дата и время. */
export function formatDateTimeShort(iso: string, locale?: string): string {
  const loc = locale ?? getActiveLocale();
  const intlLocale = loc === "ru" ? "ru-RU" : loc === "vi" ? "vi-VN" : "en-GB";
  return new Date(iso).toLocaleString(intlLocale, { dateStyle: "short", timeStyle: "short" });
}

/** Части даты для шапки тура — локализованная версия. */
export function tourDateHeaderParts(ymd: string, locale?: string): { weekdayLong: string; dmy: string } | null {
  const dt = parseYmdLocal(ymd);
  if (!dt) return null;
  const loc = locale ?? getActiveLocale();
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const dmy = `${dd}.${mm}.${yyyy}`;
  if (loc === "ru") {
    return { weekdayLong: WEEKDAY_LONG_RU[dt.getDay()], dmy };
  }
  const intlLocale = loc === "vi" ? "vi-VN" : "en-GB";
  const weekdayLong = new Intl.DateTimeFormat(intlLocale, { weekday: "long" }).format(dt);
  return { weekdayLong, dmy };
}

/** «Суббота, 04.04.2026» — локализованная версия. */
export function formatYmdWeekdayLongDmy(ymd: string, locale?: string): string {
  const parts = tourDateHeaderParts(ymd, locale);
  if (!parts) return ymd;
  const wd = parts.weekdayLong.charAt(0).toUpperCase() + parts.weekdayLong.slice(1);
  return `${wd}, ${parts.dmy}`;
}

/** Парсинг YYYY-MM-DD в локальную дату (без сдвига UTC). */
export function parseYmdLocal(ymd: string): Date | null {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Число календарных дней в отрезке [fromYmd, toYmd] включительно; 0 при неверных датах. */
export function inclusiveCalendarDaysBetween(fromYmd: string, toYmd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd) || fromYmd > toYmd) return 0;
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** «пн, 28.03.2026» - для списков, карточек, выходных. */
export function formatYmdWithWeekdayRu(ymd: string): string {
  const dt = parseYmdLocal(ymd);
  if (!dt) return ymd;
  const wd = WEEKDAY_SHORT_RU[dt.getDay()];
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${wd}, ${dd}.${mm}.${yyyy}`;
}

/** Части даты для шапки тура: день недели целиком + ДД.ММ.ГГГГ (без путаницы с короткими аббревиатурами). */
export function tourDateHeaderPartsRu(ymd: string): { weekdayLong: string; dmy: string } | null {
  const dt = parseYmdLocal(ymd);
  if (!dt) return null;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return {
    weekdayLong: WEEKDAY_LONG_RU[dt.getDay()],
    dmy: `${dd}.${mm}.${yyyy}`,
  };
}

/** «Суббота, 04.04.2026» - полный день недели для таблиц бухгалтерии и т.п. */
export function formatYmdWeekdayLongDmyRu(ymd: string): string {
  const parts = tourDateHeaderPartsRu(ymd);
  if (!parts) return ymd;
  const wd = parts.weekdayLong.charAt(0).toUpperCase() + parts.weekdayLong.slice(1);
  return `${wd}, ${parts.dmy}`;
}

/** «10.04.2026, пятница» - сначала дата, потом день недели (колонка «Дата» в бухгалтерии туров). */
export function formatYmdDmyWeekdayLongRu(ymd: string): string {
  const parts = tourDateHeaderPartsRu(ymd);
  if (!parts) return ymd;
  const wd = parts.weekdayLong.charAt(0).toUpperCase() + parts.weekdayLong.slice(1);
  return `${parts.dmy}, ${wd}`;
}

/** Calendar date YYYY-MM-DD in local timezone */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Даты туров в приложении считаются по Вьетнаму (как `…+07:00` в API создания тура). */
export const TOUR_BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Календарный день старта тура (YYYY-MM-DD) в часовом поясе туров. */
export function tourCalendarDateFromStartAtIso(iso: string): string {
  const y = ymdFromIsoInTimeZone(iso, TOUR_BUSINESS_TIME_ZONE);
  if (y) return y;
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

/** Сегодняшний календарный день в часовом поясе туров (фильтры дашборда, «прошлый/будущий» тур). */
export function tourBusinessTodayYmd(): string {
  const y = ymdFromIsoInTimeZone(new Date().toISOString(), TOUR_BUSINESS_TIME_ZONE);
  return y || localDateString();
}

/** Интервал календарного месяца для `anchorYmd`: всегда с 1-го числа по последний день (арифметика по компонентам Y-M-D). */
export function monthBoundsYmdFromAnchor(anchorYmd: string): { from: string; to: string } | null {
  const dt = parseYmdLocal(anchorYmd);
  if (!dt) return null;
  const y = dt.getFullYear();
  const mo = dt.getMonth();
  const from = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const last = new Date(y, mo + 1, 0);
  return { from, to: localDateString(last) };
}

/** HH:MM в часовом поясе туров (Вьетнам) - окно сбора и дефолт pickup_time у брони. */
export function hhmmFromIsoInTourTz(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TOUR_BUSINESS_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(t);
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    if (h != null && m != null) return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  } catch {
    /* invalid tz */
  }
  return "";
}

/** Окно сбора «HH:MM-HH:MM» в таймзоне туров (единая логика с датой тура в CRM). */
export function pickupWindowFromStartEndIso(startIso: string, endIso: string): string {
  const a = hhmmFromIsoInTourTz(startIso);
  const b = hhmmFromIsoInTourTz(endIso);
  if (a && b) return `${a}-${b}`;
  if (a) return `${a}-${a}`;
  return b || "";
}

/** Нормализация «H:M» / «HH:MM» для сравнения и API. */
export function normalizeTourPickupHhMm(raw: string): string {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Стандартное время сбора у отеля для брони = начало окна тура (первая часть HH:MM-HH:MM) в таймзоне туров. */
export function defaultTourPickupHhMmFromStartEndIso(startIso: string, endIso?: string | null): string {
  const start = String(startIso || "").trim();
  if (!start) return "";
  const end = endIso != null && String(endIso).trim() ? String(endIso).trim() : start;
  const win = pickupWindowFromStartEndIso(start, end);
  if (win.includes("-")) {
    const first = win.split("-")[0]?.trim();
    if (first) return normalizeTourPickupHhMm(first);
  }
  return normalizeTourPickupHhMm(hhmmFromIsoInTourTz(start));
}

/**
 * Старый баг: дефолт pickup подставляли через UTC (toISOString), получалось «вечернее» время вместо местного.
 * Совпадает с тем, что ошибочно записали в `bookings.pickup_time`.
 */
export function legacyUtcDefaultPickupBugHhMm(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toISOString().slice(11, 16);
}

/** Календарная дата YYYY-MM-DD в указанной таймзоне для момента времени ISO (UTC). */
export function ymdFromIsoInTimeZone(iso: string, timeZone: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(t);
    const y = parts.find((p) => p.type === "year")?.value;
    const mo = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && mo && d) return `${y}-${mo}-${d}`;
  } catch {
    /* invalid tz */
  }
  return "";
}

/** Дата+время из ISO в локали пользователя, с днём недели: «пт, 28.03.2026, 14:30». */
export function formatIsoLocalWithWeekdayRu(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const datePart = formatYmdWithWeekdayRu(localDateString(t));
  const timePart = t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

/** Minimum date (YYYY-MM-DD) for chief/director adding *another* manager's day off (≥5 calendar days from today). */
export function minManagerDayOffDateForChiefAction(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 5);
  return localDateString(d);
}

/** Earliest day a guide may mark a day off for themselves (today + 3 calendar days, local). */
export function minGuideSelfDayOffDate(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3);
  return localDateString(d);
}

/** True if `dayOff` is strictly before today (local). */
export function isPastCalendarDay(dayOff: string): boolean {
  return dayOff < localDateString();
}

/** True if chief/director may register this day off for someone else (≥5 days ahead). */
export function isValidManagerOffForChiefTarget(dayOff: string): boolean {
  return dayOff >= minManagerDayOffDateForChiefAction();
}

/** 7 дней пн-вс для календарной недели, содержащей anchor (YYYY-MM-DD). По умолчанию - сегодня. */
export function weekDayKeysLocal(anchorYmd?: string): string[] {
  const base =
    anchorYmd && /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd)
      ? new Date(`${anchorYmd}T12:00:00`)
      : new Date();
  const wd = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - wd);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });
}
