"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ManagerDashboardSalesStats } from "@/lib/data";
import { formatVnd } from "@/lib/format";

const reportChipClass =
  "rounded-xl px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]";

type Scope = "day" | "month" | "all";

function tourEarningsVnd(salesVnd: number, percent: number): number {
  return Math.round((salesVnd * percent) / 100);
}

function ticketLineLabel(scope: Scope): string {
  switch (scope) {
    case "day":
      return "Билеты за день";
    case "month":
      return "Билеты за месяц";
    default:
      return "Билеты за всё время";
  }
}

export function ManagerSalesToggle({
  stats,
  children,
}: {
  stats: ManagerDashboardSalesStats;
  /** Ряд «Список» / «Календарь» - слева от кнопки «Отчёт», в одном стиле */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("month");
  const [withTickets, setWithTickets] = useState(false);

  const slice = useMemo(() => {
    switch (scope) {
      case "day":
        return {
          bookings: stats.dayBookingsCount,
          sales: stats.daySalesTotalVnd,
          ticketPeriod: stats.ticketDayProfitVnd,
        };
      case "month":
        return {
          bookings: stats.monthBookingsCount,
          sales: stats.monthSalesTotalVnd,
          ticketPeriod: stats.ticketMonthProfitVnd,
        };
      default:
        return {
          bookings: stats.allTimeBookingsCount,
          sales: stats.allTimeSalesTotalVnd,
          ticketPeriod: stats.ticketAllTimeProfitVnd,
        };
    }
  }, [scope, stats]);

  const earnTours = tourEarningsVnd(slice.sales, stats.salesCommissionPercent);
  const totalWithTickets = earnTours + (withTickets ? slice.ticketPeriod : 0);
  const pct = stats.salesCommissionPercent;
  const ticketProfit = slice.ticketPeriod;

  if (!open) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} className={reportChipClass}>
            Отчёт
          </button>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      <div className="w-full min-w-0 rounded-xl bg-[var(--surface-soft)] px-3 py-3 ring-1 ring-[var(--border)] sm:px-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Отчёт</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[11px] text-[var(--muted2)] hover:underline underline-offset-2"
          >
            Скрыть
          </button>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
        {(
          [
            ["day", "День"],
            ["month", "Месяц"],
            ["all", "Всё время"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
              scope === key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
            }`}
          >
            {label}
          </button>
        ))}
        </div>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setWithTickets(!withTickets)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
              withTickets
                ? "bg-amber-500/90 text-white"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
            }`}
          >
            + билеты
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div className="w-full rounded-lg bg-[var(--surface-elevated)] px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Заработок (туры)</div>
            <div className="mt-1 break-words text-xl font-semibold tabular-nums leading-tight text-[var(--text)] sm:text-2xl">
              {slice.sales > 0 ? formatVnd(earnTours) : "-"}
            </div>
            <div className="mt-1.5 text-[10px] text-[var(--muted)]">{pct}% от суммы по прайсу</div>
          </div>

          <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg px-2 py-2 ring-1 ring-[var(--border)]">
            <span className="shrink-0 text-[var(--muted2)]">Броней</span>
            <span className="min-w-0 truncate text-right font-semibold tabular-nums text-[var(--text)]">
              {slice.bookings}
            </span>
          </div>

          {withTickets ? (
            <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[var(--border)] pt-3">
              <span className="shrink-0 text-[var(--muted2)]">{ticketLineLabel(scope)}</span>
              <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
                {ticketProfit > 0 ? formatVnd(ticketProfit) : "-"}
              </span>
            </div>
          ) : null}

          {withTickets ? (
            <div className="flex flex-col items-stretch gap-1 border-t border-[var(--border)] pt-3 sm:items-end sm:text-right">
              <span className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Итого с билетами</span>
              <span className="break-words text-lg font-semibold tabular-nums text-[var(--accent)] sm:text-xl">
                {totalWithTickets > 0 ? formatVnd(totalWithTickets) : "-"}
              </span>
              <span className="text-[10px] text-[var(--muted)]">туры + билеты за выбранный период</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
