import { getTranslations } from "next-intl/server";
import { formatVnd } from "@/lib/format";
import type { SalesPointRatingRow } from "@/lib/data";

type ModeTotals = {
  bookings: number;
  paymentsNetVnd: number;
};

function emptyTotals(): ModeTotals {
  return { bookings: 0, paymentsNetVnd: 0 };
}

function addTotals(a: ModeTotals, b: ModeTotals): ModeTotals {
  return {
    bookings: a.bookings + b.bookings,
    paymentsNetVnd: a.paymentsNetVnd + b.paymentsNetVnd,
  };
}

export async function SalesPointsProfitSummary({ rows }: { rows: SalesPointRatingRow[] }) {
  const t = await getTranslations("salesPointsPage");
  const modes = {
    point: emptyTotals(),
    online: emptyTotals(),
    promo: emptyTotals(),
  };

  for (const row of rows) {
    for (const manager of row.managers) {
      modes.point = addTotals(modes.point, manager.modeStats.point);
      modes.online = addTotals(modes.online, manager.modeStats.online);
      modes.promo = addTotals(modes.promo, manager.modeStats.promo);
    }
  }

  const branchCostsVnd = rows
    .filter((r) => r.pointId)
    .reduce((sum, r) => sum + Math.max(0, r.monthlyRentVnd) + Math.max(0, r.pointExpensesVndInPeriod), 0);
  const revenueVnd = modes.point.paymentsNetVnd + modes.online.paymentsNetVnd + modes.promo.paymentsNetVnd;
  const profitVnd = revenueVnd - branchCostsVnd;
  const bookings = modes.point.bookings + modes.online.bookings + modes.promo.bookings;

  const cards = [
    { key: "profit", label: t("summary.profit"), value: formatVnd(profitVnd), strong: true },
    { key: "revenue", label: t("summary.revenue"), value: formatVnd(revenueVnd) },
    { key: "costs", label: t("summary.costs"), value: formatVnd(branchCostsVnd) },
    { key: "bookings", label: t("summary.bookings"), value: String(bookings) },
  ];
  const modeCards = [
    { key: "point", label: t("modes.point"), totals: modes.point },
    { key: "online", label: t("modes.online"), totals: modes.online },
    { key: "promo", label: t("modes.promo"), totals: modes.promo },
  ];

  return (
    <section className="card mb-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("summary.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("summary.hint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{card.label}</div>
            <div
              className={`mt-1 break-words text-base font-semibold tabular-nums ${
                card.key === "profit"
                  ? profitVnd >= 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-700 dark:text-red-300"
                  : "text-[var(--text)]"
              }`}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {modeCards.map((card) => (
          <div key={card.key} className="rounded-lg border border-[var(--border)] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--text)]">{card.label}</span>
              <span className="text-xs tabular-nums text-[var(--muted)]">{t("summary.modeBookings", { n: card.totals.bookings })}</span>
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">{formatVnd(card.totals.paymentsNetVnd)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
