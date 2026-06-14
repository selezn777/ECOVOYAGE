"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { TourGuideSettlementBreakdown } from "@/lib/tour-guide-settlement";
import { guideOwesOfficeVnd, officeOwesGuideVnd } from "@/lib/tour-guide-settlement";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";

function formatRuDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function uploadProof(
  tourId: string,
  file: File,
  fallbackErrorMsg: string,
  noFileLinkMsg: string,
): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", "guide_settlement_proof");
  fd.set("tourId", tourId);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : fallbackErrorMsg);
  if (typeof j.url !== "string") throw new Error(noFileLinkMsg);
  return j.url;
}

export function TourGuideSettlementPanel({
  tourId,
  breakdown,
  guidePaidOfficeAt,
  guidePaidOfficeProofUrl,
  officePaidGuideAt,
  officePaidGuideProofUrl,
  noTopMargin,
}: {
  tourId: string;
  breakdown: TourGuideSettlementBreakdown;
  guidePaidOfficeAt: string | null;
  guidePaidOfficeProofUrl: string | null;
  officePaidGuideAt: string | null;
  officePaidGuideProofUrl: string | null;
  /** Внутри `card` без отступа сверху */
  noTopMargin?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("guideSettlement");
  const tCashHandover = useTranslations("cashHandover");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"g2o" | "o2g" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [proofG2O, setProofG2O] = useState<string | null>(null);
  const [proofO2G, setProofO2G] = useState<string | null>(null);
  const [uploadingG2O, setUploadingG2O] = useState(false);
  const [uploadingO2G, setUploadingO2G] = useState(false);
  const [officePayAmountStr, setOfficePayAmountStr] = useState("");
  const [officePaymentKind, setOfficePaymentKind] = useState<"cash" | "bank_transfer">("cash");
  const [closeOfficeSettlement, setCloseOfficeSettlement] = useState(true);

  const gOwes = guideOwesOfficeVnd(breakdown);
  const oOwes = officeOwesGuideVnd(breakdown);
  const cashNet = breakdown.cashNetVnd;
  const oOwesRounded = Math.round(oOwes);

  const refresh = useCallback(() => router.refresh(), [router]);

  const syncOfficeAmountDefault = useCallback(() => {
    if (oOwes > 0) {
      setOfficePayAmountStr(formatVndInput(oOwesRounded));
    }
  }, [oOwes, oOwesRounded]);

  async function saveGuidePaidOffice() {
    setErr(null);
    setBusy("g2o");
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-settlement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_guide_paid_office",
          confirm: true,
          proofUrl: proofG2O,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : tCashHandover("failedToSave"));
        return;
      }
      setOpen(false);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveOfficePaidGuide() {
    setErr(null);
    const payAmt = parseVndInput(officePayAmountStr);
    if (payAmt < 1) {
      setErr(t("enterPayoutAmountAlert"));
      return;
    }
    if (payAmt > oOwesRounded) {
      setErr(t("amountExceedsOfficeDebtAlert"));
      return;
    }
    setBusy("o2g");
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-settlement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_office_paid_guide",
          confirm: true,
          amountVnd: payAmt,
          paymentKind: officePaymentKind,
          proofUrl: proofO2G,
          closeSettlement: closeOfficeSettlement,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : tCashHandover("failedToSave"));
        return;
      }
      setOpen(false);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const statusLine =
    guidePaidOfficeAt != null ? (
      <p className="text-xs text-emerald-800 dark:text-emerald-200">
        {t("confirmedTopupsAccepted", { date: formatRuDateTime(guidePaidOfficeAt) })}
        {guidePaidOfficeProofUrl ? (
          <>
            {" "}
            ·{" "}
            <a href={guidePaidOfficeProofUrl} target="_blank" rel="noreferrer" className="underline">
              {t("receiptOrTransfer")}
            </a>
          </>
        ) : null}
      </p>
    ) : officePaidGuideAt != null ? (
      <p className="text-xs text-emerald-800 dark:text-emerald-200">
        {t("confirmedPaymentIssued", { date: formatRuDateTime(officePaidGuideAt) })}
        {officePaidGuideProofUrl ? (
          <>
            {" "}
            ·{" "}
            <a href={officePaidGuideProofUrl} target="_blank" rel="noreferrer" className="underline">
              {t("receiptOrTransfer")}
            </a>
          </>
        ) : null}
      </p>
    ) : null;

  return (
    <>
      <div
        className={`${noTopMargin ? "" : "mt-3 "}flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20`}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-300/70">
            {t("balanceWithGuide")}
          </p>
          {gOwes > 0 ? (
            <p className="mt-0.5 text-[15px] font-bold tabular-nums text-amber-900 dark:text-amber-100">
              {t("guideToOffice", { amount: formatVnd(gOwes) })}
            </p>
          ) : oOwes > 0 ? (
            <p className="mt-0.5 text-[15px] font-bold tabular-nums text-sky-800 dark:text-sky-200">
              {t("officeToGuide", { amount: formatVnd(oOwes) })}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">{t("evenBalance")}</p>
          )}
          {breakdown.salaryVnd > 0 ? (
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
              {t("salaryIncluded", { amount: formatVnd(breakdown.salaryVnd) })}
            </p>
          ) : null}
          {statusLine ? <div className="mt-1">{statusLine}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            syncOfficeAmountDefault();
            setOpen(true);
          }}
          className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-[12px] font-semibold text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          {t("confirmBtn")}
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-settlement-title"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--surface)] p-4 shadow-xl ring-1 ring-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 id="guide-settlement-title" className="text-sm font-semibold text-[var(--text)]">
                {t("finalSettlementTitle")}
              </h3>
              <button
                type="button"
                disabled={!!busy}
                className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                onClick={() => setOpen(false)}
                aria-label={tCommon("close")}
              >
                ✕
              </button>
            </div>

            <ul className="mb-4 space-y-1.5 border-b border-[var(--border)] pb-3 text-xs text-[var(--text)]">
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("pendingTopupsLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.pendingTopupsVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("touristDebtAfterDepartureLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.touristDebtVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("depositIssuedLabel")}</span>
                <span className="font-medium tabular-nums">{breakdown.depositVnd > 0 ? formatVnd(breakdown.depositVnd) : "-"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("guideExpensesLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.guideExpensesTotalVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("depositReturnLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.returnUnusedDepositVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("pocketExpenseLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.pocketExpenseVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("shopOfficeShareLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.shopOfficeShareVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("shopGuideDueLabel")}</span>
                <span className="font-medium tabular-nums">{formatVnd(breakdown.shopGuideDueFromOfficeVnd)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">{t("guideTourSalaryLabel")}</span>
                <span className="font-medium tabular-nums">{breakdown.salaryVnd > 0 ? formatVnd(breakdown.salaryVnd) : "-"}</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-[var(--border)]/80 pt-1.5 font-medium">
                <span className="text-[var(--muted)]">{t("cashTotalBeforeSalary")}</span>
                <span className="tabular-nums text-[var(--text)]">
                  {cashNet > 0
                    ? t("guideToOffice", { amount: formatVnd(cashNet) })
                    : cashNet < 0
                      ? t("officeToGuide", { amount: formatVnd(-cashNet) })
                      : "0 ₫"}
                </span>
              </li>
              <li className="flex justify-between gap-2 pt-1 font-semibold">
                <span>{t("afterSalary")}</span>
                <span className="tabular-nums text-amber-900 dark:text-amber-200">
                  {gOwes > 0
                    ? t("guideToOffice", { amount: formatVnd(gOwes) })
                    : oOwes > 0
                      ? t("officeToGuide", { amount: formatVnd(oOwes) })
                      : "0 ₫"}
                </span>
              </li>
            </ul>

            {err ? <p className="mb-3 text-xs text-red-600 dark:text-red-400">{err}</p> : null}

            {guidePaidOfficeAt || officePaidGuideAt ? (
              <p className="mb-3 text-xs text-[var(--muted)]">
                {t("alreadyConfirmedHint")}
              </p>
            ) : gOwes > 0 ? (
              <div className="space-y-2 rounded-lg bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text)]">{t("guideOwesOffice", { amount: formatVnd(gOwes) })}</p>
                <label className="block text-[10px] text-[var(--muted2)]">{t("receiptPhotoOptionalLabel")}</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadingG2O || !!busy}
                  className="max-w-full text-[11px]"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setUploadingG2O(true);
                    setErr(null);
                    try {
                      setProofG2O(await uploadProof(tourId, f, t("uploadError"), t("noFileLink")));
                    } catch (x) {
                      setErr(x instanceof Error ? x.message : t("uploadFailed"));
                    } finally {
                      setUploadingG2O(false);
                    }
                  }}
                />
                {proofG2O ? (
                  <p className="text-[10px] text-[var(--muted)]">
                    {t("fileLabel")}{" "}
                    <a href={proofG2O} className="underline" target="_blank" rel="noreferrer">
                      {t("openLink")}
                    </a>
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!!busy || !!uploadingG2O}
                  onClick={() => void saveGuidePaidOffice()}
                  className="w-full rounded-lg bg-amber-700 py-2.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600"
                >
                  {busy === "g2o" ? tCashHandover("recordingEllipsis") : t("saveGuideTopupsAccepted")}
                </button>
              </div>
            ) : oOwes > 0 ? (
              <div className="space-y-2 rounded-lg bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text)]">{t("officeOwesGuide", { amount: formatVnd(oOwes) })}</p>
                <label className="block text-[10px] font-medium text-[var(--muted2)]">{t("amountFromCashLabel")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field-surface w-full rounded-lg px-2 py-1.5 text-sm tabular-nums"
                  value={officePayAmountStr}
                  onChange={(e) => setOfficePayAmountStr(formatVndInput(parseVndInput(e.target.value)))}
                  disabled={!!busy || !!uploadingO2G}
                />
                <label className="block text-[10px] font-medium text-[var(--muted2)]">{t("paymentFormLabel")}</label>
                <select
                  className="field-surface w-full rounded-lg px-2 py-1.5 text-sm"
                  value={officePaymentKind}
                  onChange={(e) => setOfficePaymentKind(e.target.value as "cash" | "bank_transfer")}
                  disabled={!!busy}
                >
                  <option value="cash">{t("cash")}</option>
                  <option value="bank_transfer">{t("bankTransfer")}</option>
                </select>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={closeOfficeSettlement}
                    onChange={(e) => setCloseOfficeSettlement(e.target.checked)}
                    disabled={!!busy}
                  />
                  {t("closeSettlementLabel")}
                </label>
                <label className="block text-[10px] text-[var(--muted2)]">{t("receiptPhotoOptionalLabel")}</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploadingO2G || !!busy}
                  className="max-w-full text-[11px]"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setUploadingO2G(true);
                    setErr(null);
                    try {
                      setProofO2G(await uploadProof(tourId, f, t("uploadError"), t("noFileLink")));
                    } catch (x) {
                      setErr(x instanceof Error ? x.message : t("uploadFailed"));
                    } finally {
                      setUploadingO2G(false);
                    }
                  }}
                />
                {proofO2G ? (
                  <p className="text-[10px] text-[var(--muted)]">
                    {t("fileLabel")}{" "}
                    <a href={proofO2G} className="underline" target="_blank" rel="noreferrer">
                      {t("openLink")}
                    </a>
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={!!busy || !!uploadingO2G}
                  onClick={() => void saveOfficePaidGuide()}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600"
                >
                  {busy === "o2g" ? tCashHandover("recordingEllipsis") : t("recordExpenseAndSave")}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">{t("zeroBalanceHint")}</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
