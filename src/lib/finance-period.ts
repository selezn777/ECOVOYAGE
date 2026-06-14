import type { FinancePeriod } from "@/lib/types";

export function parseFinancePeriodFromSearchParam(v: string | undefined): FinancePeriod {
  if (v === "all") return { kind: "all" };
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    if (m >= 1 && m <= 12) return { kind: "month", year: y, month: m };
  }
  const d = new Date();
  return { kind: "month", year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Подпись периода и соседние месяцы для навигации на /finance и /accounting. */
export function getFinancePeriodNavMeta(period: FinancePeriod): {
  periodLabel: string;
  prev: { year: number; month: number };
  next: { year: number; month: number };
} {
  const periodLabel =
    period.kind === "all"
      ? "Всё время"
      : new Date(period.year, period.month - 1, 1).toLocaleDateString("ru-RU", {
          month: "long",
          year: "numeric",
        });
  const prev =
    period.kind === "month"
      ? shiftMonth(period.year, period.month, -1)
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  const next =
    period.kind === "month"
      ? shiftMonth(period.year, period.month, 1)
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  return { periodLabel, prev, next };
}

export function monthRangeUtcIso(year: number, month1: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month1 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}
