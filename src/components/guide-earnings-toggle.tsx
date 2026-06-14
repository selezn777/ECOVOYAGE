"use client";

import { useMemo, useState } from "react";
import type { GuideDashboardEarningsStats } from "@/lib/data";
import { formatVnd } from "@/lib/format";

type Scope = "day" | "month" | "all";

export function GuideEarningsToggle({ stats }: { stats: GuideDashboardEarningsStats }) {
  const [scope, setScope] = useState<Scope>("month");
  const [withShop, setWithShop] = useState(false);
  const [withExtra, setWithExtra] = useState(false);
  const [withPayroll, setWithPayroll] = useState(true);
  const [withBonus, setWithBonus] = useState(true);

  const slice = useMemo(() => {
    switch (scope) {
      case "day":
        return {
          trips: stats.dayTripsCount,
          salaryAccrued: stats.daySalaryAccruedVnd,
          salaryPaid: stats.daySalaryPaidVnd,
          shopAccrued: stats.dayShopAccruedVnd,
          shopPaid: stats.dayShopPaidVnd,
          extraAccrued: stats.dayExtraAccruedVnd,
          extraPaid: stats.dayExtraPaidVnd,
          payrollAccrued: stats.dayPayrollNetAccruedVnd,
          payrollPaid: stats.dayPayrollNetPaidVnd,
          bonusAccrued: stats.dayBonusAccruedVnd,
          bonusPaid: stats.dayBonusPaidVnd,
        };
      case "month":
        return {
          trips: stats.monthTripsCount,
          salaryAccrued: stats.monthSalaryAccruedVnd,
          salaryPaid: stats.monthSalaryPaidVnd,
          shopAccrued: stats.monthShopAccruedVnd,
          shopPaid: stats.monthShopPaidVnd,
          extraAccrued: stats.monthExtraAccruedVnd,
          extraPaid: stats.monthExtraPaidVnd,
          payrollAccrued: stats.monthPayrollNetAccruedVnd,
          payrollPaid: stats.monthPayrollNetPaidVnd,
          bonusAccrued: stats.monthBonusAccruedVnd,
          bonusPaid: stats.monthBonusPaidVnd,
        };
      default:
        return {
          trips: stats.allTripsCount,
          salaryAccrued: stats.allSalaryAccruedVnd,
          salaryPaid: stats.allSalaryPaidVnd,
          shopAccrued: stats.allShopAccruedVnd,
          shopPaid: stats.allShopPaidVnd,
          extraAccrued: stats.allExtraAccruedVnd,
          extraPaid: stats.allExtraPaidVnd,
          payrollAccrued: stats.allPayrollNetAccruedVnd,
          payrollPaid: stats.allPayrollNetPaidVnd,
          bonusAccrued: stats.allBonusAccruedVnd,
          bonusPaid: stats.allBonusPaidVnd,
        };
    }
  }, [scope, stats]);

  const totalAccrued =
    slice.salaryAccrued +
    (withShop ? slice.shopAccrued : 0) +
    (withExtra ? slice.extraAccrued : 0) +
    (withPayroll ? slice.payrollAccrued : 0) +
    (withBonus ? slice.bonusAccrued : 0);
  const totalPaid =
    slice.salaryPaid +
    (withShop ? slice.shopPaid : 0) +
    (withExtra ? slice.extraPaid : 0) +
    (withPayroll ? slice.payrollPaid : 0) +
    (withBonus ? slice.bonusPaid : 0);

  return (
    <div className="w-full min-w-0 rounded-xl bg-[var(--surface-soft)] px-3 py-3 ring-1 ring-[var(--border)] sm:px-4">
      <div className="mb-3 flex items-center justify-between gap-2">
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
          onClick={() => setWithShop(!withShop)}
          className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withShop
              ? "bg-emerald-600 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + маг
        </button>
        <button
          type="button"
          onClick={() => setWithExtra(!withExtra)}
          className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withExtra
              ? "bg-amber-500/90 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + доп
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
          className={`min-h-[40px] w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium sm:min-h-0 sm:px-2.5 sm:py-1 ${
            withBonus
              ? "bg-violet-600 text-white"
              : "bg-[var(--surface-elevated)] text-[var(--muted)] ring-1 ring-[var(--border)]"
          }`}
        >
          + премии
        </button>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="w-full rounded-lg bg-[var(--surface-elevated)] px-3 py-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Заработок (туры)</div>
          <div className="mt-1 break-words text-xl font-semibold tabular-nums leading-tight text-[var(--text)] sm:text-2xl">
            {slice.salaryAccrued > 0 ? formatVnd(slice.salaryAccrued) : "-"}
          </div>
          <div className="mt-1.5 text-[10px] text-[var(--muted)]">Базовая зарплата за туры</div>
        </div>

        <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg px-2 py-2 ring-1 ring-[var(--border)]">
          <span className="shrink-0 text-[var(--muted2)]">Выездов</span>
          <span className="min-w-0 truncate text-right font-semibold tabular-nums text-[var(--text)]">{slice.trips}</span>
        </div>

        <div className="text-[11px] text-[var(--muted2)]">
          {slice.salaryPaid > 0 ? `Выплачено ${formatVnd(slice.salaryPaid)}` : "Выплат пока нет"}
        </div>

        {withShop ? (
          <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[var(--border)] pt-3">
            <span className="shrink-0 text-[var(--muted2)]">Офиц. магазин</span>
            <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
              {slice.shopAccrued > 0 ? formatVnd(slice.shopAccrued) : "-"}
            </span>
          </div>
        ) : null}

        {withExtra ? (
          <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[var(--border)] pt-3">
            <span className="shrink-0 text-[var(--muted2)]">Доп. (вне магазина)</span>
            <span className="min-w-0 break-words text-right font-semibold tabular-nums text-[var(--text)]">
              {slice.extraAccrued > 0 ? formatVnd(slice.extraAccrued) : "-"}
            </span>
          </div>
        ) : null}

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

        {withShop || withExtra || withPayroll || withBonus ? (
          <div className="flex flex-col items-stretch gap-1 border-t border-[var(--border)] pt-3 sm:items-end sm:text-right">
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">Итого</span>
            <span className="break-words text-lg font-semibold tabular-nums text-[var(--accent)] sm:text-xl">
              {totalAccrued > 0 ? formatVnd(totalAccrued) : "-"}
            </span>
            <span className="text-[10px] text-[var(--muted)]">
              {totalPaid > 0 ? `Выплачено всего ${formatVnd(totalPaid)}` : "Выплат пока нет"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
