"use client";

import Link from "next/link";
import { formatVnd } from "@/lib/format";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import type { GuideShopPeriodPreset, GuideShopSnapshot } from "@/lib/types";

const PRESETS: { value: GuideShopPeriodPreset; label: string }[] = [
  { value: "day", label: "День" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Всё время" },
];

export function GuideShopPerformancePanel({
  employeeId,
  snapshot,
}: {
  employeeId: string;
  snapshot: GuideShopSnapshot;
}) {
  const pendingInPeriodVnd = Math.max(0, snapshot.accruedInPeriodVnd - snapshot.paidInPeriodVnd);
  const pendingAllTimeVnd = Math.max(0, snapshot.allTimeAccruedVnd - snapshot.allTimePaidVnd);
  return (
    <section className="card mb-3">
      <h2 className="mb-1 text-base font-semibold">Магазин (официальный)</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        Карточка синхронизирована с кассой: фиксируем факт выплаты и отдельно показываем суммы, которые еще ожидают выплату.
      </p>
      <div
        className="mb-3 flex min-w-0 flex-nowrap overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-soft)] shadow-[var(--shadow-sm)]"
        role="tablist"
        aria-label="Период для блока магазина"
      >
        {PRESETS.map((p, i) => (
          <Link
            key={p.value}
            href={`/team/${employeeId}?shop_period=${p.value}`}
            scroll={false}
            className={`flex min-h-[40px] min-w-0 flex-1 items-center justify-center border-0 px-2 py-2 text-center text-xs font-semibold transition-colors sm:text-[13px] ${
              i > 0 ? "border-l border-[var(--border)]" : ""
            } ${
              snapshot.preset === p.value
                ? "bg-[var(--accent)] text-white shadow-inner"
                : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-[var(--muted2)]">{snapshot.periodLabelRu}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Начислено (всё время)</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">{formatVnd(snapshot.allTimeAccruedVnd)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Выплачено (всё время)</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatVnd(snapshot.allTimePaidVnd)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-amber-50/80 px-3 py-3 shadow-[var(--shadow-sm)] dark:bg-amber-950/25">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">К выплате (всё время)</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300">{formatVnd(pendingAllTimeVnd)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Начислено (период)</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">{formatVnd(snapshot.accruedInPeriodVnd)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Записей (магазин)</div>
          <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">{snapshot.allTimeRecordsCount}</div>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border)]/70 pt-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Разбивка по датам</h3>
        {snapshot.byDateRows.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">За выбранный период нет записей магазина.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {snapshot.byDateRows.map((row) => (
              <li
                key={row.ymd}
                className="grid grid-cols-1 gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto]"
              >
                <span className="font-medium text-[var(--text)]">{formatYmdWithWeekdayRu(row.ymd)}</span>
                <span className="tabular-nums text-emerald-700 dark:text-emerald-400">Выплачено: {formatVnd(row.paidVnd)}</span>
                <span className="tabular-nums text-amber-700 dark:text-amber-300">
                  Ожидает: {formatVnd(Math.max(0, row.accruedVnd - row.paidVnd))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
