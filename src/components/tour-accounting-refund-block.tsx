"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TourManifestAbsence } from "@/lib/types";
import { formatVnd } from "@/lib/format";
import { FullscreenImageLightbox } from "@/components/fullscreen-image-lightbox";
import { useAccountingActions } from "@/components/accounting-actions-context";

type BookingBrief = {
  id: string;
  customerName: string;
  hotel: string;
  adults: number;
  children: number;
  infants: number;
};

function paxLine(a: number, c: number, i: number, adultsShort: string, childrenShort: string, infantsShort: string) {
  const parts: string[] = [];
  if (a) parts.push(`${a} ${adultsShort}`);
  if (c) parts.push(`${c} ${childrenShort}`);
  if (i) parts.push(`${i} ${infantsShort}`);
  return parts.join(", ") || "0";
}

function formatReviewedAtRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
    return iso;
  }
}

type FormRow = {
  refundExecutionNote: string;
  decision: "" | "approved" | "rejected";
  comment: string;
  traveledAdults: string;
  traveledChildren: string;
  traveledInfants: string;
};

/** Нужна ли бухгалтеру проверка возврата по этой строке */
function absenceAccountantRefundReviewNeeded(a: TourManifestAbsence): boolean {
  if (a.refundNotRequired) return false;
  if (!a.managerRefundAcknowledgedAt) return false;
  return (a.refundVnd ?? 0) > 0;
}

