"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { formatYmdWithWeekday, localDateString } from "@/lib/scheduling";
import type { RentalPointExpenseRow, Role } from "@/lib/types";

export function SalesPointExpenseRequestsPanel({
  pointId,
  viewerRole,
  expenses,
}: {
  pointId: string;
  viewerRole: Role;
  expenses: RentalPointExpenseRow[];
}) {
  const t = useTranslations("salesPointsPage");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [expenseDate, setExpenseDate] = useState(localDateString());
  const [note, setNote] = useState("");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const canCreate = viewerRole === "chief_manager" || viewerRole === "director" || viewerRole === "accountant";
  const canReview = viewerRole === "accountant" || viewerRole === "director";

  async function submitRequest() {
    const amountVnd = parseVndInput(amountText);
    if (!title.trim()) return setErrorText(t("expenses.missingPurpose"));
    if (amountVnd <= 0) return setErrorText(t("expenses.amountMustBePositive"));
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rental-points/${encodeURIComponent(pointId)}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amountVnd,
          expenseDate,
          note: note.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || t("expenses.errorStatus", { status: res.status }));
      setTitle("");
      setAmountText("");
      setNote("");
      router.refresh();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function patchRequest(expenseId: string, action: "approve" | "reject" | "mark_issued" | "mark_unissued") {
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rental-points/${encodeURIComponent(pointId)}/expenses/${encodeURIComponent(expenseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reasonById[expenseId]?.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || t("expenses.errorStatus", { status: res.status }));
      router.refresh();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-3 border-[var(--border)] bg-[var(--surface)]">
      <h2 className="text-base font-semibold">{t("expenses.title")}</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("expenses.hint")}</p>
      {errorText ? <p className="mt-2 text-xs text-red-600">{errorText}</p> : null}

      {canCreate ? (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 sm:grid-cols-2">
          <input
            className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm sm:col-span-2"
            placeholder={t("expenses.purposePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm tabular-nums"
            placeholder={t("expenses.amountPlaceholder")}
            value={amountText}
            onChange={(e) => setAmountText(formatVndInput(parseVndInput(e.target.value)))}
            inputMode="numeric"
          />
          <input
            type="date"
            className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
          <textarea
            className="field-surface min-h-[74px] rounded-xl px-3 py-2 text-sm sm:col-span-2"
            placeholder={t("expenses.commentPlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" onClick={() => void submitRequest()} disabled={busy} className="btn-primary min-h-[42px] sm:col-span-2">
            {t("expenses.send")}
          </button>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {expenses.length === 0 ? (
          <li className="text-xs text-[var(--muted)]">{t("expenses.empty")}</li>
        ) : (
          expenses.map((e) => {
            const status = e.approvalStatus ?? "pending";
            const issued = Boolean(e.issuedAt);
            return (
              <li key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">
                      {formatYmdWithWeekday(e.expenseDate, locale)} · {e.title}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {t("expenses.statusLabel")}{" "}
                      <span className="font-medium">
                        {status === "pending" ? t("expenses.status.pending") : status === "approved" ? t("expenses.status.approved") : t("expenses.status.rejected")}
                      </span>
                      {" · "}
                      {t("expenses.issuedLabel")} <span className="font-medium">{issued ? t("expenses.issuedYes") : t("expenses.issuedNo")}</span>
                    </div>
                    {e.approvalNote ? <div className="mt-1 text-xs text-[var(--muted)]">{t("expenses.note", { note: e.approvalNote })}</div> : null}
                  </div>
                  <div className="text-base font-semibold tabular-nums text-[var(--text)]">{formatVnd(e.amountVnd)}</div>
                </div>
                {e.note ? <p className="mt-1 text-xs text-[var(--muted)]">{e.note}</p> : null}
                {canReview ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="field-surface min-h-[64px] w-full rounded-xl px-3 py-2 text-xs"
                      placeholder={t("expenses.rejectPlaceholder")}
                      value={reasonById[e.id] ?? ""}
                      onChange={(ev) => setReasonById((s) => ({ ...s, [e.id]: ev.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !min-h-[34px] !px-3 text-xs" onClick={() => void patchRequest(e.id, "approve")} disabled={busy}>
                        {t("expenses.approve")}
                      </button>
                      <button type="button" className="btn-secondary !min-h-[34px] !px-3 text-xs" onClick={() => void patchRequest(e.id, "reject")} disabled={busy}>
                        {t("expenses.reject")}
                      </button>
                      <button type="button" className="btn-secondary !min-h-[34px] !px-3 text-xs" onClick={() => void patchRequest(e.id, "mark_issued")} disabled={busy || status !== "approved"}>
                        {t("expenses.markIssued")}
                      </button>
                      <button type="button" className="btn-secondary !min-h-[34px] !px-3 text-xs" onClick={() => void patchRequest(e.id, "mark_unissued")} disabled={busy}>
                        {t("expenses.markUnissued")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
