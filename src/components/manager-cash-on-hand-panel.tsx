import Link from "next/link";
import { formatVnd } from "@/lib/format";
import type { ManagerCashOnHandSnapshot, ManagerCashPeriodPreset } from "@/lib/types";

const PRESETS: { value: ManagerCashPeriodPreset; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Всё время" },
];

export function ManagerCashOnHandPanel({
  employeeId,
  snapshot,
}: {
  employeeId: string;
  snapshot: ManagerCashOnHandSnapshot;
}) {
  return (
    <section className="card mb-3">
      <h2 className="mb-1 text-base font-semibold">Наличные по броням и сдача в кассу</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
        Сумма платежей по броням этого менеджера (предоплата и доплаты минус возвраты) и сдачи в центральную кассу по
        туру. «К сдаче сейчас» считается за всё время: всего принято по броням минус всего сдано через форму сдачи.
      </p>
      <div
        className="mb-3 flex min-w-0 flex-nowrap overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-soft)] shadow-[var(--shadow-sm)]"
        role="tablist"
        aria-label="Период для цифр по броням и сдаче"
      >
        {PRESETS.map((p, i) => (
          <Link
            key={p.value}
            href={`/team/${employeeId}?cash_period=${p.value}`}
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
      <p className="mb-4 text-[11px] text-[var(--muted2)]">{snapshot.periodLabelRu}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Принято за период</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">{formatVnd(snapshot.receivedInPeriodVnd)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 shadow-[var(--shadow-sm)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Сдано в кассу за период</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatVnd(snapshot.handedToOfficeInPeriodVnd)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-amber-900/50 dark:bg-amber-950/35">
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
            К сдаче сейчас
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-100">
            {formatVnd(snapshot.outstandingAllTimeVnd)}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-amber-900/75 dark:text-amber-200/80">Оценка за всё время</p>
        </div>
      </div>
    </section>
  );
}
