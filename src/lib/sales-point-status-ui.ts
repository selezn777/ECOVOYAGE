/**
 * Общий визуальный язык для статуса «где сегодня/в этот день сотрудник отдела продаж»:
 * на точке / промо / онлайн / выходной / не назначен (свободен).
 * Используется в /sales-points (карточки сотрудников, недельная сетка) и в
 * расписании менеджера на странице профиля.
 */

export type SalesDayStatusKind = "point" | "promo" | "online" | "off" | "none";

export interface SalesDayAssignment {
  mode: "point" | "promo" | "online";
  pointId: string | null;
  pointName: string | null;
  promoPlace?: string | null;
  onlineChannel?: string | null;
}

export function salesDayKind(assignment: SalesDayAssignment | undefined, isOff: boolean): SalesDayStatusKind {
  if (isOff) return "off";
  if (!assignment) return "none";
  return assignment.mode;
}

const BADGE_COLORS: Record<SalesDayStatusKind, string> = {
  point: "border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200",
  promo:
    "border-fuchsia-300/60 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-900/30 dark:text-fuchsia-200",
  online:
    "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200",
  off: "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200",
  none: "border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200",
};

/** Цветная плашка-статус (карточка сотрудника, расписание в профиле). */
export function salesStatusBadgeClass(kind: SalesDayStatusKind): string {
  return `inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${BADGE_COLORS[kind]}`;
}

const CELL_COLORS: Record<SalesDayStatusKind, string> = {
  point: "border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200",
  promo:
    "border-fuchsia-300/60 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-900/30 dark:text-fuchsia-200",
  online:
    "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200",
  off: "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200",
  // Свободный день — не ошибка, а возможность для назначения: нейтральный пунктир, а не красный.
  none: "border-dashed border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted2)]",
};

/** Компактная ячейка недельной сетки расписания. */
export function salesStatusCellClass(kind: SalesDayStatusKind): string {
  return `flex min-h-9 w-full items-center justify-center rounded-md border px-1 py-1 text-center text-[10px] font-medium leading-tight ${CELL_COLORS[kind]}`;
}
