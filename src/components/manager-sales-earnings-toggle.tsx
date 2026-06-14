"use client";

import { useMemo, useState } from "react";
import type { ManagerDashboardSalesStats } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import type { Role } from "@/lib/types";

type Scope = "day" | "month" | "all";

function commissionVnd(salesVnd: number, percent: number): number {
  if (salesVnd <= 0 || percent <= 0) return 0;
  return Math.round((salesVnd * percent) / 100);
}

export function ManagerSalesEarningsToggle({
  stats,
  viewerRole,
}: {
  stats: ManagerDashboardSalesStats;
  viewerRole?: Role;
}) {
  const [scope, setScope] = useState<Scope>("month");
  const [withTickets, setWithTickets] = useState(false);
  const [withPayroll, setWithPayroll] = useState(true);
  const [withBonus, setWithBonus] = useState(true);

  const slice = useMemo(() => {
    switch (scope) {
      case "day":
        return {
          bookings: stats.dayBookingsCount,
          salesVnd: stats.daySalesTotalVnd,
          ticketVnd: stats.ticketDayProfitVnd,
          payrollAccrued: stats.dayPayrollNetAccruedVnd,
          payrollPaid: stats.dayPayrollNetPaidVnd,
          bonusAccrued: stats.dayBonusAccruedVnd,
          bonusPaid: stats.dayBonusPaidVnd,
          cashReceived: stats.dayManagerCashReceivedVnd,
          cashHanded: stats.dayManagerCashHandedVnd,
        };
      case "month":
        return {
          bookings: stats.monthBookingsCount,
          salesVnd: stats.monthSalesTotalVnd,
          ticketVnd: stats.ticketMonthProfitVnd,
          payrollAccrued: stats.monthPayrollNetAccruedVnd,
          payrollPaid: stats.monthPayrollNetPaidVnd,
          bonusAccrued: stats.monthBonusAccruedVnd,
          bonusPaid: stats.monthBonusPaidVnd,
          cashReceived: stats.monthManagerCashReceivedVnd,
          cashHanded: stats.monthManagerCashHandedVnd,
        };
      default:
        return {
          bookings: stats.allTimeBookingsCount,
          salesVnd: stats.allTimeSalesTotalVnd,
          ticketVnd: stats.ticketAllTimeProfitVnd,
          payrollAccrued: stats.allPayrollNetAccruedVnd,
          payrollPaid: stats.allPayrollNetPaidVnd,
          bonusAccrued: stats.allBonusAccruedVnd,
          bonusPaid: stats.allBonusPaidVnd,
          cashReceived: stats.allManagerCashReceivedVnd,
          cashHanded: stats.allManagerCashHandedVnd,
        };
    }
  }, [scope, stats]);

  const pct = stats.salesCommissionPercent;
  const toursEarn = commissionVnd(slice.salesVnd, pct);
  const extraAccrued = (withPayroll ? slice.payrollAccrued : 0) + (withBonus ? slice.bonusAccrued : 0);
  const extraPaid = (withPayroll ? slice.payrollPaid : 0) + (withBonus ? slice.bonusPaid : 0);
  const totalWithTickets = toursEarn + (withTickets ? slice.ticketVnd : 0) + extraAccrued;
  const totalPaidFoot = extraPaid;

  return (
    <div className="w-full min-w-0 rounded-xl bg-[var(--surface-soft)] px-3 py-3 ring-1 ring-[var(--border)] sm:px-4">
      <div className="mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Заработок</div>
      </div>

      <div className="mb-2 grid w-full grid-cols-3 gap-1.5">
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
            className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
              scope === key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid w-full grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setWithTickets(!withTickets)}
          className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withTickets
              ? "bg-emerald-600 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + билеты
        </button>
        <button
          type="button"
          onClick={() => setWithPayroll(!withPayroll)}
          className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withPayroll
              ? "bg-sky-600 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + оклад
        </button>
        <button
          type="button"
          onClick={() => setWithBonus(!withBonus)}
          className={`col-span-2 min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withBonus
              ? "bg-violet-600 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + премии
        </button>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg px-2 py-2 ring-1 ring-[var(--border)]">
          <span className="shrink-0 text-[var(--muted2)]">Броней</span>
          <span className="min-w-0 truncate text-right font-semibold tabular-nums text-[var(--text)]">{slice.bookings}</span>
        </div>

        {viewerRole !== "manager" ? (
          <div className="w-full rounded-lg bg-[var(--surface-elevated)] px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Сумма продаж (туры)</div>
            <div className="mt-1 break-words text-lg font-semibold tabular-nums leading-tight text-[var(--text)] sm:text-xl">
              {slice.salesVnd > 0 ? formatVnd(slice.salesVnd) : "-"}
            </div>
          </div>
        ) : null}

        <div className="w-full rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Заработок с туров</div>
          <div className="mt-1 break-words text-xl font-semibold tabular-nums leading-tight text-[var(--text)] sm:text-2xl">
            {toursEarn > 0 ? formatVnd(toursEarn) : slice.bookings > 0 ? formatVnd(0) : "-"}
          </div>
          <div className="mt-1.5 text-[10px] text-[var(--muted)]">От суммы продаж по вашим броням</div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-rose-50/90 px-3 py-3 ring-1 ring-rose-200/80 dark:bg-rose-950/35 dark:ring-rose-800/50">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-900/90 dark:text-rose-100">
            Касса офиса (ваши брони)
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
            <span className="text-[var(--muted2)]">Долг офису (всего)</span>
            <span className="font-semibold tabular-nums text-rose-950 dark:text-rose-50">
              {stats.managerCashOutstandingAllTimeVnd > 0 ? formatVnd(stats.managerCashOutstandingAllTimeVnd) : "0 ₫"}
            </span>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
            <span className="text-[var(--muted2)]">Принято за период</span>
            <span className="font-semibold tabular-nums text-[var(--text)]">
              {slice.cashReceived > 0 ? formatVnd(slice.cashReceived) : "0 ₫"}
            </span>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
            <span className="text-[var(--muted2)]">Сдано в офис</span>
            <span className="font-semibold tabular-nums text-[var(--text)]">
              {slice.cashHanded > 0 ? formatVnd(slice.cashHanded) : "0 ₫"}
            </span>
          </div>
        </div>

        {withPayroll ? (
          <div className="flex min-w-0 flex-col gap-1 border-t border-[var(--border)] pt-3">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-[var(--muted2)]">Оклад (ведомость)</span>
              <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
                {slice.payrollAccrued > 0 ? formatVnd(slice.payrollAccrued) : "-"}
              </span>
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              {slice.payrollPaid > 0 ? `Выплачено ${formatVnd(slice.payrollPaid)}` : "Выплат по ведомости в этот период нет"}
            </div>
          </div>
        ) : null}

        {withBonus ? (
          <div className="flex min-w-0 flex-col gap-1 border-t border-[var(--border)] pt-3">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-[var(--muted2)]">Премии</span>
              <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
                {slice.bonusAccrued > 0 ? formatVnd(slice.bonusAccrued) : "-"}
              </span>
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              {slice.bonusPaid > 0 ? `Выплачено ${formatVnd(slice.bonusPaid)}` : "Выплат премий в этот период нет"}
            </div>
          </div>
        ) : null}

        {withTickets ? (
          <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-[var(--muted2)]">Билеты</span>
              <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
                {slice.ticketVnd > 0 ? formatVnd(slice.ticketVnd) : "-"}
              </span>
            </div>
            <div className="flex flex-col items-stretch gap-1 sm:items-end sm:text-right">
              <span className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Итого (туры + билеты + оклад + премии)</span>
              <span className="break-words text-lg font-semibold tabular-nums text-[var(--accent)] sm:text-xl">
                {totalWithTickets > 0 ? formatVnd(totalWithTickets) : "-"}
              </span>
              {totalPaidFoot > 0 ? (
                <span className="text-[10px] text-[var(--muted)]">Выплачено по окладу и премиям {formatVnd(totalPaidFoot)}</span>
              ) : null}
            </div>
          </div>
        ) : withPayroll || withBonus ? (
          <div className="flex flex-col items-stretch gap-1 border-t border-[var(--border)] pt-3 sm:items-end sm:text-right">
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Итого с окладом и премиями</span>
            <span className="break-words text-lg font-semibold tabular-nums text-[var(--accent)] sm:text-xl">
              {totalWithTickets > 0 ? formatVnd(totalWithTickets) : "-"}
            </span>
            {totalPaidFoot > 0 ? (
              <span className="text-[10px] text-[var(--muted)]">Выплачено по окладу и премиям {formatVnd(totalPaidFoot)}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
