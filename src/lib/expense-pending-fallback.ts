/**
 * Только «колонки нет в схеме» - не CHECK/FK/UNIQUE (в тексте ошибки часто есть имя колонки).
 * Иначе ложное срабатывание и неверный retry INSERT/SELECT.
 */
export function isMissingExpensesDbColumn(error: { message?: string } | null, column: string): boolean {
  const msg = error?.message ?? "";
  if (!msg) return false;
  const esc = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(esc, "i").test(msg)) return false;
  if (/violates|violation|check constraint|foreign key|unique|duplicate key|23505|23503|23514/i.test(msg)) {
    return false;
  }
  return /does not exist|could not find|unknown column|schema cache|42703|PGRST204|column .* (does not exist|of relation)/i.test(
    msg,
  );
}

/** PostgREST/Supabase: колонка ещё не добавлена в проект (см. supabase/migrations). */
export function isMissingPendingAccountantReviewColumn(error: { message?: string } | null): boolean {
  return isMissingExpensesDbColumn(error, "pending_accountant_review");
}

/** PostgREST/Supabase: колонка ещё не добавлена в проект (см. supabase/migrations). */
export function isMissingAccountantReviewedAtColumn(error: { message?: string } | null): boolean {
  return isMissingExpensesDbColumn(error, "accountant_reviewed_at");
}

/** Если в БД нет pending_accountant_review - фиксируем смысл в описании. */
export function withDateMismatchFallbackDescription(description: string): string {
  const tag = " · в обработке (дата чека ≠ день тура)";
  const maxLen = 500;
  if (description.length + tag.length <= maxLen) return description + tag;
  return description.slice(0, Math.max(0, maxLen - tag.length)) + tag;
}
