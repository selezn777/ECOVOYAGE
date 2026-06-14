import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import {
  AccountingReportPeriodSummary,
  handoverChannelUsdDisplay,
} from "@/components/accounting-report-period-summary";
import { AccountingReportsExportBar } from "@/components/accounting-reports-export-bar";
import { requireRoles } from "@/lib/auth-session";
import { ACCOUNTING_REPORTS_ACCESS_ROLES } from "@/lib/role-policy";
import { getCashDashboardData, getCashReconciliationReport, getFinanceSnapshotForYmdRange } from "@/lib/data";
import {
  formatVnd,
} from "@/lib/format";
import {
  formatYmdWithWeekdayRu,
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
    const t = fromYmd;
    fromYmd = toYmd;
    toYmd = t;
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
  const periodLabelRu: string | null = isAllTimeRange
    ? null
    : fromYmd === toYmd
      ? new Date(`${fromYmd}T12:00:00`).toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : `${new Date(`${fromYmd}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} - ${new Date(`${toYmd}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <h1 className="sr-only">Отчёт</h1>
      <section className="card mb-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/80 pb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Сверка за период</h2>
        </div>
        <div className="mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Период</h3>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          По умолчанию - с 1-го по последний день текущего календарного месяца (таймзона туров). Укажите интервал или выберите
          быстрый вариант.
        </p>
        <form method="get" className="flex flex-col gap-4">
          {isAllTimeRange ? (
            <>
              <input type="hidden" name="from" value={fromYmd} />
              <input type="hidden" name="to" value={toYmd} />
              <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--surface-soft)]/50 px-3 py-3 text-sm text-[var(--muted)] dark:bg-[var(--surface-elevated)]/20">
                <p className="mb-2">Выбран режим «За всё время» - конкретный диапазон дат здесь не показывается.</p>
                <p>
                  <Link
                    href={`/accounting/reports`}
                    className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    Отчёт за текущий месяц
                  </Link>
                  {" · "}
                  <Link
                    href={`/accounting/reports?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`}
                    className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    За сегодня
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
                С даты
                <input
                  type="date"
                  name="from"
                  defaultValue={fromYmd}
                  className="field-surface min-h-[44px] rounded-xl px-3 py-2.5 text-sm"
                />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
                По дату
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
              Показать
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)]/80 pt-3">
            <Link
              href={`/accounting/reports?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-4 py-2 text-[13px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)] active:opacity-90"
            >
              За сегодня
            </Link>
            <Link
              href={`/accounting/reports?from=${encodeURIComponent(REPORT_ALL_TIME_FROM)}&to=${encodeURIComponent(today)}`}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[var(--surface-soft)] px-4 py-2 text-[13px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-elevated)] active:opacity-90"
            >
              За всё время
            </Link>
          </div>
        </form>
      </section>

      {!report ? (
        <section className="card">
          <p className="text-sm text-[var(--muted)]">Не удалось построить отчёт. Проверьте даты и настройку Supabase.</p>
        </section>
      ) : (
        <>
          <AccountingReportPeriodSummary
            periodLabel={periodLabelRu}
            tourSnap={tourSnap}
            recon={report}
            currentBalanceVnd={cashNow.currentBalanceVnd}
            balanceAsOfLabel={formatYmdWithWeekdayRu(todayYmd)}
          />

          <section className="card mb-3 min-w-0">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Сдачи с туров по каналам</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {isAllTimeRange ? (
                <>
                  За весь период учёта (включительно). Итого в донгах по сдачам:{" "}
                  <span className="font-semibold text-[var(--text)]">{formatVnd(totalHandoverVnd)}</span>
                </>
              ) : (
                <>
                  Период: {fromYmd} - {toYmd} (включительно). Итого в донгах по сдачам:{" "}
                  <span className="font-semibold text-[var(--text)]">{formatVnd(totalHandoverVnd)}</span>
                </>
              )}
            </p>
            <ul className="space-y-2">
              {nonEmptyHandoverRows.length === 0 ? (
                <li className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/40 p-3 text-xs text-[var(--muted)]">
                  В выбранном периоде нет сдач по каналам.
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
                        <span className="text-[var(--muted2)]">Операций</span>
                        <div className="tabular-nums font-medium text-[var(--muted)]">{row.count}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">Сумма ₫</span>
                        <div className="tabular-nums font-semibold">{formatVnd(row.sumVnd)}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">Сумма USD</span>
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
              <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Ручные операции в иностранной валюте</h2>
              <p className="mb-3 text-xs text-[var(--muted)]">
                Все внесённые иностранные суммы за период учитываются отдельно, чтобы не терять наличные/переводы.
              </p>
              <ul className="space-y-2">
                {report.manualForeignRows.map((row) => (
                  <li key={row.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-3">
                    <p className="font-medium text-[var(--text)]">
                      {row.paymentKind === "cash" ? "Наличные" : row.paymentKind === "bank_transfer" ? "Банк" : "Прочее"} · {row.currencyCode} ·{" "}
                      {row.direction === "in" ? "в кассу" : "из кассы"}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <span className="text-[var(--muted2)]">Операций</span>
                        <div className="tabular-nums font-medium text-[var(--muted)]">{row.count}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">Сумма ₫</span>
                        <div className="tabular-nums font-semibold">{formatVnd(row.sumVnd)}</div>
                      </div>
                      <div>
                        <span className="text-[var(--muted2)]">Сумма {row.currencyCode}</span>
                        <div className="tabular-nums text-[var(--muted)]">{row.sumForeign.toLocaleString("ru-RU")}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="card mt-3 border-[var(--border)] bg-[var(--surface-soft)]/35 dark:bg-[var(--surface-elevated)]/20">
        <h2 className="text-sm font-semibold text-[var(--text)]">Выгрузки для бухгалтерии и директора</h2>
        <AccountingReportsExportBar
          fromYmd={fromYmd}
          toYmd={toYmd}
          downloadBaseName={isAllTimeRange ? `otchyot-za-vse-vremya-do-${toYmd}` : undefined}
        />
      </section>
    </main>
  );
}
