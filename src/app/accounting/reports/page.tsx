import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import {
  AccountingReportPeriodSummary,
  formatManualForeignAmount,
  handoverChannelUsdDisplay,
} from "@/components/accounting-report-period-summary";
import { GoogleSyncPanel } from "@/components/google-sync-panel";
import { requireRoles } from "@/lib/auth-session";
import { ACCOUNTING_REPORTS_ACCESS_ROLES } from "@/lib/role-policy";
import { getCashDashboardData, getCashReconciliationReport, getFinanceSnapshotForYmdRange } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import {
  formatYmdWithWeekday,
  localDateString,
  monthBoundsYmdFromAnchor,
  tourBusinessTodayYmd,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

function pickSp(v?: string | string[]): string {
  if (v == null) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

/** Нижняя граница «за всё время» для сверки (достаточно для любых данных в системе). */
const REPORT_ALL_TIME_FROM = "2000-01-01";

export default async function AccountingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const user = await requireRoles([...ACCOUNTING_REPORTS_ACCESS_ROLES]);
  const t = await getTranslations("accountingReports");
  const locale = await getLocale();
  const sp = await searchParams;
  const today = tourBusinessTodayYmd();
  const monthDefault = monthBoundsYmdFromAnchor(today) ?? { from: today, to: today };
  const fromRaw = pickSp(sp.from).trim();
  const toRaw = pickSp(sp.to).trim();
  const hasFrom = fromRaw !== "" && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw);
  const hasTo = toRaw !== "" && /^\d{4}-\d{2}-\d{2}$/.test(toRaw);
  let fromYmd: string;
  let toYmd: string;
  if (!hasFrom && !hasTo) {
    fromYmd = monthDefault.from;
    toYmd = monthDefault.to;
  } else if (hasFrom && hasTo) {
    fromYmd = fromRaw;
    toYmd = toRaw;
  } else if (hasFrom && !hasTo) {
    fromYmd = fromRaw;
    if (fromRaw === REPORT_ALL_TIME_FROM) {
      toYmd = today;
    } else {
      const b = monthBoundsYmdFromAnchor(fromRaw);
      toYmd = b?.to ?? today;
    }
  } else {
    /* !hasFrom && hasTo - месяц всегда с 1-го числа */
    const b = monthBoundsYmdFromAnchor(toRaw);
    fromYmd = b?.from ?? today;
    toYmd = toRaw;
  }
  if (fromYmd > toYmd) {
    const t2 = fromYmd;
    fromYmd = toYmd;
    toYmd = t2;
  }

  const todayYmd = localDateString();
  const [report, tourSnap, cashNow] = await Promise.all([
    getCashReconciliationReport(fromYmd, toYmd),
    getFinanceSnapshotForYmdRange(fromYmd, toYmd),
    getCashDashboardData(todayYmd, { role: user.role, id: user.id }),
  ]);

  const totalHandoverVnd = report ? report.handoverTotalsRows.reduce((s, row) => s + row.sumVnd, 0) : 0;
  const nonEmptyHandoverRows = report ? report.handoverTotalsRows.filter((row) => row.count > 0 || row.sumVnd !== 0 || row.sumUsd !== 0) : [];

  const isAllTimeRange = fromYmd === REPORT_ALL_TIME_FROM;
  const intlLocale = locale === "ru" ? "ru-RU" : locale === "vi" ? "vi-VN" : "en-GB";
  const periodLabel: string | null = isAllTimeRange
    ? null
    : fromYmd === toYmd
      ? new Date(`${fromYmd}T12:00:00`).toLocaleDateString(intlLocale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : `${new Date(`${fromYmd}T12:00:00`).toLocaleDateString(intlLocale, { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${toYmd}T12:00:00`).toLocaleDateString(intlLocale, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <section className="card mb-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/80 pb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">{t("title")}</h2>
        </div>
        <div className="mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("periodSectionTitle")}</h3>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">{t("periodHint")}</p>
        <form method="get" className="flex flex-col gap-4">
          {isAllTimeRange ? (
            <>
              <input type="hidden" name="from" value={fromYmd} />
              <input type="hidden" name="to" value={toYmd} />
              <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--surface-soft)]/50 px-3 py-3 text-sm text-[var(--muted)] dark:bg-[var(--surface-elevated)]/20">
                <p className="mb-2">{t("allTimeNotice")}</p>
                <p>
                  <Link
                    href={`/accounting/reports`}
                    className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    {t("currentMonthReport")}
                  </Link>
                  {" · "}
                  <Link
                    href={`/accounting/reports?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`}
                    className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    {t("today")}
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
                {t("fromDate")}
                <input
                  type="date"
                  name="from"
                  defaultValue={fromYmd}
                  className="field-surface min-h-[44px] rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
                {t("toDate")}
                <input
                  type="date"
                  name="to"
                  defaultValue={toYmd}
                  className="field-surface min-h-[44px] rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3 border-t border-[var(--border)]/80 pt-3">
            <button
              type="submit"
              className="btn-primary min-h-[44px] shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold touch-manipulation"
            >
              {t("showButton")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)]/80 pt-3">
            <Link
              href={`/accounting/reports?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-4 py-2 text-[13px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)] active:opacity-90"
            >
              {t("today")}
            </Link>
            <Link
              href={`/accounting/reports?from=${encodeURIComponent(REPORT_ALL_TIME_FROM)}&to=${encodeURIComponent(today)}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-4 py-2 text-[13px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)] active:opacity-90"
            >
              {t("allTime")}
            </Link>
          </div>
        </form>
      </section>

      {!report ? (
        <section className="card">
          <p className="text-sm text-[var(--muted)]">{t("buildFailed")}</p>
        </section>
      ) : (
        <>
          <AccountingReportPeriodSummary
            periodLabel={periodLabel}
            tourSnap={tourSnap}
            recon={report}
            currentBalanceVnd={cashNow.currentBalanceVnd}
            balanceAsOfLabel={formatYmdWithWeekday(todayYmd, locale)}
          />

          <section className="card mb-3 min-w-0">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">{t("handoversByMethodTitle")}</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {isAllTimeRange ? t("handoverPeriodAllTime") : t("handoverPeriodRange", { from: fromYmd, to: toYmd })}{" "}
              {t("handoverTotalLabel")} <span className="font-semibold text-[var(--text)]">{formatVnd(totalHandoverVnd)}</span>
            </p>
            <ul className="space-y-2">
              {nonEmptyHandoverRows.length === 0 ? (
                <li className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 p-3 text-xs text-[var(--muted)]">
                  {t("noHandoversInPeriod")}
                </li>
              ) : (
                nonEmptyHandoverRows.map((row) => {
                const usd = handoverChannelUsdDisplay(row.sumUsd);
                return (
                  <li
                    key={row.channelId}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-3 dark:bg-[var(--surface-elevated)]/25"
                  >
                    <p className="font-medium text-[var(--text)]">{row.label}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-[var(--muted2)]">{t("opsCount")}</span>
                        <div className="tabular-nums font-medium text-[var(--muted)]">{row.count}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">{t("amountVnd")}</span>
                        <div className="tabular-nums font-semibold">{formatVnd(row.sumVnd)}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">{t("amountUsd")}</span>
                        <div className="tabular-nums text-[var(--muted)]">{usd.text}</div>
                        {usd.sub ? <div className="mt-0.5 text-[10px] text-[var(--muted2)]">{usd.sub}</div> : null}
                      </div>
                    </div>
                  </li>
                );
                })
              )}
            </ul>
          </section>
          {report.manualForeignRows.length > 0 ? (
            <section className="card mb-3 min-w-0">
              <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">{t("manualForeignTitle")}</h2>
              <p className="mb-3 text-xs text-[var(--muted)]">{t("manualForeignHint")}</p>
              <ul className="space-y-2">
                {report.manualForeignRows.map((row) => (
                  <li key={row.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-3">
                    <p className="font-medium text-[var(--text)]">
                      {row.paymentKind === "cash" ? t("kindCash") : row.paymentKind === "bank_transfer" ? t("kindBank") : t("kindOther")} ·{" "}
                      {row.currencyCode} · {row.direction === "in" ? t("directionIn") : t("directionOut")}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-[var(--muted2)]">{t("opsCount")}</span>
                        <div className="tabular-nums font-medium text-[var(--muted)]">{row.count}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">{t("amountVnd")}</span>
                        <div className="tabular-nums font-semibold">{formatVnd(row.sumVnd)}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">{t("amountCurrency", { code: row.currencyCode })}</span>
                        <div className="tabular-nums text-[var(--muted)]">{formatManualForeignAmount(row.currencyCode, row.sumForeign, locale)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <GoogleSyncPanel />
    </main>
  );
}
