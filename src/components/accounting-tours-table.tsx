"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AccountingTourRow } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { formatYmdDmyWeekdayLongRu } from "@/lib/scheduling";
import { AccountingGuideDepositButton } from "@/components/accounting-guide-deposit-button";

function groupRowsByTourDate(rows: AccountingTourRow[]): AccountingTourRow[][] {
  const out: AccountingTourRow[][] = [];
  for (const t of rows) {
    const last = out[out.length - 1];
    if (last && last[0]?.tourDate === t.tourDate) last.push(t);
    else out.push([t]);
  }
  return out;
}

export function AccountingToursTable({
  rows,
  upcomingTab,
}: {
  rows: AccountingTourRow[];
  upcomingTab: boolean;
  todayYmd: string;
}) {
  const router = useRouter();
  const runs = useMemo(() => groupRowsByTourDate(rows), [rows]);

  return (
    <div className="space-y-4">
      {runs.map((run: AccountingTourRow[]) => {
        const ymdOk = /^\d{4}-\d{2}-\d{2}$/.test(run[0]!.tourDate);
        const dateLabel = ymdOk ? formatYmdDmyWeekdayLongRu(run[0]!.tourDate) : run[0]!.tourDate;
        return (
          <section key={run[0]!.tourDate} className="overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text)]">
              {dateLabel}
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {run.map((t: AccountingTourRow) => (
                <li key={t.tourId} className="bg-[var(--surface)] px-3 py-3">
                  <button
                    type="button"
                    className="group w-full text-left"
                    onClick={() => router.push(`/tours/${t.tourId}/accounting`)}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--accent)]">
                          {t.tourName}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                          {t.pax} чел.
                          {t.managerName ? <span> · менеджер: {t.managerName}</span> : null}
                          {t.guideName ? <span> · гид: {t.guideName}</span> : null}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                          t.accountingStatus === "closed"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        }`}
                      >
                        {t.accountingStatus === "closed" ? "Закрыто" : "Открыто"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <TourMoneyTile label="Доход" value={formatVnd(t.incomeVnd)} tone="green" />
                      <TourMoneyTile label="Расход" value={formatVnd(t.expenseVnd)} tone="red" />
                      <TourMoneyTile label="Прибыль" value={formatVnd(t.profitVnd)} tone={t.profitVnd >= 0 ? "green" : "red"} />
                      <TourMoneyTile
                        label="На руках"
                        value={formatVnd(t.managerTourCashOutstandingVnd ?? 0)}
                        tone={(t.managerTourCashOutstandingVnd ?? 0) > 0 ? "amber" : "muted"}
                      />
                    </div>
                    {(t.guideCashDepositVnd ?? 0) > 0 ? (
                      <p className="mt-2 text-[11px] tabular-nums text-[var(--muted)]">
                        Депозит гиду: <span className="font-semibold text-[var(--text)]">{formatVnd(t.guideCashDepositVnd ?? 0)}</span>
                      </p>
                    ) : null}
                  </button>

                  {upcomingTab ? (
                    <div className="mt-2">
                      <AccountingGuideDepositButton
                        tourId={t.tourId}
                        tourName={t.tourName}
                        currentVnd={t.guideCashDepositVnd ?? null}
                        buttonLabel="Депозит гиду"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TourMoneyTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "amber" | "muted";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "red"
        ? "text-red-700 dark:text-red-300"
        : tone === "amber"
          ? "text-amber-700 dark:text-amber-300"
          : "text-[var(--text)]";
  return (
    <span className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-2">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{label}</span>
      <span className={`mt-0.5 block truncate text-[12px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </span>
  );
}
