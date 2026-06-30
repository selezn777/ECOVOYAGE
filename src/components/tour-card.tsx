import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Tour } from "@/lib/types";
import type { Role } from "@/lib/types";
import { canAssignTourBuses, canCreateBooking, canResolveTourOverbook } from "@/lib/role-policy";
import { formatYmdWeekdayLongDmy, inclusiveCalendarDaysBetween, tourBusinessTodayYmd } from "@/lib/scheduling";
import { DispatcherBusQuickForm } from "@/components/dispatcher-bus-quick-form";
import { DispatcherTourBookingQuickForm } from "@/components/dispatcher-tour-booking-quick-form";
import { CopyDriverButton } from "@/components/tour-actions";
import { TourCardHeaderWithDescription } from "@/components/tour-card-header-with-description";
import { GuideBusCard } from "@/components/guide-bus-card";
import { ChiefGuideAssignModal } from "@/components/chief-guide-assign-modal";
import { OverbookResolutionActions } from "@/components/overbook-resolution-actions";

interface Props {
  tour: Tour;
  viewerRole?: Role;
  bookingIntentHref?: string;
}

function extractDriverPhoneFromBusInfo(busInfo?: string): string | null {
  const s = String(busInfo || "");
  const m = s.match(/(?:тел|phone)\s*:\s*([+\d][\d\s().-]{6,})/i);
  if (!m) return null;
  const raw = m[1].trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.includes("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("84")) return `+${digits}`;
  return `+${digits}`;
}

function toZaloPath(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `84${digits.slice(1)}`;
  if (digits.startsWith("84")) return digits;
  return digits;
}

/** Убираем скобки вокруг номера в учёте тура (остатки от ввода вида (038)…) */
function phoneDisplayWithoutParens(fragment: string): string {
  return fragment.replace(/[()]/g, "").trim();
}

/** Если в БД/копипасте слиплись строки - вставляем перенос перед известными метками */
function normalizeBusInfoForDisplay(s: string): string {
  let t = String(s || "");
  t = t.replace(/(\d{8,})(Встреча\s*:)/gi, "$1\n$2");
  t = t.replace(/(\+84\d{8,})(Встреча\s*:)/gi, "$1\n$2");
  t = t.replace(/\)(Встреча\s*:)/gi, ")\n$1");
  t = t.replace(/([^\n])(Тел\s*:)/gi, "$1\n$2");
  t = t.replace(/([^\n])(Водитель\s*:)/gi, "$1\n$2");
  return t;
}

const BUS_BLOCK_SEP = /\n\n────────\n\n/;

function IconUsersOpen({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="6.75" cy="6.5" r="2.1" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="13.25" cy="6.5" r="2.1" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M3.25 15.75c.45-2.35 2.35-3.85 5.5-3.85s5.05 1.5 5.5 3.85M11.75 15.75c.35-1.85 1.65-3.1 3.75-3.35"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLastSeats({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 4v3M10 13v3M4 10h3M13 10h3"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="10" cy="10" r="5.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M10 7.25v2.85l1.85 1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNaborOkonchen({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5.5 10.25l2.85 2.85L15.25 6.25"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="3.5" stroke="currentColor" strokeWidth="1.35" opacity="0.35" />
    </svg>
  );
}

function IconStatusWarn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 3.5L3.5 15.5h13L10 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8v3.5M10 14.2v.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

