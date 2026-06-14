"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { TourExpense } from "@/lib/types";
import { AccountingExpenseLine } from "@/components/accounting-expense-line";
import { formatVndInput, parseVndInput } from "@/lib/format";
import { receiptFileToJpegDataUrl } from "@/lib/receipt-image-compress";

function blockBadgeState(
  expenses: TourExpense[],
  reviewedAt: string | null,
): "noLines" | "reviewed" | "pending" | "notReviewed" {
  if (expenses.length === 0) return "noLines";
  if (reviewedAt) return "reviewed";
  const pending = expenses.some((e) => e.pendingAccountantReview && !e.accountantReviewedAt);
  return pending ? "pending" : "notReviewed";
}

export function AccountingDispatchExpensesCollapsible({
  tourId,
  driverExpenses,
  bookingExpenses,
  receiptHintContext,
  initialNote,
  initialReviewedAt,
}: {
  tourId: string;
  driverExpenses: TourExpense[];
  bookingExpenses: TourExpense[];
  receiptHintContext: { tourDateYmd: string; expectedPax: number };
  initialNote: string | null;
  initialReviewedAt: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("accountingDispatchExpenses");
  const tCommon = useTranslations("common");
  const tAccounting = useTranslations("accounting");
  const tAccountingRefund = useTranslations("accountingRefund");
  const tDispatcherWorkday = useTranslations("dispatcherWorkday");
  const combined = useMemo(() => [...driverExpenses, ...bookingExpenses], [driverExpenses, bookingExpenses]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  const [addKind, setAddKind] = useState<"bus" | "booking">("bus");
  const [addAmount, setAddAmount] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote]);

  const status = useMemo(() => blockBadgeState(combined, initialReviewedAt), [combined, initialReviewedAt]);

  const badgeClass =
    status === "pending"
      ? "bg-amber-100 text-amber-950 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800"
      : status === "reviewed"
        ? "bg-emerald-100 text-emerald-950 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800"
        : status === "notReviewed"
          ? "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)]"
          : "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)]";

  const statusLabel = {
    noLines: t("statusNoLines"),
    reviewed: t("statusReviewed"),
    pending: t("statusPending"),
    notReviewed: t("statusNotReviewed"),
  }[status];

  const saveNote = useCallback(async () => {
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/accounting-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountantDispatchExpensesNote: note.trim() === "" ? null : note.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === "string" ? j.error : t("couldNotSave"));
        return;
      }
      router.refresh();
    } finally {
      setNoteBusy(false);
    }
  }, [note, tourId, router, t]);

  const submitAccountantExpense = useCallback(async () => {
    const d = addDesc.trim();
    if (d.length < 2) {
      alert(t("enterDescriptionAlert"));
      return;
    }
    const digits = addAmount.replace(/\D/g, "");
    if (!digits) {
      alert(t("enterAmountAlert"));
      return;
    }
    const amountVnd = Math.max(1, Math.round(parseVndInput(addAmount)));
    setAddBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (addFile) {
        try {
          attachmentDataUrl = await receiptFileToJpegDataUrl(addFile);
        } catch {
          alert(t("photoProcessFailedAlert"));
          return;
        }
      }
      const res = await fetch(`/api/tours/${tourId}/accountant-dispatch-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: addKind,
          amountVnd,
          description: d,
          ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : tCommon("couldNotSave"));
        return;
      }
      setAddAmount("");
      setAddDesc("");
      setAddFile(null);
      router.refresh();
    } finally {
      setAddBusy(false);
    }
  }, [addAmount, addDesc, addFile, addKind, tourId, router, t, tCommon]);

  const markBlockReviewed = useCallback(async () => {
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/accounting-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountantDispatchExpensesReviewed: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === "string" ? j.error : t("couldNotSave"));
        return;
      }
      router.refresh();
    } finally {
      setReviewBusy(false);
    }
  }, [tourId, router, t]);

  return (
    <section className="card mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{t("title")}</h2>
          <p className="mt-0.5 text-[10px] text-[var(--muted2)]">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${badgeClass}`}>{statusLabel}</span>
          <span className="text-[var(--muted)]">{open ? "▼" : "▶"}</span>
        </div>
      </button>

      {open ? (
        <div className="mt-3 space-y-4 border-t border-[var(--border)]/80 pt-3">
          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">{t("driverBusSection")}</h3>
            {driverExpenses.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">{t("noLines")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {driverExpenses.map((e) => (
                  <AccountingExpenseLine key={e.id} expense={e} receiptHintContext={receiptHintContext} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">{t("bookingDispatchSection")}</h3>
            {bookingExpenses.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">{t("noLines")}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {bookingExpenses.map((e) => (
                  <AccountingExpenseLine key={e.id} expense={e} receiptHintContext={receiptHintContext} />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-soft)]/50 p-3">
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">{t("addExpenseTitle")}</h3>
            <p className="mb-2 text-[10px] text-[var(--muted2)]">{t("addExpenseHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px]">
                <span className="text-[var(--muted)]">{t("typeLabel")}</span>
                <select
                  value={addKind}
                  onChange={(e) => setAddKind(e.target.value === "booking" ? "booking" : "bus")}
                  className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]"
                >
                  <option value="bus">{t("typeDriverBus")}</option>
                  <option value="booking">{t("typeDispatchBooking")}</option>
                </select>
              </label>
              <label className="block text-[11px]">
                <span className="text-[var(--muted)]">{tAccounting("guideDepositAmountLabel")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={addAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.trim() === "") setAddAmount("");
                    else setAddAmount(formatVndInput(parseVndInput(v)));
                  }}
                  className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs tabular-nums text-[var(--text)]"
                  placeholder="0"
                />
              </label>
            </div>
            <label className="mt-2 block text-[11px]">
              <span className="text-[var(--muted)]">{tDispatcherWorkday("description")}</span>
              <textarea
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                rows={2}
                className="mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]"
                placeholder={t("descriptionPlaceholder")}
              />
            </label>
            <label className="mt-2 block text-[11px]">
              <span className="text-[var(--muted)]">{t("receiptPhotoLabel")}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-0.5 block w-full text-[10px] file:mr-2 file:rounded file:border-0 file:bg-[var(--surface-soft)] file:px-2 file:py-1"
                onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={addBusy}
              onClick={() => void submitAccountantExpense()}
              className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {addBusy ? "…" : tCommon("saveExpense")}
            </button>
          </div>

          {combined.length > 0 && !initialReviewedAt ? (
            <div>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => void markBlockReviewed()}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600"
              >
                {reviewBusy ? "…" : t("markBlockReviewedBtn")}
              </button>
              <p className="mt-1 text-[10px] text-[var(--muted2)]">{t("reviewedHint")}</p>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              {tAccountingRefund("accountantCommentLabel")}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]"
              placeholder={t("commentPlaceholder")}
            />
            <button
              type="button"
              disabled={noteBusy}
              onClick={() => void saveNote()}
              className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {noteBusy ? "…" : tCommon("saveComment")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
