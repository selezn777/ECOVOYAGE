import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GuideEarningsToggle } from "@/components/guide-earnings-toggle";
import { ManagerSalesEarningsToggle } from "@/components/manager-sales-earnings-toggle";
import { TopNav } from "@/components/top-nav";
import { requireAuth, isDemoUser } from "@/lib/auth-session";
import {
  getGuideDashboardEarningsStats,
  getDirectorSalesPulse,
  getManagerDashboardSalesStats,
  listTours,
  listToursForDashboard,
  mergeGuideDashboardExpenseBadges,
} from "@/lib/data";
import { formatYmdWithWeekday, tourBusinessTodayYmd } from "@/lib/scheduling";
import { canCreateTour } from "@/lib/role-policy";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { BookingsByHourChart } from "@/components/bookings-by-hour-chart";
import { CommissionSharesLog } from "@/components/commission-shares-log";
import { DashboardTourListClient } from "@/components/dashboard-tour-list-client";
import type { Tour, TourFeedMode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;


type CalendarMode = "list" | "month";
type RangeMode = "future" | "archive" | "all" | "today";

function allowedViewsForRole(role: string): TourFeedMode[] {
  /** Гид: есть общий обзор «Все туры», плюс свои режимы */
  if (role === "guide" || role === "chief_guide") return ["all", "my_tours", "my_trips"];
  if (role === "manager" || role === "chief_manager") return ["all", "my_sales"];
  if (role === "director") return ["all"];
  return ["all"];
}

function pickFirst(v?: string | string[]): string {
  if (!v) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

type DashboardSearchParams = {
  view?: string | string[];
  q?: string | string[];
  tour?: string | string[];
  month?: string | string[];
  cal?: string | string[];
  day?: string | string[];
  range?: string | string[];
};

type TourNameGroup = { name: string; items: Tour[]; totalBooked: number };

function isPartnerTour(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("катамар") ||
    n.includes("зиплайн") || n.includes("zip") ||
    n.includes("квадр") ||
    n.includes("круиз") ||
    n.includes("рыбалк")
  );
}

/** Туры одного дня → под-группы по названию.
 * Порядок: сначала свои туры (по заполненности убывание), потом партнёрские. */
function groupToursByName(tours: Tour[]): TourNameGroup[] {
  const nameMap = new Map<string, Tour[]>();
  for (const t of tours) {
    const arr = nameMap.get(t.name) ?? [];
    arr.push(t);
    nameMap.set(t.name, arr);
  }
  return [...nameMap.entries()]
    .map(([name, items]) => ({
      name,
      items: items.slice().sort((a, b) => (b.booked ?? 0) - (a.booked ?? 0)),
      totalBooked: items.reduce((s, t) => s + (t.booked ?? 0), 0),
    }))
    .sort((a, b) => {
      const ap = isPartnerTour(a.name) ? 1 : 0;
      const bp = isPartnerTour(b.name) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return b.totalBooked - a.totalBooked || a.name.localeCompare(b.name, "ru");
    });
}

function groupToursByDate(tours: Tour[]): { date: string; nameGroups: TourNameGroup[] }[] {
  const order: string[] = [];
  const map = new Map<string, Tour[]>();
  for (const t of tours) {
    if (!map.has(t.date)) order.push(t.date);
    const arr = map.get(t.date) ?? [];
    arr.push(t);
    map.set(t.date, arr);
  }
  return order.map((date) => ({
    date,
    nameGroups: groupToursByName(map.get(date) ?? []),
  }));
}

function monthFromYmd(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.slice(0, 7) : tourBusinessTodayYmd().slice(0, 7);
}

function validMonth(raw: string): string {
  return /^\d{4}-\d{2}$/.test(raw) ? raw : tourBusinessTodayYmd().slice(0, 7);
}

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitleRu(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  return dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function calendarDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, (m || 1) - 1, 1);
  const daysInMonth = new Date(y, m || 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: string[] = [];
  for (let i = 0; i < offset; i += 1) cells.push("");
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push("");
  return cells;
}

function withDashboardParams(base: {
  view: TourFeedMode;
  q?: string;
  tour?: string;
  month?: string;
  cal?: CalendarMode;
  day?: string;
  range?: RangeMode;
}) {
  const p = new URLSearchParams();
  p.set("view", base.view);
  if (base.month) p.set("month", base.month);
  if (base.cal) p.set("cal", base.cal);
  if (base.day) p.set("day", base.day);
  if (base.range) p.set("range", base.range);
  if (base.tour?.trim()) p.set("tour", base.tour.trim());
  else if (base.q?.trim()) p.set("q", base.q.trim());
  return `/dashboard?${p.toString()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const t = await getTranslations("dashboard");
  const { getLocale } = await import("next-intl/server");
  const locale = await getLocale();
  const VIEW_LABELS: Record<TourFeedMode, string> = {
    all: t("allTours"),
    my_tours: t("myTours"),
    my_sales: t("mySales"),
    my_trips: t("myTrips"),
  };
  const user = await requireAuth();
  if (user.role === "accountant") redirect("/accounting");
  const isGuideRole = user.role === "guide" || user.role === "chief_guide";
  const isChiefGuide = user.role === "chief_guide";
  const isManager = user.role === "manager" || user.role === "chief_manager";
  const isDispatcher = user.role === "dispatcher" || user.role === "booking_dispatcher";
  const sp = await searchParams;

  const allowedViews = allowedViewsForRole(user.role);
  const requestedView = pickFirst(sp.view) as TourFeedMode;
  const guideDefaultView: TourFeedMode = "my_tours";
  const fallbackView = isChiefGuide ? "all" : isGuideRole ? guideDefaultView : allowedViews[0];
  const view = allowedViews.includes(requestedView) ? requestedView : fallbackView;
  const cal = "list"; // календарь убран — всегда список
  const rangeRaw = pickFirst(sp.range);
  const rangeDefault: RangeMode =
    isDispatcher ? "future" : (isChiefGuide && view === "all") ? "all" : view === "my_trips" ? "all" : "future";
  const range: RangeMode =
    rangeRaw === "future" || rangeRaw === "archive" || rangeRaw === "all" || rangeRaw === "today"
      ? rangeRaw
      : rangeDefault;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(pickFirst(sp.day)) ? pickFirst(sp.day) : "";

  const q = pickFirst(sp.q).trim();
  const tourExact = pickFirst(sp.tour).trim();
  const month = validMonth(pickFirst(sp.month) || monthFromYmd(day || tourBusinessTodayYmd()));

  const fetchManagerSalesStats =
    view === "my_sales" &&
    (user.role === "manager" || user.role === "director" || user.role === "chief_manager");

  const demo = isDemoUser(user);
  const [toursRaw, guideStats, managerSalesStats, directorSalesPulse] = await Promise.all([
    (async () => {
      if (isGuideRole && view === "my_trips") {
        const [pastAndToday, upcoming] = await Promise.all([
          listToursForDashboard(user.id, "my_trips", demo),
          listToursForDashboard(user.id, "my_tours", demo),
        ]);
        const byId = new Map<string, (typeof pastAndToday)[number]>();
        for (const t of pastAndToday) byId.set(t.id, t);
        for (const t of upcoming) byId.set(t.id, t);
        return mergeGuideDashboardExpenseBadges([...byId.values()], user.id, user.role);
      }
      if ((isManager || isDispatcher) && view === "all") {
        const rows = await listTours({ demoMode: demo });
        return isGuideRole ? mergeGuideDashboardExpenseBadges(rows, user.id, user.role) : rows;
      }
      const rows = await listToursForDashboard(user.id, view, demo);
      return isGuideRole ? mergeGuideDashboardExpenseBadges(rows, user.id, user.role) : rows;
    })(),
    isGuideRole
      ? getGuideDashboardEarningsStats(user.id, month, day || tourBusinessTodayYmd())
      : Promise.resolve(null),
    fetchManagerSalesStats
      ? getManagerDashboardSalesStats(user.id, month, day || tourBusinessTodayYmd())
      : Promise.resolve(null),
    (user.role === "director" || user.role === "chief_manager") ? (() => {
      const monthStart = `${month}-01`;
      return getDirectorSalesPulse(31, monthStart);
    })() : Promise.resolve(null),
  ]);

  const upcomingTours = toursRaw
    .filter((t) => t.date >= tourBusinessTodayYmd() && t.status !== "deleted" && t.status !== "completed")
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const ap = isPartnerTour(a.name) ? 1 : 0;
      const bp = isPartnerTour(b.name) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return (b.booked ?? 0) - (a.booked ?? 0);
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      dateLabel: formatYmdWithWeekday(t.date, locale),
      booked: t.booked,
      capacity: t.capacity,
    }));

  const today = tourBusinessTodayYmd();
  const ignoreCalendarForGuideTrips = isGuideRole && view === "my_trips";
  const effectiveRange: RangeMode = ignoreCalendarForGuideTrips ? "all" : range;
  /** «Мои туры» у гида уже только предстоящие (см. ниже) - чипы «Будущие/Все» не применяем */
  const skipRangeFilterForGuideMyTours = isGuideRole && view === "my_tours";
  /** Менеджер «Все туры»: без чипов future/archive/all - свои правила для списка и календаря */
  const skipRangeForManagerAll = isManager && view === "all";
  /** «Мои продажи»: в data.ts подтягиваются туры за все даты; чипов диапазона у менеджера нет - не режем прошлое. */
  const skipRangeForMySales = view === "my_sales";
  const tours = toursRaw
    .filter((t) => {
      if (skipRangeForManagerAll) return true;
      if (skipRangeForMySales) return true;
      if (skipRangeFilterForGuideMyTours) return true;
      if (effectiveRange === "today") return t.date === today;
      if (effectiveRange === "future") return t.date >= today;
      if (effectiveRange === "archive") return t.date < today;
      return true;
    })
    .filter((t) => {
      if (isManager && view === "all" && cal === "list") {
        return t.date >= today;
      }
      return true;
    })
    .filter((t) => {
      if (ignoreCalendarForGuideTrips) return true;
      if (isDispatcher && effectiveRange === "all") return true;
      if (view === "my_sales") return true;
      return day ? t.date === day : true;
    })
    .filter(() => true) // календарь убран — всегда список, фильтр по месяцу не нужен
    .filter((t) => (isGuideRole && view === "my_tours" ? t.date > today : true))
    .filter((t) => {
      if (tourExact) return t.name.toLowerCase() === tourExact.toLowerCase();
      if (!q) return true;
      const needle = q.toLowerCase();
      return t.name.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (view === "my_sales") {
        const byDate = b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : b.startAtIso.localeCompare(a.startAtIso);
      }
      const dir = effectiveRange === "archive" ? -1 : 1;
      const byDate = dir * a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const ap = isPartnerTour(a.name) ? 1 : 0;
      const bp = isPartnerTour(b.name) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return (b.booked ?? 0) - (a.booked ?? 0);
    });

  const preserved = {
    view,
    month: month || undefined,
    cal,
    day: day || undefined,
    range,
  };

  const upcomingTourNames = [...new Set(toursRaw.map((t) => t.name).filter(Boolean))];
  const countsByDay = new Map<string, number>();
  for (const t of toursRaw.filter((x) => x.date.slice(0, 7) === month)) {
    countsByDay.set(t.date, (countsByDay.get(t.date) || 0) + 1);
  }
  const monthCells = calendarDays(month);
  const filterChipBase =
    "flex min-h-[48px] min-w-0 basis-0 flex-1 touch-manipulation items-center justify-center rounded-none px-2 py-2 text-center text-[12px] font-semibold leading-tight transition-all active:scale-[0.98] sm:min-h-[44px] sm:px-3 sm:text-[13px]";
  const filterChipActive =
    "border-0 bg-[var(--accent)] text-white shadow-none";
  const filterChipMuted =
    "border-0 bg-transparent text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_65%,transparent)] hover:text-[var(--text)]";
  return (
    <main className="app-wrap">
      <DashboardAutoRefresh />
      <TopNav user={user} />

      <section className="card mb-3 !rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          {canCreateTour(user.role) ? (
            <Link
              href="/tours/new"
              className="btn-primary inline-flex min-h-[46px] w-full min-w-0 touch-manipulation items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold sm:min-h-[42px] sm:w-auto"
            >
              {t("openTour")}
            </Link>
          ) : null}
        </div>

        {allowedViews.length > 1 ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-0 shadow-[var(--shadow-sm)]">
            <nav className="flex w-full min-w-0" aria-label="Режим дашборда">
              {allowedViews.map((mode) => {
                const active = view === mode;
                return (
                  <Link
                    key={mode}
                    href={withDashboardParams({ view: mode, q, tour: tourExact, month, cal, day, range })}
                    className={`${filterChipBase} ${active ? filterChipActive : filterChipMuted}`}
                  >
                    {VIEW_LABELS[mode]}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}

        {/* Диспетчер: Все туры (будущие + сегодня) / Прошедшие */}
        {isDispatcher ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-0 shadow-[var(--shadow-sm)]">
            <nav className="flex w-full min-w-0" aria-label="Фильтр туров">
              <Link
                href={withDashboardParams({ view, q, tour: tourExact, month, cal, day, range: "future" })}
                className={`${filterChipBase} ${range !== "archive" ? filterChipActive : filterChipMuted}`}
              >
                {t("upcomingTours")}
              </Link>
              <Link
                href={withDashboardParams({ view, q, tour: tourExact, month, cal, day, range: "archive" })}
                className={`${filterChipBase} ${range === "archive" ? filterChipActive : filterChipMuted}`}
              >
                {t("pastTours")}
              </Link>
            </nav>
          </div>
        ) : null}

        {!isGuideRole && !isManager && !isDispatcher && user.baseRole !== "director" ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-0 shadow-[var(--shadow-sm)]">
            <nav className="flex w-full min-w-0" aria-label="Фильтр туров">
              <Link
                href={withDashboardParams({ view, q, tour: tourExact, month, cal, day, range: "future" })}
                className={`${filterChipBase} ${range === "future" ? filterChipActive : filterChipMuted}`}
              >
                {t("future")}
              </Link>
              <Link
                href={withDashboardParams({ view, q, tour: tourExact, month, cal, day, range: "archive" })}
                className={`${filterChipBase} ${range === "archive" ? filterChipActive : filterChipMuted}`}
              >
                {t("archive")}
              </Link>
              <Link
                href={withDashboardParams({ view, q, tour: tourExact, month, cal, day, range: "all" })}
                className={`${filterChipBase} ${range === "all" ? filterChipActive : filterChipMuted}`}
              >
                {t("all")}
              </Link>
            </nav>
          </div>
        ) : null}

        {guideStats && isGuideRole && view === "my_trips" ? (
          <div className="mt-3">
            <GuideEarningsToggle stats={guideStats} />
          </div>
        ) : null}

        {managerSalesStats && view === "my_sales" ? (
          <div className="mt-3">
            <ManagerSalesEarningsToggle stats={managerSalesStats} viewerRole={user.role} />
          </div>
        ) : null}

        {isManager && view === "my_sales" ? (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <CommissionSharesLog />
          </div>
        ) : null}

      </section>

      {(user.role === "director" || user.role === "chief_manager") && directorSalesPulse ? (
        <section className="card mb-3">
          {/* ── Навигация по месяцу ── */}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text)] capitalize">{monthTitleRu(month)}</span>
            <div className="flex items-center gap-1">
              <a
                href={withDashboardParams({ view, q, tour: tourExact, month: monthShift(month, -1), cal, day, range })}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] transition-colors text-sm"
              >‹</a>
              <a
                href={monthShift(month, 1) <= tourBusinessTodayYmd().slice(0, 7)
                  ? withDashboardParams({ view, q, tour: tourExact, month: monthShift(month, 1), cal, day, range })
                  : "#"}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-sm transition-colors ${
                  monthShift(month, 1) > tourBusinessTodayYmd().slice(0, 7)
                    ? "cursor-not-allowed bg-[var(--surface-soft)] text-[var(--muted2)] opacity-40"
                    : "bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                }`}
              >›</a>
            </div>
          </div>

          {/* ── 5 KPI-метрик ── */}
          {(() => {
            const fm = directorSalesPulse.financeMonth;
            const fmtM = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v > 0 ? `${Math.round(v / 1000)}K` : "—";
            const hasData = fm.bookingsCount > 0 || fm.revenueVnd > 0 || fm.expenseVnd > 0;
            return (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] px-2 py-2.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("bookings")}</div>
                  <div className="mt-1 text-[15px] font-bold tabular-nums text-[var(--text)]">{hasData ? fm.bookingsCount : "—"}</div>
                </div>
                <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] px-2 py-2.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("people")}</div>
                  <div className="mt-1 text-[15px] font-bold tabular-nums text-[var(--text)]">{hasData ? fm.totalPax : "—"}</div>
                </div>
                <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] px-2 py-2.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("revenue")}</div>
                  <div className="mt-1 text-[15px] font-bold tabular-nums text-[var(--accent)]">{fmtM(fm.revenueVnd)}</div>
                </div>
                <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] px-2 py-2.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("expenses")}</div>
                  <div className="mt-1 text-[15px] font-bold tabular-nums" style={{ color: "var(--danger, #ef4444)" }}>{fmtM(fm.expenseVnd)}</div>
                </div>
                <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border)] px-2 py-2.5 text-center col-span-3 sm:col-span-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("profit")}</div>
                  <div className={`mt-1 text-[15px] font-bold tabular-nums ${fm.netVnd >= 0 ? "" : ""}`}
                    style={{ color: hasData ? (fm.netVnd >= 0 ? "var(--success, #22c55e)" : "var(--danger, #ef4444)") : "var(--muted)" }}>
                    {hasData ? `${fm.netVnd >= 0 ? "+" : ""}${fmtM(fm.netVnd)}` : "—"}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Рейтинги: менеджеры / туры / гиды ── */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">

            {/* Топ менеджеров */}
            {directorSalesPulse.byManager.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("topManagers")}</div>
                <ul className="space-y-2">
                  {directorSalesPulse.byManager.slice(0, 8).map((r, i) => {
                    const max = directorSalesPulse.byManager[0]?.bookings ?? 1;
                    const pct = Math.round((r.bookings / max) * 100);
                    return (
                      <li key={r.managerId}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-[var(--muted2)]">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-[var(--text)]">{r.managerName}</div>
                            <div className="text-[11px] text-[var(--muted)]">{r.bookings} {t("bookings")} · {r.pax} {t("people")}</div>
                          </div>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Топ туров */}
            {directorSalesPulse.byTour.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("topTours")}</div>
                <ul className="space-y-2">
                  {directorSalesPulse.byTour.slice(0, 8).map((r, i) => {
                    const max = directorSalesPulse.byTour[0]?.bookings ?? 1;
                    const pct = Math.round((r.bookings / max) * 100);
                    return (
                      <li key={r.tourId}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-[var(--muted2)]">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-[var(--text)]">{r.tourName}</div>
                            <div className="text-[11px] text-[var(--muted)]">{r.bookings} {t("bookings")} · {r.pax} {t("people")}</div>
                          </div>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Топ гидов */}
            {directorSalesPulse.byGuide.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("topGuides")}</div>
                <ul className="space-y-2">
                  {directorSalesPulse.byGuide.slice(0, 8).map((r, i) => {
                    const max = directorSalesPulse.byGuide[0]?.trips ?? 1;
                    const pct = Math.round((r.trips / max) * 100);
                    return (
                      <li key={r.guideId}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-[var(--muted2)]">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-[var(--text)]">{r.guideName}</div>
                            <div className="text-[11px] text-[var(--muted)]">{r.trips} {t("trips")} · {r.pax} {t("people")}</div>
                          </div>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

          </div>
        </section>
      ) : null}

      <section>
        <DashboardTourListClient
          tours={tours}
          initialQ={q || tourExact}
          viewerRole={user.role}
        />
      </section>
    </main>
  );
}
