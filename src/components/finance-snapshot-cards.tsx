import { formatVnd } from "@/lib/format";
import type { FinanceSnapshot } from "@/lib/types";

export function FinanceSnapshotCards({
  snap,
  layout,
}: {
  snap: FinanceSnapshot;
  layout: "stack" | "grid";
}) {
  if (layout === "grid") {
    return (
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <section className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">Поступления</div>
          <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{formatVnd(snap.incomeVnd)}</div>
        </section>
        <section className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">Расходы</div>
          <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{formatVnd(snap.expenseVnd)}</div>
        </section>
        <section className="card">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">Чистыми</div>
          <div
            className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${snap.netVnd >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
          >
            {formatVnd(snap.netVnd)}
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <section className="card mb-2">
        <div className="text-sm text-[var(--muted)]">Поступления (платежи туристов)</div>
        <div className="text-2xl font-semibold">{formatVnd(snap.incomeVnd)}</div>
      </section>
      <section className="card mb-2">
        <div className="text-sm text-[var(--muted)]">Расходы</div>
        <div className="text-2xl font-semibold">{formatVnd(snap.expenseVnd)}</div>
      </section>
      <section className="card mb-3">
        <div className="text-sm text-[var(--muted)]">Чистыми</div>
        <div
          className={`text-2xl font-semibold ${snap.netVnd >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {formatVnd(snap.netVnd)}
        </div>
      </section>
    </>
  );
}
