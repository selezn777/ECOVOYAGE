import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ManagerSalesEarningsToggle } from "@/components/manager-sales-earnings-toggle";
import { TopNav } from "@/components/top-nav";
import { requireAuth, isDemoUser } from "@/lib/auth-session";
import {
  getManagerDashboardSalesStats,
  listTours,
  listToursForDashboard,
  mergeGuideDashboardExpenseBadges,
} from "@/lib/data";
import { tourBusinessTodayYmd } from "@/lib/scheduling";
import { canCreateTour } from "@/lib/role-policy";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { CommissionSharesLog } from "@/components/commission-shares-log";
import { DashboardTourListClient } from "@/components/dashboard-tour-list-client";
import type { TourFeedMode } from "@/lib/types";

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

function monthFromYmd(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.slice(0, 7) : tourBusinessTodayYmd().slice(0, 7);
}

function validMonth(raw: string): string {
  return /^\d{4}-\d{2}$/.test(raw) ? raw : tourBusinessTodayYmd().slice(0, 7);
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
  const [toursRaw, managerSalesStats] = await Promise.all([
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
    fetchManagerSalesStats
      ? getManagerDashboardSalesStats(user.id, month, day || tourBusinessTodayYmd())
      : Promise.resolve(null),
  ]);

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

  const filterChipBase =
    "flex min-h-[48px] min-w-0 basis-0 flex-1 touch-manipulation items-center justify-center rounded-none px-2 py-2 text-center text-[12px] font-semibold leading-tight transition-all active:scale-[0.98] sm:min-h-[44px] sm:px-3 sm:text-[13px]";
  const filterChipActive =
    "border-0 bg-[var(--accent)] text-white shadow-none";
  const filterChipMuted =
    "border-0 bg-transparent text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_65%,transparent)] hover:text-[var(--text)]";
  const totalBooked = tours.reduce((sum, tour) => sum + (tour.booked ?? 0), 0);
  const totalCapacity = tours.reduce((sum, tour) => sum + (tour.capacity ?? 0), 0);
  const todayTours = tours.filter((tour) => tour.date === today).length;
  const partnerTours = tours.filter((tour) => isPartnerTour(tour.name)).length;
  const fillPercent = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;
  return (
    <main className="app-wrap">
      <DashboardAutoRefresh />
      <TopNav user={user} />

      <section className="relative mb-4 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_56%,var(--accent-soft)_100%)] p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/50 dark:ring-white/[0.04]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),#14b8a6,#38bdf8)]" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-dark)]">
              EcoVoyage
            </div>
            <h1 className="mt-2 text-[28px] font-extrabold leading-none tracking-normal text-[var(--text)] sm:text-4xl">{t("title")}</h1>
          </div>
          {canCreateTour(user.role) ? (
            <Link
              href="/tours/new"
              className="btn-primary inline-flex min-h-[48px] w-full min-w-0 touch-manipulation items-center justify-center rounded-2xl px-5 py-2 text-sm font-extrabold shadow-[0_12px_24px_rgba(134,202,0,0.22)] sm:min-h-[44px] sm:w-auto"
            >
              {t("openTour")}
            </Link>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/84 px-3 py-3 shadow-[var(--shadow-sm)]">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted2)]">{t("allTours")}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{tours.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200/75 bg-emerald-50/75 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-emerald-900/45 dark:bg-emerald-950/25">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300">{t("today")}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-800 dark:text-emerald-100">{todayTours}</div>
          </div>
          <div className="rounded-2xl border border-cyan-200/75 bg-cyan-50/75 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-cyan-900/45 dark:bg-cyan-950/25">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-cyan-700/80 dark:text-cyan-300">{t("people")}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-cyan-800 dark:text-cyan-100">{totalBooked}</div>
          </div>
          <div className="rounded-2xl border border-indigo-200/75 bg-indigo-50/75 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-indigo-900/45 dark:bg-indigo-950/25">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-700/80 dark:text-indigo-300">{t("capacity")}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-indigo-800 dark:text-indigo-100">{totalCapacity}</div>
          </div>
          <div className="col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/84 px-3 py-3 shadow-[var(--shadow-sm)] sm:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted2)]">{t("load")}</div>
              <div className="text-sm font-extrabold tabular-nums text-[var(--accent-dark)]">{fillPercent}%</div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),#14b8a6)]" style={{ width: `${Math.min(100, fillPercent)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-[var(--muted2)]">{t("partnerTours")}: {partnerTours}</div>
          </div>
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
