import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccountingActionsProvider } from "@/components/accounting-actions-context";
import { TopNav } from "@/components/top-nav";
import { TourAccountingAckManifestButton } from "@/components/tour-accounting-ack-manifest-button";
import { TourAccountingRefundBlock } from "@/components/tour-accounting-refund-block";
import { AccountingExpenseLine } from "@/components/accounting-expense-line";
import { TourAccountantSalaryBlock } from "@/components/tour-accountant-salary-block";
import { TourAccountingGuideTopupActions } from "@/components/tour-accounting-guide-topup-actions";
import { TourAccountingFooterButtons } from "@/components/tour-accounting-footer-buttons";
import { TourAccountingOfficialShopBlock } from "@/components/tour-accounting-official-shop-block";
import { TourGuideSettlementPanel } from "@/components/tour-guide-settlement-panel";

import { AccountingNavBack } from "@/components/accounting-nav-back";
import {
  getTourById,
  getTourManifestForTour,
  guideNamesByIds,
  listBookingsForTour,
  listExpensesForTour,
  listShopSalaryRecordsForTour,
} from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { requireAuth } from "@/lib/auth-session";
import { parseShopExtraNote } from "@/lib/shop-salary-note-parse";
import { partitionDispatcherExpenses } from "@/lib/tour-expense-partition";
import { computeTourGuideSettlementBreakdown } from "@/lib/tour-guide-settlement";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";
import type { PaymentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function paymentStatusText(
  s: PaymentStatus,
  t: { tour: (key: string) => string; booking: (key: string) => string },
): string {
  if (s === "paid") return t.tour("paid");
  if (s === "partial") return t.booking("partial");
  return t.tour("debt");
}

function paymentStatusPillClass(s: PaymentStatus): string {
  if (s === "paid") {
    return "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800/55";
  }
  return "bg-red-50 text-red-900 ring-1 ring-red-200/90 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900/50";
}

function topupRemittedVnd(b: { topupVnd: number; pendingGuideTopupVnd?: number }): number {
  return Math.max(0, b.topupVnd - (b.pendingGuideTopupVnd ?? 0));
}

/** Деньги, уже в центральной кассе: офис по брони + доплаты гида после подтверждения бухгалтером. */
function centralOfficeCashVnd(b: { officeCashVnd?: number; topupVnd: number; pendingGuideTopupVnd?: number }): number {
  return (b.officeCashVnd ?? 0) + topupRemittedVnd(b);
}


function isFullyRemittedToCentralCash(b: {
  totalVnd: number;
  dueVnd: number;
  officeCashVnd?: number;
  topupVnd: number;
  pendingGuideTopupVnd?: number;
}): boolean {
  if (b.totalVnd <= 0 || b.dueVnd > 0) return false;
  return centralOfficeCashVnd(b) >= b.totalVnd;
}

function remittedToCashPillClass(): string {
  return "bg-sky-50 text-sky-900 ring-1 ring-sky-200/90 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-800/55";
}

export default async function TourAccountingSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  if (user.role !== "accountant") {
    const { id } = await params;
    redirect(`/tours/${id}`);
  }

  const t = await getTranslations("accounting");
  const tTour = await getTranslations("tour");
  const tBooking = await getTranslations("booking");
  const tCommon = await getTranslations("common");
  const paymentStatusT = { tour: tTour, booking: tBooking };

  const { id } = await params;
  const [tour, rows, expenses, manifestState, shopRows] = await Promise.all([
    getTourById(id),
    listBookingsForTour(id),
    listExpensesForTour(id),
    getTourManifestForTour(id),
    listShopSalaryRecordsForTour(id),
  ]);
  if (!tour) notFound();

  const todayYmd = tourBusinessTodayYmd();
  const isPastOrToday = tour.date <= todayYmd;
  const { guide: guideExpenses } = partitionDispatcherExpenses(expenses);
  const depositVnd = tour.guideCashDepositVnd && tour.guideCashDepositVnd > 0 ? tour.guideCashDepositVnd : null;

  const expectedPax = rows.reduce((s, b) => s + b.adults + b.children + b.infants, 0);
  const guideExpensesTotalVnd = guideExpenses.reduce((s, e) => s + e.amountVnd, 0);

  const shopOfficeTotalVnd = shopRows.reduce((s, r) => {
    if (!r.shopAccountantConfirmedAt || r.shopAccountantOfficeVnd == null) return s;
    const settlement = parseShopExtraNote(r.note).settlement;
    if (settlement === "office_received") return s;
    return s + Math.max(0, Number(r.shopAccountantOfficeVnd) || 0);
  }, 0);
  const shopGuideDueFromOfficeVnd = shopRows.reduce((s, r) => {
    if (!r.shopAccountantConfirmedAt || r.shopAccountantGuideVnd == null) return s;
    const settlement = parseShopExtraNote(r.note).settlement;
    if (settlement !== "office_received") return s;
    if (r.status === "paid") return s;
    return s + Math.max(0, Number(r.shopAccountantGuideVnd) || 0);
  }, 0);

  const pendingTopupsSumVnd = rows.reduce((s, b) => s + (b.pendingGuideTopupVnd ?? 0), 0);
  const sumAdults = rows.reduce((s, b) => s + b.adults, 0);
  const sumChildren = rows.reduce((s, b) => s + b.children, 0);
  const sumInfants = rows.reduce((s, b) => s + b.infants, 0);
  const sumTotalVnd = rows.reduce((s, b) => s + b.totalVnd, 0);
  const sumCentralOfficeVnd = rows.reduce((s, b) => s + centralOfficeCashVnd(b), 0);
  const sumDueVnd = rows.reduce((s, b) => s + b.dueVnd, 0);
  const bookingCount = rows.length;
  const hasAnyBookingDebt = rows.some((b) => b.dueVnd > 0);

  const settlementBreakdown = computeTourGuideSettlementBreakdown({
    pendingTopupsSumVnd,
    touristDebtSumVnd: isPastOrToday ? sumDueVnd : 0,
    guideCashDepositVnd: depositVnd,
    guideExpensesTotalVnd,
    shopOfficeTotalVnd,
    shopGuideDueFromOfficeVnd,
    accountantGuideSalaryVnd: tour.accountantGuideSalaryVnd ?? null,
  });

  const guideIds = [...new Set(shopRows.map((r) => r.guideId))];
  const guideNameMap = await guideNamesByIds(guideIds);
  const guideNameById = Object.fromEntries(guideNameMap);

  const bookingsBrief = rows.map((b) => ({
    id: b.id,
    customerName: b.customerName,
    hotel: b.hotel,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
  }));

  const receiptHintContext = { tourDateYmd: tour.date, expectedPax };

  return (
    <AccountingActionsProvider>
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <AccountingNavBack />
        <Link
          href={`/tours/${id}`}
          className="text-[11px] font-medium text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
        >
          {t("tourCard")}
        </Link>
      </div>

      {/* Шапка тура */}
      <section className="card mb-3">
        <h1 className="text-base font-semibold leading-snug text-[var(--text)]">{tour.name}</h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(tour.date)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] text-[var(--muted2)]">{t("bookingsCount")}</div>
            <div className="mt-0.5 font-semibold text-[var(--text)]">{bookingCount} · {sumAdults + sumChildren + sumInfants} {tTour("pax")}</div>
          </div>
          <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] text-[var(--muted2)]">{t("toPay")}</div>
            <div className="mt-0.5 tabular-nums font-semibold text-[var(--text)]">{formatVnd(sumTotalVnd)}</div>
          </div>
          <div className={`rounded-xl px-2 py-2 ring-1 ${sumDueVnd > 0 ? "bg-red-50 ring-red-200/80 dark:bg-red-950/30 dark:ring-red-800/50" : "bg-emerald-50 ring-emerald-200/80 dark:bg-emerald-950/30 dark:ring-emerald-800/50"}`}>
            <div className="text-[10px] text-[var(--muted2)]">{tTour("debt")}</div>
            <div className={`mt-0.5 tabular-nums font-semibold ${sumDueVnd > 0 ? "text-red-800 dark:text-red-200" : "text-emerald-800 dark:text-emerald-200"}`}>
              {sumDueVnd > 0 ? formatVnd(sumDueVnd) : tCommon("no")}
            </div>
          </div>
        </div>
      </section>

      {/* 1. Туристы — компактный список */}
      <section className="card mb-3">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">{t("touristsHeading")}</h2>
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((b) => (
            <li key={b.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">{b.customerName}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {b.hotel || "—"} · {b.managerName} · {b.adults + b.children + b.infants} {tTour("pax")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${paymentStatusPillClass(b.paymentStatus)}`}>
                    {paymentStatusText(b.paymentStatus, paymentStatusT)}
                  </span>
                  {isFullyRemittedToCentralCash(b) ? (
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${remittedToCashPillClass()}`}>
                      {t("inCashBadge")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase text-[var(--muted2)]">{t("toPay")}</div>
                  <div className="tabular-nums font-medium text-[var(--text)]">{formatVnd(b.totalVnd)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[var(--muted2)]">{t("inCash")}</div>
                  <div className="tabular-nums text-[var(--muted)]">{formatVnd(centralOfficeCashVnd(b))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[var(--muted2)]">{tTour("debt")}</div>
                  <div className={`tabular-nums font-medium ${b.dueVnd > 0 ? "text-red-700 dark:text-red-300" : "text-[var(--muted)]"}`}>
                    {formatVnd(b.dueVnd)}
                  </div>
                </div>
              </div>
              {(b.pendingGuideTopupVnd ?? 0) > 0 ? (
                <div className="mt-2 rounded-lg bg-amber-50/80 px-2.5 py-2 ring-1 ring-amber-200/70 dark:bg-amber-950/25 dark:ring-amber-800/40">
                  <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
                    {t("guideTopupDue", { amount: formatVnd(b.pendingGuideTopupVnd ?? 0) })}
                  </span>
                  {(b.pendingGuideTopups?.length ?? 0) > 0 ? (
                    <div className="mt-1.5">
                      <TourAccountingGuideTopupActions pendingTopups={b.pendingGuideTopups ?? []} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {/* Итого */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-soft)] p-3 text-xs ring-1 ring-[var(--border)]">
          <div>
            <div className="text-[10px] uppercase text-[var(--muted2)]">{t("toPay")}</div>
            <div className="tabular-nums font-semibold">{formatVnd(sumTotalVnd)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--muted2)]">{t("inCash")}</div>
            <div className="tabular-nums font-semibold text-[var(--muted)]">{formatVnd(sumCentralOfficeVnd)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--muted2)]">{tTour("debt")}</div>
            <div className={`tabular-nums font-semibold ${hasAnyBookingDebt ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              {formatVnd(sumDueVnd)}
            </div>
          </div>
          {pendingTopupsSumVnd > 0 ? (
            <div className="col-span-3">
              <div className="text-[10px] uppercase text-[var(--muted2)]">{t("guideTopupDueTotal")}</div>
              <div className="tabular-nums font-semibold text-amber-900 dark:text-amber-200">{formatVnd(pendingTopupsSumVnd)}</div>
            </div>
          ) : null}
        </div>
      </section>

      {/* 2. Возвраты по неявкам */}
      {manifestState.manifest ? (
        <section className="card mb-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">{t("noShowRefunds")}</h2>
            {manifestState.manifest.needsAccountantReview ? <TourAccountingAckManifestButton tourId={id} /> : null}
          </div>
          <TourAccountingRefundBlock tourId={id} bookings={bookingsBrief} absences={manifestState.absences} />
        </section>
      ) : null}

      {/* 3. Расходы и доходы гида */}
      <section className="card mb-3">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">{t("guideExpensesIncome")}</h2>
        {isPastOrToday && depositVnd ? (
          <p className="mb-2 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5 text-xs font-medium tabular-nums text-[var(--text)] ring-1 ring-[var(--border)]">
            {t("depositFromCashbox", { amount: formatVnd(depositVnd) })}
          </p>
        ) : null}
        {guideExpenses.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">{t("noGuideExpenseLines")}</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {guideExpenses.map((e) => (
              <AccountingExpenseLine key={e.id} expense={e} receiptHintContext={receiptHintContext} />
            ))}
          </ul>
        )}
        <TourAccountingOfficialShopBlock tourId={id} rows={shopRows} guideNameById={guideNameById} variant="embedded" />
      </section>

      {/* 4. Зарплата гида */}
      <TourAccountantSalaryBlock
        key={id}
        tourId={id}
        initialSalaryVnd={tour.accountantGuideSalaryVnd ?? null}
        initialSheetJson={tour.accountantSalarySheetJson ?? null}
      />

      {/* 5. Расчёт с гидом */}
      <section className="card mb-3">
        <TourGuideSettlementPanel
          tourId={id}
          breakdown={settlementBreakdown}
          guidePaidOfficeAt={tour.guideSettlementGuidePaidOfficeAt ?? null}
          guidePaidOfficeProofUrl={tour.guideSettlementGuidePaidOfficeProofUrl ?? null}
          officePaidGuideAt={tour.guideSettlementOfficePaidGuideAt ?? null}
          officePaidGuideProofUrl={tour.guideSettlementOfficePaidGuideProofUrl ?? null}
          noTopMargin
        />
      </section>

      <TourAccountingFooterButtons tourId={id} />
    </main>
    </AccountingActionsProvider>
  );
}
