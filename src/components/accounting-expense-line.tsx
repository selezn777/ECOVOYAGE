"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TourExpense } from "@/lib/types";
import { formatVnd } from "@/lib/format";
import { ExpenseAttachmentOpener } from "@/components/expense-attachment-opener";
import { expenseDisplayHeading } from "@/lib/receipt-ocr-parse";

function expenseReviewLabel(e: TourExpense): string {
  if (e.accountantReviewedAt) return "Принято бухгалтером";
  if (e.pendingAccountantReview) return "На проверку";
  return "-";
}

/** Одинаково на Node и в браузере - без hydration mismatch от toLocaleString. */
function formatExpenseCreatedAtRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(d);
  } catch {
    return "";
  }
}

export function AccountingExpenseLine({
  expense,
  receiptHintContext,
}: {
  expense: TourExpense;
  receiptHintContext?: { tourDateYmd: string; expectedPax: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const desc = expenseDisplayHeading(expense.description || "");
  const canAcceptByAccountant = !expense.accountantReviewedAt;

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}/accountant-review`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === "string" ? j.error : "Не удалось подтвердить");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)]/80 bg-[var(--surface-soft)] px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <span className="break-words text-[var(--text)]">{desc}</span>
        <p className="mt-1 text-[10px] leading-snug text-[var(--muted2)]">
          Перед принятием сверьте по чеку:{" "}
          <strong className="font-medium text-[var(--text)]">дата</strong>,{" "}
          <strong className="font-medium text-[var(--text)]">время</strong> и{" "}
          <strong className="font-medium text-[var(--text)]">число человек</strong>
          {receiptHintContext?.tourDateYmd ? (
            <>
              . День тура:{" "}
              <span className="tabular-nums text-[var(--text)]">{receiptHintContext.tourDateYmd}</span>, по броням
              туристов: <span className="tabular-nums text-[var(--text)]">{receiptHintContext.expectedPax}</span>.
            </>
          ) : (
            "."
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted2)]">
          <span
            className={
              expense.pendingAccountantReview && !expense.accountantReviewedAt
                ? "font-semibold text-amber-800 dark:text-amber-200"
                : ""
            }
          >
            {expenseReviewLabel(expense)}
          </span>
          <span className="tabular-nums" suppressHydrationWarning>
            {formatExpenseCreatedAtRu(expense.createdAt)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums text-[var(--text)]">{formatVnd(expense.amountVnd)}</span>
        {expense.attachmentUrl ? <ExpenseAttachmentOpener url={expense.attachmentUrl} variant="text" /> : null}
        {canAcceptByAccountant ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            title="Зафиксировать проверку расхода бухгалтером"
            className="rounded-lg border border-green-700/35 bg-green-50 px-2.5 py-1 text-[11px] font-semibold leading-tight text-green-900 shadow-[var(--shadow-sm)] hover:bg-green-100 disabled:opacity-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
          >
            {busy ? "…" : "Принять бухгалтером"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
