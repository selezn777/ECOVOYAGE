import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatUsd, formatVnd } from "@/lib/format";
import type { CashReconciliationReport } from "@/lib/types";

function MoneyLine({
  label,
  value,
  sign,
}: {
  label: string;
  value: number;
  sign: "plus" | "minus" | "neutral";
}) {
  const tone =
    sign === "plus"
      ? "text-emerald-800/90 dark:text-emerald-400/90"
      : sign === "minus"
        ? "text-red-800/85 dark:text-red-400/85"
        : "text-[var(--text)]";
  const prefix = sign === "plus" ? "+" : sign === "minus" ? "−" : "";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
      <span className="max-w-[min(100%,22rem)] text-[13px] leading-snug text-[var(--muted)]">{label}</span>
      <span className={`shrink-0 text-right text-[13px] font-medium tabular-nums ${tone}`}>
        {prefix}
        {formatVnd(value)}
      </span>
    </div>
  );
}

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/80 px-3 py-2.5 dark:bg-[var(--surface-elevated)]/30">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">{label}</div>
      <div className="mt-1 text-[14px] font-normal tabular-nums leading-snug text-[var(--text)]">{children}</div>
    </div>
  );
}

/** Локализованное форматирование суммы в иностранной валюте (без суффикса кода валюты). */
export function formatManualForeignAmount(currencyCode: string, value: number, locale: string): string {
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "vi" ? "vi-VN" : "en-GB";
  const d = currencyCode === "JPY" || currencyCode === "VND" ? 0 : 2;
  return value.toLocaleString(intlLocale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export async function AccountingReportPeriodSummary({
  periodLabel,
  tourSnap,
  recon,
  currentBalanceVnd,
  balanceAsOfLabel,
}: {
  /** Если `null`, строка с датами периода не показывается (режим «за всё время»). */
  periodLabel: string | null;
  tourSnap: { incomeVnd: number; expenseVnd: number; netVnd: number };
  recon: CashReconciliationReport;
  currentBalanceVnd: number;
  balanceAsOfLabel: string;
}) {
  const t = await getTranslations("accountingReports");
  const touristNetVnd = Math.max(0, recon.paymentsIncomeVnd - recon.paymentsRefundVnd);
  const touristCashOfficeInPeriod = recon.paymentsOfficeCashVnd + recon.paymentsTopupRemittedInPeriodVnd;

  return (
    <section className="card mb-3 min-w-0 border-[var(--border)] bg-[var(--surface-soft)]/40 dark:bg-[var(--surface)]/50">
      <h2 className="text-sm font-semibold text-[var(--text)]">{t("summaryTitle")}</h2>
      {periodLabel ? <p className="mt-1 text-sm text-[var(--muted)]">{periodLabel}</p> : null}

      <div className="mt-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("toursAccounting")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatTile label={t("tourIncome")}>{formatVnd(tourSnap.incomeVnd)}</StatTile>
          <StatTile label={t("tourExpense")}>{formatVnd(tourSnap.expenseVnd)}</StatTile>
          <StatTile label={t("netProfit")}>
            <span
              className={
                tourSnap.netVnd >= 0
                  ? "text-emerald-800/90 dark:text-emerald-400/90"
                  : "text-red-800/85 dark:text-red-400/85"
              }
            >
              {formatVnd(tourSnap.netVnd)}
            </span>
          </StatTile>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[var(--muted2)]">{t("netProfitHint")}</p>
      </div>

      <div className="mt-5 border-t border-[var(--border)]/70 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">
          {t("touristPaymentsTitle")}
        </p>
        <div className="mt-2 divide-y divide-[var(--border)]/60">
          {recon.paymentsRefundVnd > 0 ? (
            <MoneyLine label={t("refundsToTourists")} value={recon.paymentsRefundVnd} sign="minus" />
          ) : null}
          <MoneyLine label={t("creditedToBookings")} value={touristNetVnd} sign="neutral" />
          <MoneyLine label={t("withManagers")} value={recon.paymentsDepositVnd} sign="neutral" />
          <MoneyLine label={t("inCashBox")} value={touristCashOfficeInPeriod} sign="plus" />
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)]/70 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("bookingsSnapshotTitle")}</p>
        <div className="mt-2 divide-y divide-[var(--border)]/60">
          <MoneyLine label={t("touristDebt")} value={recon.snapshotTotalBookingDueVnd} sign="neutral" />
          <MoneyLine label={t("guidePendingTopup")} value={recon.snapshotPendingGuideTopupVnd} sign="neutral" />
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)]/70 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("balanceTitle")}</p>
        <div className="mt-2 rounded-xl border border-[var(--border)]/80 bg-[var(--surface)] px-3 py-3 dark:bg-[var(--surface-elevated)]/35">
          <p className="text-[11px] text-[var(--muted)]">{t("cashBalanceCalc")}</p>
          <p className="mt-1 text-base font-medium tabular-nums text-[var(--text)]">{formatVnd(currentBalanceVnd)}</p>
          <p className="mt-1 text-[11px] text-[var(--muted2)]">{t("asOfDate", { date: balanceAsOfLabel })}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted2)]">
        <Link href="/cash" className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
          {t("openCashLink")}
        </Link>
      </p>
    </section>
  );
}

/** Для списка способов сдачи: доллары из строки или прочерк. */
export function handoverChannelUsdDisplay(
  sumUsd: number,
): { text: string; sub?: string } {
  if (sumUsd > 0) return { text: formatUsd(sumUsd) };
  return { text: "-" };
}