function IconStatusBus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.5 12V6.25c0-.55.45-1 1-1h7.5c.55 0 1 .45 1 1V12M3.5 12h13M3.5 12v1.25c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V12M14.5 12v1.25c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V12"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.25 8.75h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function TourCardStatusChip({
  showBusMissing,
  overbook,
  free,
  tourDate,
  canQuickAddTourist,
  viewerRole,
  capacity,
  booked,
  tourId,
  bookingIntentHref,
  t,
}: {
  showBusMissing: boolean;
  overbook: boolean;
  free: number;
  tourDate: string;
  canQuickAddTourist: boolean;
  viewerRole?: Role;
  capacity: number;
  booked: number;
  tourId: string;
  bookingIntentHref?: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  function actionWrap(
    content: ReactNode,
    href: string,
    ariaLabel: string,
  ) {
    const finalHref = bookingIntentHref || href;
    return (
      <Link
        href={finalHref}
        className="pointer-events-auto block transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.99]"
        aria-label={ariaLabel}
      >
        {content}
      </Link>
    );
  }

  if (showBusMissing) {
    const chip = (
      <div
        className="flex w-full flex-col items-center gap-1 rounded-xl border border-amber-200/90 bg-gradient-to-b from-amber-50 via-orange-50/80 to-amber-100/40 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-amber-100/60 dark:border-amber-500/30 dark:from-amber-950/50 dark:via-orange-950/35 dark:to-amber-950/25 dark:ring-amber-400/15"
        role="status"
      >
        <IconStatusBus className="mx-auto h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-amber-900 dark:text-amber-100">
          {t("statusNoBus")}
        </span>
      </div>
    );
    return actionWrap(chip, `/tours/${tourId}`, "Открыть тур и назначить автобус");
  }
  if (overbook) {
    const canResolve = viewerRole ? canResolveTourOverbook(viewerRole) : false;
    const chip = (
      <div className="w-full">
        <div
          className="flex w-full flex-col items-center gap-1 rounded-xl border border-rose-200/90 bg-gradient-to-b from-rose-50 via-red-50/70 to-rose-100/35 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-rose-100/70 dark:border-rose-500/35 dark:from-rose-950/45 dark:via-red-950/30 dark:to-rose-950/20 dark:ring-rose-400/12"
          role="status"
        >
          <IconStatusWarn className="mx-auto h-4 w-4 text-rose-700 dark:text-rose-300" />
          <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-rose-900 dark:text-rose-100">
            {t("statusOverbook")}
          </span>
        </div>
        {canResolve ? <OverbookResolutionActions tourId={tourId} capacity={capacity} booked={booked} /> : null}
      </div>
    );
    return actionWrap(chip, `/tours/${tourId}`, "Открыть тур и скорректировать состав");
  }
  if (free === 0) {
    const chip = (
      <div
        className="flex w-full flex-col items-center gap-1 rounded-xl border border-emerald-300/90 bg-gradient-to-b from-emerald-50 via-green-50/70 to-emerald-100/35 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-emerald-200/80 dark:border-emerald-500/45 dark:from-emerald-950/55 dark:via-green-950/45 dark:to-emerald-900/35 dark:ring-emerald-400/20"
        role="status"
      >
        <IconNaborOkonchen className="h-4 w-4 text-emerald-800 dark:text-emerald-200" />
        <span className="text-[11px] font-semibold leading-snug text-emerald-950 dark:text-emerald-100">{t("statusFull")}</span>
      </div>
    );
    return actionWrap(chip, `/tours/${tourId}`, "Открыть тур и посмотреть список туристов");
  }
  if (free >= 1 && free <= 3) {
    const chip = (
      <div
        className="flex w-full flex-col items-center gap-1 rounded-xl border border-amber-200/90 bg-gradient-to-b from-amber-50 via-yellow-50/70 to-amber-100/35 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-amber-100/80 dark:border-amber-400/35 dark:from-amber-950/48 dark:via-yellow-950/25 dark:to-amber-950/22 dark:ring-amber-400/18"
        role="status"
      >
        <IconLastSeats className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <span className="text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-50">
          {t("statusFreeSeats", { n: free })}
        </span>
      </div>
    );
    return actionWrap(
      chip,
      canQuickAddTourist ? `/tours/${tourId}/new-booking` : `/tours/${tourId}`,
      canQuickAddTourist ? "Сразу добавить туриста" : "Открыть тур",
    );
  }
  const todayYmd = tourBusinessTodayYmd();
  if (tourDate < todayYmd) {
    const chip = (
      <div
        className="flex w-full flex-col items-center gap-1 rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50 via-blue-50/55 to-slate-100/40 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-slate-200/70 dark:border-slate-500/30 dark:from-slate-900/55 dark:via-blue-950/35 dark:to-slate-950/35 dark:ring-slate-400/15"
        role="status"
      >
        <IconNaborOkonchen className="h-4 w-4 text-slate-700 dark:text-slate-300" />
        <span className="text-[11px] font-semibold leading-snug text-slate-900 dark:text-slate-100">{t("statusTourDone")}</span>
      </div>
    );
    return actionWrap(chip, `/tours/${tourId}`, "Открыть карточку тура");
  }
  if (tourDate === todayYmd) {
    const chip = (
      <div
        className="flex w-full flex-col items-center gap-1 rounded-xl border border-cyan-200/90 bg-gradient-to-b from-cyan-50 via-sky-50/70 to-cyan-100/35 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-cyan-100/75 dark:border-cyan-500/30 dark:from-cyan-950/45 dark:via-sky-950/35 dark:to-cyan-950/30 dark:ring-cyan-400/15"
        role="status"
      >
        <IconUsersOpen className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
        <span className="text-[11px] font-semibold leading-snug text-cyan-950 dark:text-cyan-100">{t("statusTourToday")}</span>
      </div>
    );
    return actionWrap(
      chip,
      canQuickAddTourist ? `/tours/${tourId}/new-booking` : `/tours/${tourId}`,
      canQuickAddTourist ? "Открыть добавление туриста" : "Открыть тур",
    );
  }
  if (canQuickAddTourist) {
    return (
      <Link
        href={bookingIntentHref || `/tours/${tourId}/new-booking`}
        className="pointer-events-auto flex w-full flex-col items-center gap-1 rounded-xl border border-amber-300/90 bg-gradient-to-b from-amber-50 via-orange-50/75 to-amber-100/40 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-amber-200/80 transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.99] dark:border-amber-500/40 dark:from-amber-950/55 dark:via-orange-950/45 dark:to-amber-900/35 dark:ring-amber-400/20"
        aria-label="Открыть добавление туриста"
      >
        <IconUsersOpen className="h-4 w-4 text-amber-800 dark:text-amber-200" />
        <span className="text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-100">
          {t("statusOpenReg")}
        </span>
      </Link>
    );
  }
  return (
    <div
      className="flex w-full flex-col items-center gap-1 rounded-xl border border-amber-300/90 bg-gradient-to-b from-amber-50 via-orange-50/75 to-amber-100/40 px-2.5 py-2 text-center shadow-[var(--shadow-sm)] ring-1 ring-amber-200/80 dark:border-amber-500/40 dark:from-amber-950/55 dark:via-orange-950/45 dark:to-amber-900/35 dark:ring-amber-400/20"
      role="status"
    >
      <IconUsersOpen className="h-4 w-4 text-amber-800 dark:text-amber-200" />
      <span className="text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-100">
        {t("statusOpenReg")}
      </span>
    </div>
  );
}

