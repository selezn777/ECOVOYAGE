import type { TourExpense } from "@/lib/types";
import { AccountingExpenseLine } from "@/components/accounting-expense-line";

export function TourAccountingExpenseSection({
  title,
  emptyText,
  expenses,
  receiptHintContext,
}: {
  title: string;
  emptyText: string;
  expenses: TourExpense[];
  receiptHintContext?: { tourDateYmd: string; expectedPax: number };
}) {
  return (
    <section className="card mb-3">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h2>
      {expenses.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {expenses.map((e) => (
            <AccountingExpenseLine key={e.id} expense={e} receiptHintContext={receiptHintContext} />
          ))}
        </ul>
      )}
    </section>
  );
}
