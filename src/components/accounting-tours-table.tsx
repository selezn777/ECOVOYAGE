"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AccountingTourRow } from "@/lib/data";
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
  todayYmd,
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
                    <p className="text-[15px] font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--accent)]">
                      {t.tourName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                      {t.pax} чел.
                      {t.managerName ? <span> · {t.managerName}</span> : null}
                    </p>
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
