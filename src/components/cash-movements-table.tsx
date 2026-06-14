"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CashManualLedgerPartitionInline } from "@/components/cash-manual-ledger-partition-inline";
import { CASH_MOVEMENTS_PAGE_SIZE } from "@/lib/cash-movements-constants";
import { formatVnd } from "@/lib/format";
import { showConfirm } from "@/lib/ui-dialog";
import type { CashLedgerRow } from "@/lib/types";

const KIND_KEY: Record<CashLedgerRow["kind"], string> = {
  tour_income: "kindTourIncome",
  refund: "kindRefund",
  advance_issue: "kindAdvanceIssue",
  advance_return: "kindAdvanceReturn",
  payout: "kindPayout",
  manual_in: "kindManualIn",
  manual_out: "kindManualOut",
  office_cash_handover: "kindOfficeCashHandover",
};

function attachmentLooksLikeImage(url: string): boolean {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  return /\.(jpe?g|png|gif|webp)$/i.test(u);
}

function RowField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">{label}</div>
      <div className="mt-0.5 break-words text-sm">{children}</div>
    </div>
  );
}

export function CashMovementsTable({
  initialRows,
  totalRowCount,
  pageSize = CASH_MOVEMENTS_PAGE_SIZE,
  showManualLedgerPartition = false,
}: {
  initialRows: CashLedgerRow[];
  totalRowCount: number;
  pageSize?: number;
  showManualLedgerPartition?: boolean;
}) {
  const [rows, setRows] = useState<CashLedgerRow[]>(initialRows);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [q, setQ] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const t = useTranslations("cash");
  const tCommon = useTranslations("common");

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const hasMore = rows.length < totalRowCount;

  const loadMore = useCallback(async () => {
    if (loadMoreBusy || !hasMore) return;
    setLoadMoreBusy(true);
    try {
      const res = await fetch(
        `/api/cash/movements?offset=${rows.length}&limit=${encodeURIComponent(String(pageSize))}`,
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: CashLedgerRow[];
      };
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : t("errorStatus", { status: res.status }));
        return;
      }
      const next = j.rows;
      if (!Array.isArray(next) || next.length === 0) return;
      setRows((prev) => [...prev, ...next]);
    } catch {
      alert(tCommon("noConnection"));
    } finally {
      setLoadMoreBusy(false);
    }
  }, [hasMore, loadMoreBusy, pageSize, rows.length, t, tCommon]);

  useEffect(() => {
    if (!previewUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewUrl]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((r) => r.searchText.includes(needle));
  }, [rows, needle]);

  return (
    <div>
      <div className="mb-3 max-w-xl">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={tCommon("search")}
          className="field-surface w-full rounded-xl px-3 py-2 text-sm"
        />
      </div>
      {totalRowCount > rows.length ? (
        <p className="mb-3 text-[11px] leading-relaxed text-[var(--muted2)]">
          {t("shownOfTotal", { shown: rows.length, total: totalRowCount })}
          {needle ? t("searchHintLoaded") : t("loadMoreHint")}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{needle ? t("nothingFound") : t("noOperations")}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const tourHref = r.linkedTourId ? `/tours/${r.linkedTourId}` : null;
            const isManual = r.kind === "manual_in" || r.kind === "manual_out";
            return (
            <li
              key={r.id}
              className={`relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] ring-1 ring-black/[0.03] transition-shadow dark:ring-white/[0.05] ${
                tourHref ? "hover:ring-2 hover:ring-[var(--accent)]/35" : ""
              }`}
            >
              {tourHref ? (
                <Link
                  href={tourHref}
                  className="absolute inset-0 z-0 rounded-xl"
                  aria-label={t("openTourCard")}
                  prefetch
                />
              ) : null}
              <div className="relative z-10 flex flex-col pointer-events-none">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)]/80 pb-2">
                <div className="min-w-0 text-[13px] font-semibold text-[var(--text)]">{t(KIND_KEY[r.kind])}</div>
                <div
                  className={`shrink-0 text-right text-[15px] font-bold tabular-nums ${
                    r.direction === "in" ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {r.direction === "in" ? "+" : "−"}
                  {formatVnd(r.amountVnd)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RowField label={t("dateTime")}>
                  <span className="tabular-nums text-[var(--muted)]">
                    {new Date(r.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </RowField>
                <RowField label={t("recordedBy")}>
                  {r.recordedByName ? (
                    <span className="font-medium text-[var(--text)]">{r.recordedByName}</span>
                  ) : (
                    <span className="text-[var(--muted2)]">-</span>
                  )}
                </RowField>
              </div>
              <div className="mt-3 min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                  {t("whatHappened")}
                </div>
                <div className="mt-1 text-[13px] leading-relaxed text-[var(--text)]">{r.summary}</div>
                {r.attachmentUrl ? (
                  attachmentLooksLikeImage(r.attachmentUrl) ? (
                    <button
                      type="button"
                      className="pointer-events-auto mt-2 text-left text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                      onClick={() => setPreviewUrl(r.attachmentUrl!)}
                    >
                      {t("viewPhotoReceipt")}
                    </button>
                  ) : (
                    <a
                      href={r.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto mt-2 inline-block text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      {t("openAttachment")}
                    </a>
                  )
                ) : null}
                {showManualLedgerPartition && (r.kind === "manual_in" || r.kind === "manual_out") ? (
                  <div className="pointer-events-auto">
                    <CashManualLedgerPartitionInline row={r} />
                  </div>
                ) : null}
                {isManual && (r.manualCanEdit || r.manualCanDelete) ? (
                  <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2">
                    {r.manualCanEdit ? (
                      <button
                        type="button"
                        className="btn-secondary !min-h-[34px] !px-3 text-xs"
                        onClick={async () => {
                          const currentTitle = String(r.summary || "").trim();
                          const title = window.prompt(t("operationName"), currentTitle) ?? "";
                          if (!title.trim()) return;
                          const amountStr = window.prompt(t("amountInDongPrompt"), String(r.amountVnd)) ?? "";
                          const amountVnd = Number(String(amountStr).replace(/\D/g, ""));
                          if (!Number.isFinite(amountVnd) || amountVnd <= 0) {
                            alert(t("enterValidAmount"));
                            return;
                          }
                          const note = window.prompt(t("commentCanBeEmpty"), r.note ?? "") ?? "";
                          const res = await fetch(`/api/cash/manual-ledger/${encodeURIComponent(r.sourceId)}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              title: title.trim(),
                              amountVnd,
                              note: note.trim() || null,
                            }),
                          });
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          if (!res.ok) {
                            alert(j.error || t("failedToEditRecord"));
                            return;
                          }
                          window.location.reload();
                        }}
                      >
                        {tCommon("edit")}
                      </button>
                    ) : null}
                    {r.manualCanDelete ? (
                      <button
                        type="button"
                        className="btn-secondary !min-h-[34px] !px-3 text-xs text-rose-700 dark:text-rose-300"
                        onClick={async () => {
                          const ok = await showConfirm(t("confirmDeleteOperation"));
                          if (!ok) return;
                          const res = await fetch(`/api/cash/manual-ledger/${encodeURIComponent(r.sourceId)}`, {
                            method: "DELETE",
                          });
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          if (!res.ok) {
                            alert(j.error || t("failedToDeleteRecord"));
                            return;
                          }
                          setRows((prev) => prev.filter((x) => x.id !== r.id));
                        }}
                      >
                        {tCommon("delete")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
      {hasMore ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={loadMoreBusy}
            onClick={() => void loadMore()}
          >
            {loadMoreBusy ? tCommon("loading") : t("loadMore")}
          </button>
          <span className="text-xs text-[var(--muted2)]">
            {t("notLoadedInJournal", { n: totalRowCount - rows.length })}
          </span>
        </div>
      ) : null}
      {needle && filtered.length < rows.length ? (
        <p className="mt-2 text-xs text-[var(--muted2)]">
          {t("shownOfLoaded", { shown: filtered.length, total: rows.length })}
        </p>
      ) : null}

      {previewUrl ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/88 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("viewAttachment")}
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative mb-3 flex w-full max-w-4xl justify-end">
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-900 shadow-lg hover:bg-stone-100"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewUrl(null);
              }}
            >
              {tCommon("close")}
            </button>
          </div>
          <div className="max-h-[calc(100vh-8rem)] w-full max-w-4xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={t("receiptOrConfirmation")} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl" />
          </div>
          <p className="mt-3 text-center text-xs text-white/80">{t("closeHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