export function TourAccountingRefundBlock({
  tourId,
  bookings,
  absences,
}: {
  tourId: string;
  bookings: BookingBrief[];
  absences: TourManifestAbsence[];
}) {
  const router = useRouter();
  const t = useTranslations("accountingRefund");
  const tBooking = useTranslations("booking");
  const tTour = useTranslations("tour");
  const tCashHandover = useTranslations("cashHandover");
  const tCommon = useTranslations("common");
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const significant = useMemo(
    () => absences.filter((a) => a.absentAdults + a.absentChildren + a.absentInfants > 0),
    [absences],
  );
  const [form, setForm] = useState<Record<string, FormRow>>({});
  const [busy, setBusy] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const { registerManifestSave } = useAccountingActions();

  useEffect(() => {
    const next: Record<string, FormRow> = {};
    for (const a of absences) {
      const t = a.absentAdults + a.absentChildren + a.absentInfants;
      if (t <= 0) continue;
      next[a.bookingId] = {
        refundExecutionNote: a.refundExecutionNote ?? "",
        decision: a.accountantAbsenceDecision ?? "",
        comment: a.accountantAbsenceComment ?? "",
        traveledAdults:
          a.accountantTraveledAdults != null ? String(a.accountantTraveledAdults) : String(Math.max(0, (bookingById.get(a.bookingId)?.adults ?? 0) - a.absentAdults)),
        traveledChildren:
          a.accountantTraveledChildren != null ? String(a.accountantTraveledChildren) : String(Math.max(0, (bookingById.get(a.bookingId)?.children ?? 0) - a.absentChildren)),
        traveledInfants:
          a.accountantTraveledInfants != null ? String(a.accountantTraveledInfants) : String(Math.max(0, (bookingById.get(a.bookingId)?.infants ?? 0) - a.absentInfants)),
      };
    }
    setForm(next);
  }, [tourId, absences, bookingById]);

  const saveWithForm = useCallback(
    async (markReviewed: boolean, snapshot: Record<string, FormRow>) => {
      if (significant.length === 0) return true;
      if (markReviewed) {
        for (const a of significant) {
          if (!absenceAccountantRefundReviewNeeded(a)) continue;
          const f = snapshot[a.bookingId];
          if (!f?.decision) {
            alert(
              t("confirmDecisionAlert", { name: bookingById.get(a.bookingId)?.customerName ?? a.bookingId }),
            );
            return false;
          }
          if (f.decision === "rejected" && (f.comment ?? "").trim().length < 8) {
            alert(
              t("rejectCommentAlert", { name: bookingById.get(a.bookingId)?.customerName ?? a.bookingId }),
            );
            return false;
          }
        }
      }
      setBusy(true);
      try {
        const parseN = (s: string) => {
          const n = Math.max(0, Math.round(Number(String(s).replace(/\s/g, "")) || 0));
          return Number.isFinite(n) ? n : 0;
        };
        const items = significant.map((a) => {
          const f = snapshot[a.bookingId];
          const needReview = absenceAccountantRefundReviewNeeded(a);
          return {
            bookingId: a.bookingId,
            refundExecutionNote: f?.refundExecutionNote ?? "",
            decision: f?.decision === "" ? null : f?.decision,
            comment: f?.comment ?? "",
            traveledAdults: parseN(f?.traveledAdults ?? "0"),
            traveledChildren: parseN(f?.traveledChildren ?? "0"),
            traveledInfants: parseN(f?.traveledInfants ?? "0"),
            markReviewed: markReviewed && needReview,
          };
        });
        const res = await fetch(`/api/tours/${tourId}/manifest/accountant-absence-review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          alert(j.error || tCashHandover("failedToSave"));
          return false;
        }
        router.refresh();
        return true;
      } catch {
        alert(tCommon("noConnection"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [tourId, significant, router, bookingById, t, tCashHandover, tCommon],
  );

  useEffect(() => {
    if (significant.length === 0) {
      registerManifestSave(null);
      return;
    }
    registerManifestSave({
      saveDraft: () => saveWithForm(false, formRef.current),
      saveFinal: () => saveWithForm(true, formRef.current),
    });
    return () => registerManifestSave(null);
  }, [registerManifestSave, saveWithForm, significant.length]);

  if (significant.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        {t("noAbsences")}
      </p>
    );
  }

  const strongTag = { strong: (chunks: React.ReactNode) => <strong className="text-[var(--text)]">{chunks}</strong> };

  return (
    <div className="space-y-3">
      <FullscreenImageLightbox src={lightboxSrc} open={Boolean(lightboxSrc)} onClose={() => setLightboxSrc(null)} />

      <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[11px] leading-snug text-[var(--muted)] ring-1 ring-[var(--border)]/60">
        <summary className="cursor-pointer select-none font-semibold text-[var(--text)]">
          {t("howRefundsWorkTitle")}
        </summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4">
          <li>{t.rich("step1", strongTag)}</li>
          <li>{t.rich("step2", strongTag)}</li>
          <li>{t("step3")}</li>
          <li>{t.rich("step4", strongTag)}</li>
          <li>{t.rich("step5", strongTag)}</li>
        </ol>
        <p className="mt-2 text-[10px] text-[var(--muted2)]">
          {t("draftClosedHint")}
        </p>
      </details>

      <ul className="space-y-3">
        {significant.map((a) => {
          const b = bookingById.get(a.bookingId);
          const f = form[a.bookingId];
          const needRefundReview = absenceAccountantRefundReviewNeeded(a);
          const waitManager = !a.refundNotRequired && !a.managerRefundAcknowledgedAt;
          const noRefundPath = Boolean(a.refundNotRequired);
          const reviewed = Boolean(a.accountantAbsenceReviewedAt);
          const mgrAckButNoAmount =
            Boolean(a.managerRefundAcknowledgedAt) && !a.refundNotRequired && (a.refundVnd ?? 0) <= 0;

          return (
            <li key={a.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-2 text-xs">
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-medium text-[var(--text)]">
                <span>{b?.customerName ?? "-"}</span>
                <span className="text-[var(--muted)]">·</span>
                <span className="text-[var(--muted)]">{b?.hotel ?? "-"}</span>
              </div>

              <div className="mt-1 grid gap-1 text-[11px] text-[var(--muted)] sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-[var(--text)]">{t("notTraveled")}</span>{" "}
                  {paxLine(a.absentAdults, a.absentChildren, a.absentInfants, tBooking("adultsShort"), tBooking("childrenShort"), tTour("infants"))}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text)]">{t("moneyRefund")}</span>{" "}
                  {noRefundPath
                    ? t("refundNotNeededDecision")
                    : (a.refundVnd ?? 0) > 0
                      ? formatVnd(a.refundVnd ?? 0)
                      : t("amountNotSet")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text)]">{t("managerArrangedTerms")}</span>{" "}
                  {a.managerRefundAcknowledgedAt ? t("yes") : t("no")}
                </p>
                <p>
                  <span className="font-semibold text-[var(--text)]">{t("accountantCheck")}</span>{" "}
                  {noRefundPath
                    ? t("checkNotNeeded")
                    : waitManager
                      ? t("waitingManager")
                      : mgrAckButNoAmount
                        ? t("dataIncomplete")
                        : needRefundReview
                          ? reviewed
                            ? t("completedAt", { date: formatReviewedAtRu(a.accountantAbsenceReviewedAt!) })
                            : t("decisionNeeded")
                          : "-"}
                </p>
              </div>

              {noRefundPath ? (
                <p className="mt-2 rounded-md border border-emerald-200/80 bg-emerald-50/90 px-2 py-1.5 text-[11px] text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/25 dark:text-emerald-100">
                  {t("noRefundManagerNote")}
                </p>
              ) : null}

              {waitManager ? (
                <p className="mt-2 rounded-md border border-amber-200/90 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950 dark:border-amber-800/55 dark:bg-amber-950/30 dark:text-amber-50">
                  {t("waitManagerNote")}
                </p>
              ) : null}

              {mgrAckButNoAmount ? (
                <p className="mt-2 rounded-md border border-amber-200/90 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950 dark:border-amber-800/55 dark:bg-amber-950/30 dark:text-amber-50">
                  {t("mgrAckNoAmountNote")}
                </p>
              ) : null}

              {a.managerRefundNote ? (
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  <span className="font-medium text-[var(--text)]">{t("managerCommentLabel")}</span> {a.managerRefundNote}
                </p>
              ) : needRefundReview ? (
                <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                  {t("managerCommentEmptyHint")}
                </p>
              ) : null}

              {a.managerRefundCertificateUrl ? (
                <div className="action-row mt-1.5">
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(a.managerRefundCertificateUrl!)}
                    className="text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    {t("openAttachmentFullscreen")}
                  </button>
                  <a
                    href={a.managerRefundCertificateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[var(--muted2)] hover:underline"
                  >
                    {t("openInNewTab")}
                  </a>
                </div>
              ) : needRefundReview ? (
                <p className="mt-1 text-[10px] text-[var(--muted2)]">
                  {t("noAttachmentHint")}
                </p>
              ) : null}

              {needRefundReview ? (
                <>
                  <label className="mt-2 block">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                      {t("refundExecutionLabel")}
                    </span>
                    <textarea
                      className="field-surface mt-0.5 min-h-[2.5rem] w-full rounded-lg px-2 py-1.5 text-xs"
                      placeholder={t("refundExecutionPlaceholder")}
                      value={f?.refundExecutionNote ?? ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), refundExecutionNote: e.target.value },
                        }))
                      }
                      disabled={busy}
                    />
                  </label>

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="block text-[10px]">
                      <span className="text-[var(--muted2)]">{t("traveledAdultsLabel")}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="field-surface mt-0.5 w-full rounded-lg px-2 py-1 text-xs tabular-nums"
                        value={f?.traveledAdults ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), traveledAdults: e.target.value },
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="block text-[10px]">
                      <span className="text-[var(--muted2)]">{t("traveledChildrenLabel")}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="field-surface mt-0.5 w-full rounded-lg px-2 py-1 text-xs tabular-nums"
                        value={f?.traveledChildren ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), traveledChildren: e.target.value },
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="block text-[10px]">
                      <span className="text-[var(--muted2)]">{t("traveledInfantsLabel")}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="field-surface mt-0.5 w-full rounded-lg px-2 py-1 text-xs tabular-nums"
                        value={f?.traveledInfants ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), traveledInfants: e.target.value },
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted2)]">
                    {t("traveledHint")}
                  </p>

                  <div className="action-row mt-2">
                    <span className="text-[10px] font-medium text-[var(--muted2)]">{t("decisionLabel")}</span>
                    {(["approved", "rejected"] as const).map((d) => (
                      <label key={d} className="flex items-center gap-1 text-[11px]">
                        <input
                          type="radio"
                          name={`dec-${a.bookingId}`}
                          checked={f?.decision === d}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), decision: d },
                            }))
                          }
                          disabled={busy}
                        />
                        {d === "approved" ? t("approveRefund") : t("rejectRefund")}
                      </label>
                    ))}
                  </div>

                  <label className="mt-2 block">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                      {t("accountantCommentLabel")}
                    </span>
                    <textarea
                      className="field-surface mt-0.5 min-h-[2.75rem] w-full rounded-lg px-2 py-1.5 text-xs"
                      placeholder={t("accountantCommentPlaceholder")}
                      value={f?.comment ?? ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          [a.bookingId]: { ...(prev[a.bookingId] || ({} as FormRow)), comment: e.target.value },
                        }))
                      }
                      disabled={busy}
                    />
                  </label>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
