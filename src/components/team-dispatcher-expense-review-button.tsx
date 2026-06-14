"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd } from "@/lib/format";
import { formatExpenseDescriptionForDisplay } from "@/lib/receipt-expense-description-ru";
import { formatIsoLocalWithWeekdayRu } from "@/lib/scheduling";
import { ExpenseAttachmentOpener } from "@/components/expense-attachment-opener";
import type { DispatcherExpenseReviewPayload, DispatcherExpenseReviewTourRow } from "@/lib/data";
import type { TourExpense } from "@/lib/types";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";

function reviewBadge(e: TourExpense): { label: string; cls: string } {
  if (e.accountantReviewState === "approved") {
    return { label: "Проверено", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" };
  }
  if (e.accountantReviewState === "recheck") {
    return { label: "На перепроверке", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" };
  }
  return { label: "Не проверено", cls: "bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)]" };
}

function tourBadgeSummary(t: DispatcherExpenseReviewTourRow): string {
  const parts: string[] = [];
  if (t.pendingCount > 0) parts.push(`не проверено ${t.pendingCount}`);
  if (t.recheckCount > 0) parts.push(`на перепроверке ${t.recheckCount}`);
  if (t.approvedCount > 0) parts.push(`проверено ${t.approvedCount}`);
  return parts.join(" · ");
}

export function TeamDispatcherExpenseReviewButton({
  dispatcherId,
  dispatcherName,
}: {
  dispatcherId: string;
  dispatcherName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DispatcherExpenseReviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState<DispatcherExpenseReviewTourRow | null>(null);
  const [reviewExpense, setReviewExpense] = useState<TourExpense | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCommentOpen, setReviewCommentOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dispatchers/${dispatcherId}/expense-review-tours`);
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || "Ошибка");
      setData(j as DispatcherExpenseReviewPayload);
      setSelectedTour(null);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/dispatchers/${dispatcherId}/expense-review-tours`);
      const j = await res.json();
      if (res.ok) {
        const payload = j as DispatcherExpenseReviewPayload;
        setData(payload);
        if (selectedTour) {
          setSelectedTour(payload.tours.find((t) => t.tourId === selectedTour.tourId) ?? null);
        }
      }
    } catch {
      // ignore — модалка просто покажет старые данные до следующего открытия
    }
    router.refresh();
  }

  async function runReviewAction(expenseId: string, action: "approve" | "recheck" | "reset", note?: string) {
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/accountant-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || "Не удалось сохранить");
      setReviewExpense(null);
      setReviewComment("");
      setReviewCommentOpen(false);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setReviewBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setSelectedTour(null);
    setReviewExpense(null);
    setReviewComment("");
    setReviewCommentOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="btn-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Загрузка…" : "Проверить расходы"}
      </button>

      {err ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      {open && data && !selectedTour ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">Расходы по турам</h2>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                Закрыть
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">{dispatcherName}</p>

            {data.tours.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Расходов по турам нет.</p>
            ) : (
              <ul className="space-y-2">
                {data.tours.map((t) => (
                  <li key={t.tourId}>
                    <button
                      type="button"
                      onClick={() => setSelectedTour(t)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-left hover:bg-[var(--surface-elevated)] transition-colors"
                    >
                      <div className="text-sm font-semibold text-[var(--text)]">{t.tourName}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(t.tourDate)}</div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium tabular-nums text-[var(--text)]">{formatVnd(t.totalAmountVnd)}</span>
                        <span
                          className={
                            "font-medium " +
                            (t.pendingCount > 0 || t.recheckCount > 0
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-emerald-700 dark:text-emerald-300")
                          }
                        >
                          {tourBadgeSummary(t)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {open && selectedTour ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedTour(null)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                ← Туры
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                Закрыть
              </button>
            </div>
            <h2 className="text-base font-semibold text-[var(--text)]">{selectedTour.tourName}</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(selectedTour.tourDate)} · {dispatcherName}</p>

            <ul className="space-y-2">
              {selectedTour.expenses.map((e) => {
                const badge = reviewBadge(e);
                return (
                  <li key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatVnd(e.amountVnd)}</div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">{formatExpenseDescriptionForDisplay(e.description)}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted2)]">{formatIsoLocalWithWeekdayRu(e.createdAt)}</div>
                      </div>
                      <span className={"shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold " + badge.cls}>
                        {badge.label}
                      </span>
                    </div>
                    {e.attachmentUrl ? (
                      <div className="mt-2">
                        <ExpenseAttachmentOpener url={e.attachmentUrl} variant="text" text="Открыть фото чека" />
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] disabled:opacity-50"
                        disabled={reviewBusy}
                        onClick={() => {
                          setReviewExpense(e);
                          setReviewComment(e.accountantReviewNote ?? "");
                          setReviewCommentOpen(Boolean(e.accountantReviewNote?.trim()));
                        }}
                      >
                        {e.accountantReviewState === "approved" ? "Изменить проверку" : "Проверить"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {reviewExpense ? (
        <div
          className="ui-scrim fixed inset-0 z-[210] flex items-end justify-center p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Проверка расхода"
          onClick={(e) => {
            if (e.target === e.currentTarget && !reviewBusy) setReviewExpense(null);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-[var(--surface)] p-4 shadow-xl ring-1 ring-[var(--border)]">
            <p className="text-base font-semibold text-[var(--text)]">Проверка расхода</p>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="text-[var(--muted)]">Сумма: </span>
                <span className="font-semibold text-[var(--text)]">{formatVnd(reviewExpense.amountVnd)}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Когда внесено: </span>
                <span className="text-[var(--text)]">{formatIsoLocalWithWeekdayRu(reviewExpense.createdAt)}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Основание: </span>
                <span className="text-[var(--text)]">{formatExpenseDescriptionForDisplay(reviewExpense.description)}</span>
              </div>
              {reviewExpense.attachmentUrl ? (
                <div className="pt-1">
                  <img
                    src={reviewExpense.attachmentUrl}
                    alt="Чек расхода"
                    className="max-h-56 rounded-lg border border-[var(--border)] object-contain"
                  />
                  <ExpenseAttachmentOpener url={reviewExpense.attachmentUrl} variant="text" text="Открыть фото чека" />
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">Фото чека не приложено.</p>
              )}
              {reviewCommentOpen ? (
                <label className="block pt-1 text-xs">
                  <span className="text-[var(--muted)]">Комментарий (необязательно)</span>
                  <textarea
                    className="field-surface mt-1 min-h-[84px] w-full rounded-xl px-3 py-2 text-sm"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    disabled={reviewBusy}
                    placeholder="Что подтверждено или что нужно исправить"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setReviewCommentOpen(true)}
                  disabled={reviewBusy}
                  className="pt-1 text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  + Добавить комментарий
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={reviewBusy}
                onClick={() => void runReviewAction(reviewExpense.id, "approve", reviewComment.trim() || undefined)}
              >
                Подтвердить проверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:text-amber-300"
                disabled={reviewBusy}
                onClick={() => void runReviewAction(reviewExpense.id, "recheck", reviewComment.trim() || "Нужна перепроверка")}
              >
                Отправить на перепроверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                disabled={reviewBusy}
                onClick={() => void runReviewAction(reviewExpense.id, "reset", reviewComment.trim() || undefined)}
              >
                Снять проверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--muted)] disabled:opacity-50"
                disabled={reviewBusy}
                onClick={() => setReviewExpense(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