function IconExpenseList({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M6.25 4.75h7.5M6.25 8.25h7.5M6.25 11.75h4.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <rect x="3.75" y="3.25" width="12.5" height="13.5" rx="3" stroke="currentColor" strokeWidth="1.35" opacity="0.35" />
    </svg>
  );
}

/** Чип на дашборде гида: статус внесения/проверки расходов категории «Гид». */
function GuideExpenseDashboardChip({ tour, t }: { tour: Tour; t: (key: string) => string }) {
  if (tour.guideExpenseLineCount === undefined || tour.guideExpenseOpenLineCount === undefined) return null;

  const todayYmd = tourBusinessTodayYmd();
  const isFutureTour = tour.date > todayYmd;
  const lines = tour.guideExpenseLineCount;
  const open = tour.guideExpenseOpenLineCount;
  const closed = Boolean(tour.guideExpenseAccountingClosed);

  if (closed) {
    return (
      <div
        className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-emerald-300/90 bg-gradient-to-b from-emerald-50 via-green-50/70 to-emerald-100/35 px-3 py-2.5 text-center shadow-[var(--shadow-sm)] ring-1 ring-emerald-200/80 dark:border-emerald-500/45 dark:from-emerald-950/55 dark:via-green-950/45 dark:to-emerald-900/35 dark:ring-emerald-400/20"
        role="status"
      >
        <IconNaborOkonchen className="h-4 w-4 text-emerald-800 dark:text-emerald-200" />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-emerald-950 dark:text-emerald-100">
          {t("expensesClosed")}
        </span>
        <span className="text-[11px] font-semibold leading-snug text-emerald-950 dark:text-emerald-50">
          {t("expensesOk")}
        </span>
      </div>
    );
  }

  if (lines === 0 && isFutureTour) {
    return (
      <div
        className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50 via-blue-50/55 to-slate-100/40 px-3 py-2.5 text-center shadow-[var(--shadow-sm)] ring-1 ring-slate-200/70 dark:border-slate-500/30 dark:from-slate-900/55 dark:via-blue-950/35 dark:to-slate-950/35 dark:ring-slate-400/15"
        role="status"
      >
        <IconExpenseList className="h-4 w-4 text-slate-700 dark:text-slate-300" />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-slate-900 dark:text-slate-100">
          {t("expensesPending")}
        </span>
        <span className="text-[11px] font-semibold leading-snug text-slate-900 dark:text-slate-100">{t("expensesPendingHint")}</span>
      </div>
    );
  }

  if (lines === 0) {
    return (
      <div
        className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-orange-200/90 bg-gradient-to-b from-orange-50 via-amber-50/70 to-orange-100/35 px-3 py-2.5 text-center shadow-[var(--shadow-sm)] ring-1 ring-orange-100/75 dark:border-orange-500/35 dark:from-orange-950/45 dark:via-amber-950/30 dark:to-orange-950/22 dark:ring-orange-400/15"
        role="status"
      >
        <IconExpenseList className="h-4 w-4 text-orange-800 dark:text-orange-200" />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-orange-950 dark:text-orange-50">
          {t("expensesEmpty")}
        </span>
        <span className="text-[11px] font-semibold leading-snug text-orange-950 dark:text-orange-50">
          {t("expensesEmptyHint")}
        </span>
      </div>
    );
  }

  if (open > 0) {
    return (
      <div
        className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-indigo-200/90 bg-gradient-to-b from-indigo-50 via-sky-50/65 to-indigo-100/35 px-3 py-2.5 text-center shadow-[var(--shadow-sm)] ring-1 ring-indigo-100/75 dark:border-indigo-500/35 dark:from-indigo-950/45 dark:via-sky-950/30 dark:to-indigo-950/22 dark:ring-indigo-400/15"
        role="status"
      >
        <IconExpenseList className="h-4 w-4 text-indigo-800 dark:text-indigo-200" />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-indigo-950 dark:text-indigo-50">
          {t("expensesInReview")}
        </span>
        <span className="text-[11px] font-semibold leading-snug text-indigo-950 dark:text-indigo-50">
          {t("expensesInReviewHint")}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-teal-200/90 bg-gradient-to-b from-teal-50 via-cyan-50/65 to-teal-100/35 px-3 py-2.5 text-center shadow-[var(--shadow-sm)] ring-1 ring-teal-100/75 dark:border-teal-500/35 dark:from-teal-950/45 dark:via-cyan-950/30 dark:to-teal-950/22 dark:ring-teal-400/15"
      role="status"
    >
      <IconNaborOkonchen className="h-4 w-4 text-teal-800 dark:text-teal-200" />
      <span className="text-[10px] font-bold uppercase leading-tight tracking-[0.12em] text-teal-950 dark:text-teal-50">
        {t("expensesAccepted")}
      </span>
      <span className="text-[11px] font-semibold leading-snug text-teal-950 dark:text-teal-50">
        {t("expensesAcceptedHint")}
      </span>
    </div>
  );
}

function BusAccountingText({ raw, guideLayout }: { raw: string; guideLayout?: boolean }) {
  const normalized = normalizeBusInfoForDisplay(raw);
  const blocks = normalized.split(BUS_BLOCK_SEP).map((b) => b.trim()).filter(Boolean);
  const parts = blocks.length > 0 ? blocks : [normalized.trim()].filter(Boolean);

  return (
    <div className={guideLayout ? "space-y-2" : "space-y-3"}>
      {parts.map((block, bi) => (
        <BusDriverCommentBlock key={bi} block={block} guideLayout={guideLayout} />
      ))}
    </div>
  );
}

function BusDriverCommentBlock({ block, guideLayout }: { block: string; guideLayout?: boolean }) {
  const lines = block.split("\n").map((l) => l.trimEnd());
  const blockPhone = extractDriverPhoneFromBusInfo(block);
  const phoneDigits = blockPhone?.replace(/[^\d]/g, "") ?? "";

  return (
    <div className={guideLayout ? "space-y-2" : "space-y-1.5 border-l-2 border-[var(--border)] pl-2.5"}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" aria-hidden />;

        const telLine = /^тел\s*:\s*(.+)$/i.exec(trimmed);
        if (telLine && phoneDigits) {
          return (
            <div key={i} className="text-sm leading-snug">
              {guideLayout ? (
                <>
                  <div className="text-[11px] font-medium text-[var(--muted2)]">Телефон</div>
                  <a
                    href={`tel:${phoneDigits}`}
                    className="pointer-events-auto relative z-[3] mt-0.5 inline-block font-medium text-[var(--text)] underline-offset-2 hover:underline"
                  >
                    {phoneDisplayWithoutParens(telLine[1].trim())}
                  </a>
                </>
              ) : (
                <p>
                  <span className="font-medium text-[var(--muted2)]">Тел:</span>{" "}
                  <a
                    href={`tel:${phoneDigits}`}
                    className="font-semibold text-[var(--text)] underline decoration-dotted underline-offset-2"
                  >
                    {phoneDisplayWithoutParens(telLine[1].trim())}
                  </a>
                </p>
              )}
            </div>
          );
        }

        if (/^встреча\s*:/i.test(trimmed)) {
          const val = trimmed.replace(/^встреча\s*:\s*/i, "").trim();
          return guideLayout ? (
            <div key={i} className="text-sm leading-snug">
              <div className="text-[11px] font-medium text-[var(--muted2)]">Встреча</div>
              <div className="mt-0.5 font-medium text-[var(--text)]">{val}</div>
            </div>
          ) : (
            <p
              key={i}
              className="rounded-lg border border-sky-200/80 bg-sky-50/90 px-2.5 py-1.5 text-[13px] leading-snug text-sky-950 dark:border-sky-800/50 dark:bg-sky-950/35 dark:text-sky-100"
            >
              <span className="font-semibold">Встреча:</span> {val}
            </p>
          );
        }

        if (/^водитель\s*:/i.test(trimmed)) {
          const name = trimmed.replace(/^водитель\s*:\s*/i, "").trim();
          return guideLayout ? (
            <div key={i} className="text-sm leading-snug">
              <div className="text-[11px] font-medium text-[var(--muted2)]">Водитель</div>
              <div className="mt-0.5 font-medium text-[var(--text)]">{name}</div>
            </div>
          ) : (
            <p key={i} className="text-[13px] leading-snug text-[var(--text)]">
              <span className="font-medium text-[var(--muted2)]">Водитель:</span>{" "}
              <span className="font-semibold">{name}</span>
            </p>
          );
        }

        const isFirstPlate = i === 0 && !/^[а-яёa-z]+:/i.test(trimmed);
        if (isFirstPlate) {
          return guideLayout ? (
            <p key={i} className="text-[15px] font-semibold tabular-nums tracking-tight text-[var(--text)]">
              {trimmed}
            </p>
          ) : (
            <p key={i} className="text-base font-bold tabular-nums tracking-tight text-[var(--text)]">
              {trimmed}
            </p>
          );
        }

        return (
          <p
            key={i}
            className={
              guideLayout
                ? "whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--muted)]"
                : "whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text)]"
            }
          >
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export async function TourCard({ tour, viewerRole, bookingIntentHref }: Props) {
  const t = await getTranslations("tour");
  const { getLocale } = await import("next-intl/server");
  const locale = await getLocale();
  const free = tour.capacity - tour.booked;
  const overbook = free < 0;
  const durationDays = inclusiveCalendarDaysBetween(
    String(tour.startAtIso || "").slice(0, 10),
    String(tour.endAtIso || tour.startAtIso || "").slice(0, 10),
  );
  const hideBusForManager = viewerRole === "manager";
  const guideTransportView = viewerRole === "guide" || viewerRole === "chief_guide";
  const hasBusAssigned = Boolean(tour.busInfo && tour.busInfo.trim());
  const showBusMissing =
    (viewerRole === "dispatcher" ||
      viewerRole === "booking_dispatcher" ||
      viewerRole === "director") &&
    !hasBusAssigned;
  const driverPhone = extractDriverPhoneFromBusInfo(tour.busInfo);
  const rawBus = tour.busInfo ?? t("notAssigned");
  const showChiefGuideAssignmentChip = viewerRole === "chief_guide";
  const canQuickAddTourist =
    viewerRole != null && canCreateBooking(viewerRole) && tour.date >= tourBusinessTodayYmd();
  return (
    <section className="card relative mb-3 block overflow-hidden">
      <Link
        href={bookingIntentHref || `/tours/${tour.id}`}
        prefetch={false}
        className="absolute inset-0 z-[1] rounded-[inherit]"
        aria-label={`Открыть тур «${tour.name}»`}
      />
      <div className="relative z-[2] pointer-events-none">
      <TourCardHeaderWithDescription
        templateId={tour.templateId}
        prefetchedDescriptionText={tour.descriptionOverride?.trim() ? tour.descriptionOverride : undefined}
        tourName={tour.name}
        tourDateLabel={formatYmdWeekdayLongDmy(tour.date, locale)}
        pickupWindow={tour.pickupWindow}
        viewerRole={viewerRole}
        statusChip={
          <>
            <TourCardStatusChip
              showBusMissing={showBusMissing}
              overbook={overbook}
              free={free}
              tourDate={tour.date}
              canQuickAddTourist={canQuickAddTourist}
              viewerRole={viewerRole}
              capacity={tour.capacity}
              booked={tour.booked}
              tourId={tour.id}
              bookingIntentHref={bookingIntentHref}
              t={t}
            />
            {showChiefGuideAssignmentChip ? (
              <ChiefGuideAssignModal
                tourId={tour.id}
                tourName={tour.name}
                tourDate={tour.date}
                pickupWindow={tour.pickupWindow}
                templateId={tour.templateId}
                primaryGuideName={tour.guideName}
              />
            ) : null}
            {guideTransportView ? <GuideExpenseDashboardChip tour={tour} t={t} /> : null}
          </>
        }
      >
        <div className="block min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="line-clamp-2 min-w-0 flex-1 text-[17px] font-semibold leading-snug tracking-tight text-[var(--text)] sm:text-[18px]">
              {tour.name}
            </div>
            {tour.descriptionOverride?.trim() ? (
              <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-300/70 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-600/45">
                {t("statusCustom")}
              </span>
            ) : null}
          </div>
          <div className="mt-2 inline-flex items-center rounded-lg bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)]/80 dark:bg-[var(--surface-elevated)]">
            {formatYmdWeekdayLongDmy(tour.date, locale)}
          </div>
          {durationDays > 1 ? (
            <div className="mt-1 inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-700/50">
              {durationDays} {t("days")}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-[var(--muted2)]">
            <span>
              <span className="font-medium text-[var(--muted)]">{t("pickup")}</span> {tour.pickupWindow}
            </span>
            <span className="text-[var(--border)] select-none" aria-hidden>
              ·
            </span>
            <span>
              <span className="font-medium text-[var(--muted)]">{t("guide")}</span> {tour.guideName}
            </span>
          </div>
        </div>
      </TourCardHeaderWithDescription>

      {guideTransportView && !hideBusForManager ? (
        <details className="pointer-events-auto relative z-[3] mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm dark:bg-[var(--surface-elevated)]">
          <summary className="cursor-pointer list-none text-sm tabular-nums text-[var(--text)]">
            <span className="font-medium">{t("occupiedOf", { booked: tour.booked, capacity: tour.capacity })}</span>
            <span className="text-[var(--muted)]"> · </span>
            <span className="font-medium">{t("freeLabel", { n: free })}</span>
            {tour.heldSeats ? <span className="ml-1 text-[var(--warn)]">· {tour.heldSeats} {t("inProgress")}</span> : null}
          </summary>
          <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
            {hasBusAssigned ? (
              tour.buses && tour.buses.length > 0 ? (
                <ul className="space-y-2">
                  {tour.buses.map((bus, i) => (
                    <GuideBusCard key={bus.id ?? `${bus.busNumber}-${i}`} bus={bus} t={t} />
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <BusAccountingText raw={rawBus} guideLayout />
                </div>
              )
            ) : (
              <p className="text-[13px] text-[var(--muted)]">{t("busNotAssigned")}</p>
            )}
          </div>
        </details>
      ) : (
        <details className="pointer-events-auto relative z-[3] mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm dark:bg-[var(--surface-elevated)]">
          <summary className="cursor-pointer list-none">
            <p className="text-sm tabular-nums text-[var(--text)]">
              <span className="font-medium">{t("occupiedOf", { booked: tour.booked, capacity: tour.capacity })}</span>
              <span className="text-[var(--muted)]"> · </span>
              <span className="font-medium">{t("freeLabel", { n: free })}</span>
            </p>
          </summary>
          <div className="mt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
            {!hideBusForManager && (viewerRole === "dispatcher" || viewerRole === "booking_dispatcher") ? (
              <div className="action-row pointer-events-auto relative z-[3]">
                <CopyDriverButton tourId={tour.id} />
                {driverPhone ? (
                  <a
                    href={`https://zalo.me/${toZaloPath(driverPhone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white ring-1 ring-sky-500/60 shadow-sm transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:ring-sky-400/50 dark:hover:bg-sky-400"
                  >
                    <span aria-hidden>💬</span>
                    {t("writeZalo")}
                  </a>
                ) : null}
              </div>
            ) : null}
            </div>
            {hideBusForManager ? null : (
              <div className="pointer-events-auto relative z-[3] mt-2.5 border-t border-[var(--border)] pt-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("busLabel")}</div>
                <div className="mt-1 min-w-0">
                  {hasBusAssigned ? <BusAccountingText raw={rawBus} /> : (
                    <span className="font-semibold text-[var(--muted)]">{rawBus}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {tour.booked > 16 && !hideBusForManager ? (
        tour.capacity > 16 ? (
          <div className="mt-2 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
            {t("bigBusHint")}
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-400">
            {t("bigBusTip")}
          </div>
        )
      ) : null}
      {viewerRole && canAssignTourBuses(viewerRole) ? (
        <div className="pointer-events-auto relative z-[3]">
          <DispatcherBusQuickForm tourId={tour.id} viewerRole={viewerRole} buses={tour.buses ?? []} />
        </div>
      ) : null}
      {viewerRole === "dispatcher" || viewerRole === "booking_dispatcher" ? (
        <div className="pointer-events-auto relative z-[3]">
          <DispatcherTourBookingQuickForm tourId={tour.id} />
        </div>
      ) : null}
      </div>
    </section>
  );
}
