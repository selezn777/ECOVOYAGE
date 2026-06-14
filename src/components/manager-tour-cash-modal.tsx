"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { formatVnd, formatUsd } from "@/lib/format";
import { showConfirm } from "@/lib/ui-dialog";
import type {
  ManagerCashHandoverAllToursPayload,
  ManagerCashHandoverTourRow,
  ManagerTourHandoverContext,
  TourCashHandoverManagersPayload,
} from "@/lib/data";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";

type Props = {
  open: boolean;
  onClose: () => void;
  tourId: string;
  tourName: string;
  suggestedManagerId?: string | null;
  suggestedManagerName?: string | null;
  onSaved: () => void;
};

type Step = "pick_manager" | "tour_detail" | "all_tours";

function parseVnd(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function parseUsdInput(raw: string): number {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatVndInput(n: number): string {
  if (!n) return "";
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.5 15L7.5 10l5-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackNavButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--surface-soft)] py-1.5 pl-2 pr-3 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] transition-colors active:scale-[0.98] hover:bg-[var(--surface-soft)]/70 disabled:opacity-50"
    >
      <IconChevronLeft className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

async function postOfficeHandover(
  body: {
    tourId: string;
    managerId: string;
    amountVnd: number;
    channelId: string;
    amountUsd?: number;
    note?: string;
    bookingId?: string;
  },
  fallbackErrorMsg: string,
): Promise<void> {
  const res = await fetch(`/api/tours/${body.tourId}/office-cash-handovers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      holderRole: "manager",
      employeeId: body.managerId,
      amountVnd: body.amountVnd,
      channelId: body.channelId,
      amountUsd: body.amountUsd,
      note: body.note?.trim() || undefined,
      bookingId: body.bookingId || undefined,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string | { formErrors?: string[] } };
  if (!res.ok) {
    const msg =
      typeof j.error === "string"
        ? j.error
        : Array.isArray(j.error?.formErrors)
          ? j.error.formErrors.join(" ")
          : fallbackErrorMsg;
    throw new Error(msg);
  }
}

type SingleConfirmTour = ManagerCashHandoverTourRow;

type BookingPayRow = { vnd: string; usd: string };

export function ManagerTourCashModal(props: Props) {
  const { open, onClose, tourId, tourName, suggestedManagerId, suggestedManagerName, onSaved } = props;
  const t = useTranslations("managerCashModal");
  const tCashHandover = useTranslations("cashHandover");
  const tCash = useTranslations("cash");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState<Step>("pick_manager");
  const [mgrList, setMgrList] = useState<TourCashHandoverManagersPayload | null>(null);
  const [listErr, setListErr] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [selectedManagerName, setSelectedManagerName] = useState("");

  const [ctx, setCtx] = useState<ManagerTourHandoverContext | null>(null);
  const [ctxErr, setCtxErr] = useState("");

  const [allTours, setAllTours] = useState<ManagerCashHandoverAllToursPayload | null>(null);
  const [allToursErr, setAllToursErr] = useState("");

  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState("");
  /** Свернутый по умолчанию блок «комментарий» — большинству сдач он не нужен. */
  const [moreOpen, setMoreOpen] = useState(false);
  /** Доп. часть в долларах — скрыта по умолчанию, всё считается в донгах. */
  const [usdSplitOpen, setUsdSplitOpen] = useState(false);
  /** Построчно: сдача с привязкой к брони (₫, опционально часть в $). */
  const [perBookingPay, setPerBookingPay] = useState<Record<string, BookingPayRow>>({});
  /** Одна строка в журнал без привязки к брони — для уже собранных менеджером денег, не привязанных к конкретной брони. */
  const [journalVnd, setJournalVnd] = useState("");
  const [journalUsd, setJournalUsd] = useState("");

  const [singleConfirmTour, setSingleConfirmTour] = useState<SingleConfirmTour | null>(null);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  /** Не дергать повторно getManagerTourHandoverContext для той же пары тур+менеджер (префетч + клик). */
  const handoverCtxCacheKeyRef = useRef<string | null>(null);
  /** Один запрос sheet на ключ, пока префетч и авто-переход не дернули дважды. */
  const handoverCtxInFlightRef = useRef<string | null>(null);
  const didAutoPickSingleManagerRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetForm = useCallback(() => {
    setNote("");
    setMoreOpen(false);
    setUsdSplitOpen(false);
    setPerBookingPay({});
    setJournalVnd("");
    setJournalUsd("");
  }, []);

  const loadManagers = useCallback(async () => {
    setListErr("");
    const res = await fetch(`/api/tours/${tourId}/cash-handover-managers`);
    const j = (await res.json().catch(() => ({}))) as TourCashHandoverManagersPayload | { error?: string };
    if (!res.ok) {
      setListErr(typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : t("loadError"));
      setMgrList(null);
      return;
    }
    setMgrList(j as TourCashHandoverManagersPayload);
  }, [tourId, t]);

  const loadCtx = useCallback(
    async (managerId: string) => {
      const cacheKey = `${tourId}:${managerId}`;
      if (handoverCtxCacheKeyRef.current === cacheKey) {
        return;
      }
      if (handoverCtxInFlightRef.current === cacheKey) {
        return;
      }
      handoverCtxInFlightRef.current = cacheKey;
      setCtxErr("");
      try {
        const res = await fetch(`/api/tours/${tourId}/manager-handover-sheet?managerId=${encodeURIComponent(managerId)}`);
        const j = (await res.json().catch(() => ({}))) as ManagerTourHandoverContext | { error?: string };
        if (!res.ok) {
          setCtxErr(typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : t("loadError"));
          setCtx(null);
          handoverCtxCacheKeyRef.current = null;
          return;
        }
        const data = j as ManagerTourHandoverContext;
        handoverCtxCacheKeyRef.current = cacheKey;
        setCtx(data);
        setPerBookingPay(
          Object.fromEntries(
            data.bookings.map((b) => [
              b.bookingId,
              { vnd: b.maxHandoverVnd > 0 ? formatVndInput(b.maxHandoverVnd) : "", usd: "" },
            ]),
          ),
        );
        // Остаток долга менеджера, не покрытый суммами по броням (уже собранные деньги без привязки к конкретной брони) —
        // подставляем в строку «журнал», чтобы ничего не нужно было считать руками.
        const prefilledBookingsTotal = data.bookings.reduce((s, b) => s + (b.maxHandoverVnd > 0 ? b.maxHandoverVnd : 0), 0);
        const journalDefault = Math.max(0, data.outstandingOnTourVnd - prefilledBookingsTotal);
        setJournalVnd(journalDefault > 0 ? formatVndInput(journalDefault) : "");
        setJournalUsd("");
        setNote("");
        setUsdSplitOpen(false);
      } finally {
        if (handoverCtxInFlightRef.current === cacheKey) {
          handoverCtxInFlightRef.current = null;
        }
      }
    },
    [tourId, t],
  );

  const loadAllTours = useCallback(async (managerId: string) => {
    setAllToursErr("");
    const res = await fetch(`/api/managers/${managerId}/cash-handover-tours`);
    const j = (await res.json().catch(() => ({}))) as ManagerCashHandoverAllToursPayload | { error?: string };
    if (!res.ok) {
      setAllToursErr(typeof (j as { error?: string }).error === "string" ? (j as { error: string }).error : t("loadError"));
      setAllTours(null);
      return;
    }
    setAllTours(j as ManagerCashHandoverAllToursPayload);
  }, [t]);

  useEffect(() => {
    if (!open) {
      didAutoPickSingleManagerRef.current = false;
      return;
    }
    handoverCtxCacheKeyRef.current = null;
    handoverCtxInFlightRef.current = null;
    setStep("pick_manager");
    setSelectedManagerId(null);
    setSelectedManagerName("");
    setCtx(null);
    setAllTours(null);
    setListErr("");
    setCtxErr("");
    setAllToursErr("");
    setSingleConfirmTour(null);
    setBatchConfirmOpen(false);
    resetForm();
    void loadManagers();
    const sug = suggestedManagerId?.trim();
    if (sug) {
      void loadCtx(sug);
    }
  }, [open, loadManagers, loadCtx, resetForm, suggestedManagerId]);

  /** Один менеджер на туре - сразу форма сдачи, без лишнего шага. */
  useEffect(() => {
    if (!open || !mgrList || mgrList.managers.length !== 1 || didAutoPickSingleManagerRef.current) return;
    didAutoPickSingleManagerRef.current = true;
    const only = mgrList.managers[0]!;
    setSelectedManagerId(only.managerId);
    setSelectedManagerName(only.managerName);
    setStep("tour_detail");
    const key = `${tourId}:${only.managerId}`;
    if (handoverCtxCacheKeyRef.current !== key) {
      void loadCtx(only.managerId);
    }
  }, [open, mgrList, loadCtx, tourId]);

  /** Не даём листать страницу под модалкой. */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /** Каналы поступления больше не выбираются руками: по умолчанию всегда донги, доллары — отдельный опциональный канал. */
  const cashVndChannelId = useMemo(
    () => ctx?.channels.find((c) => c.slug === "cash_vnd")?.id ?? ctx?.channels[0]?.id ?? "",
    [ctx],
  );
  const cashUsdChannelId = useMemo(() => ctx?.channels.find((c) => c.slug === "cash_usd")?.id ?? "", [ctx]);

  const headerDate =
    step === "pick_manager" && mgrList?.tourDate
      ? formatYmdWithWeekdayRu(mgrList.tourDate)
      : ctx
        ? formatYmdWithWeekdayRu(ctx.tourDate)
        : "…";

  const toursWithDebt = useMemo(() => (allTours?.tours || []).filter((t) => t.outstandingOnTourVnd > 0), [allTours]);
  const toursNoDebt = useMemo(() => (allTours?.tours || []).filter((t) => t.outstandingOnTourVnd <= 0), [allTours]);
  const totalDebtOnly = useMemo(() => toursWithDebt.reduce((s, t) => s + t.outstandingOnTourVnd, 0), [toursWithDebt]);

  function bookingPayRow(bookingId: string): BookingPayRow {
    return perBookingPay[bookingId] ?? { vnd: "", usd: "" };
  }

  function patchBookingPay(bookingId: string, patch: Partial<BookingPayRow>) {
    setPerBookingPay((prev) => {
      const cur = prev[bookingId] ?? { vnd: "", usd: "" };
      return { ...prev, [bookingId]: { ...cur, ...patch } };
    });
  }

  async function onSubmitTourDetail(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx || !selectedManagerId) return;

    type PostLine = { bookingId?: string; channelId: string; amountVnd: number; amountUsd?: number; label: string };
    const posts: PostLine[] = [];

    for (const b of ctx.bookings) {
      const row = bookingPayRow(b.bookingId);
      const v = parseVnd(row.vnd);
      if (v <= 0) continue;
      if (b.maxHandoverVnd <= 0) {
        alert(t("noBookingAmountAlert", { name: b.customerName }));
        return;
      }
      if (v > b.maxHandoverVnd) {
        alert(t("bookingMaxAlert", { name: b.customerName, amount: formatVnd(b.maxHandoverVnd) }));
        return;
      }
      const u = usdSplitOpen ? parseUsdInput(row.usd) : 0;
      const ch = u > 0 ? cashUsdChannelId : cashVndChannelId;
      if (!ch) {
        alert(t("noIncomeChannelsHint"));
        return;
      }
      if (u > 0 && !cashUsdChannelId) {
        alert(t("noUsdChannelHint"));
        return;
      }
      posts.push({
        bookingId: b.bookingId,
        channelId: ch,
        amountVnd: v,
        amountUsd: u > 0 ? u : undefined,
        label: b.customerName,
      });
    }

    const jVnd = parseVnd(journalVnd);
    if (jVnd > 0) {
      const jUsd = usdSplitOpen ? parseUsdInput(journalUsd) : 0;
      const jCh = jUsd > 0 ? cashUsdChannelId : cashVndChannelId;
      if (!jCh) {
        alert(t("noIncomeChannelsHint"));
        return;
      }
      posts.push({
        channelId: jCh,
        amountVnd: jVnd,
        amountUsd: jUsd > 0 ? jUsd : undefined,
        label: "журнал",
      });
    }

    if (!posts.length) {
      alert(t("fillAmountOrJournalAlert"));
      return;
    }
    const ok = await showConfirm(
      t("confirmRecordHandover", {
        n: posts.length,
        word: t(posts.length === 1 ? "movementSingular" : "movementPlural"),
      }),
    );
    if (!ok) return;

    const baseNote = note.trim();
    setBusy(true);
    try {
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i]!;
        const noteLine = [
          baseNote,
          p.bookingId ? `бронь: ${p.label}` : "без брони (журнал)",
          posts.length > 1 ? `запись ${i + 1}/${posts.length}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        await postOfficeHandover(
          {
            tourId,
            managerId: selectedManagerId,
            amountVnd: p.amountVnd,
            channelId: p.channelId,
            amountUsd: p.amountUsd,
            note: noteLine || undefined,
            bookingId: p.bookingId,
          },
          tCashHandover("failedToSave"),
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setBusy(false);
    }
  }

  async function runBatchHandovers(targets: ManagerCashHandoverTourRow[]) {
    if (!ctx || !selectedManagerId || !cashVndChannelId) return;
    const baseNote = note.trim();
    const batchNote =
      [baseNote, `Пакетная сдача: ${targets.length} тур(ов), менеджер ${selectedManagerName || selectedManagerId}`]
        .filter(Boolean)
        .join(" · ");
    setBusy(true);
    try {
      for (const tour of targets) {
        await postOfficeHandover(
          {
            tourId: tour.tourId,
            managerId: selectedManagerId,
            amountVnd: tour.outstandingOnTourVnd,
            channelId: cashVndChannelId,
            note: batchNote,
          },
          tCashHandover("failedToSave"),
        );
      }
      setBatchConfirmOpen(false);
      onSaved();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setBusy(false);
    }
  }

  async function runSingleTourPosts(
    tourRow: ManagerCashHandoverTourRow,
    posts: { channelId: string; amountVnd: number; amountUsd?: number }[],
  ) {
    if (!ctx || !selectedManagerId) return;
    const baseNote = note.trim();
    const rowNote = [baseNote, `Сдача по туру, менеджер ${selectedManagerName || selectedManagerId}`].filter(Boolean).join(" · ");
    setBusy(true);
    try {
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i]!;
        await postOfficeHandover(
          {
            tourId: tourRow.tourId,
            managerId: selectedManagerId,
            amountVnd: p.amountVnd,
            channelId: p.channelId,
            amountUsd: p.amountUsd,
            note: posts.length > 1 ? `${rowNote} · часть ${i + 1}/${posts.length}` : rowNote,
          },
          tCashHandover("failedToSave"),
        );
      }
      setSingleConfirmTour(null);
      onSaved();
      handoverCtxCacheKeyRef.current = null;
      await loadAllTours(selectedManagerId);
      await loadCtx(selectedManagerId);
      await loadManagers();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setBusy(false);
    }
  }

  function pickManager(m: TourCashHandoverManagersPayload["managers"][number]) {
    setSelectedManagerId(m.managerId);
    setSelectedManagerName(m.managerName);
    setStep("tour_detail");
    void loadCtx(m.managerId);
  }

  function switchManager(managerId: string) {
    const m = mgrList?.managers.find((x) => x.managerId === managerId);
    setSelectedManagerId(managerId || null);
    setSelectedManagerName(m?.managerName || "");
    setCtx(null);
    setAllTours(null);
    setCtxErr("");
    setAllToursErr("");
    setSingleConfirmTour(null);
    setBatchConfirmOpen(false);
    resetForm();
    if (managerId) {
      void loadCtx(managerId);
      if (step === "all_tours") void loadAllTours(managerId);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center overscroll-none bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={tCommon("close")}
        onClick={() => !busy && !singleConfirmTour && !batchConfirmOpen && onClose()}
      />
      <div
        className="relative z-[201] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col rounded-t-2xl bg-[var(--surface)] shadow-xl ring-1 ring-[var(--border)] sm:max-h-[85vh] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mgr-cash-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id="mgr-cash-modal-title" className="text-base font-semibold text-[var(--text)]">
              {tCashHandover("title")}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {tourName} · {headerDate}
              {step !== "pick_manager" && selectedManagerName ? ` · ${selectedManagerName}` : null}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || Boolean(singleConfirmTour) || batchConfirmOpen}
            className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
            onClick={() => onClose()}
          >
            ✕
          </button>
        </div>

        <div
          className={`relative min-h-0 flex-1 px-4 py-3 ${
            singleConfirmTour || batchConfirmOpen ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
          }`}
        >
          {step === "pick_manager" ? (
            <>
              <p className="mb-3 text-xs text-[var(--muted)]">{t("pickManagerHint")}</p>
              {listErr ? <p className="text-sm text-red-600 dark:text-red-400">{listErr}</p> : null}
              {!mgrList && !listErr ? <p className="text-sm text-[var(--muted)]">{tCommon("loading")}</p> : null}
              {mgrList?.managers.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">{t("noBookingsWithManager")}</p>
              ) : null}
              <ul className="space-y-2">
                {mgrList?.managers.map((m) => {
                  return (
                    <li key={m.managerId}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pickManager(m)}
                        className={`w-full rounded-xl px-3 py-3 text-left ring-1 transition-colors ${
                          suggestedManagerId === m.managerId
                            ? "bg-amber-50 ring-amber-300/90 dark:bg-amber-950/40 dark:ring-amber-700/60"
                            : "bg-[var(--surface-soft)] ring-[var(--border)] hover:bg-[var(--surface-soft)]/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-[var(--text)]">{m.managerName}</div>
                            {suggestedManagerId === m.managerId ? (
                              <div className="mt-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                {t("accountingRowLabel", { name: (suggestedManagerName || "").trim() || m.managerName })}
                              </div>
                            ) : null}
                            <div className="mt-1 text-[11px] text-[var(--muted)]">
                              {t("bookingsCountLabel", { n: m.bookingCount })}
                              {m.outstandingOnTourVnd > 0 ? (
                                <span className="font-semibold text-amber-900 dark:text-amber-100">
                                  {" "}
                                  · {t("toHandOver", { amount: formatVnd(m.outstandingOnTourVnd) })}
                                </span>
                              ) : (
                                <span className="text-emerald-800 dark:text-emerald-200"> · {t("noCashDebt")}</span>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-lg text-[var(--muted)]">›</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step === "tour_detail" ? (
            <>
              <BackNavButton
                label={t("managersOnTour")}
                disabled={busy}
                onClick={() => {
                  handoverCtxCacheKeyRef.current = null;
                  handoverCtxInFlightRef.current = null;
                  setStep("pick_manager");
                  setCtx(null);
                  setAllTours(null);
                  resetForm();
                }}
              />
              {ctxErr ? <p className="text-sm text-red-600 dark:text-red-400">{ctxErr}</p> : null}
              {!ctx && !ctxErr ? <p className="text-sm text-[var(--muted)]">{tCommon("loading")}</p> : null}
              {ctx ? (
                <>
                  {mgrList?.managers && mgrList.managers.length > 1 ? (
                    <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                      {t("managerWhoSold")}
                      <select
                        value={selectedManagerId || ""}
                        onChange={(e) => switchManager(e.target.value)}
                        className="field-surface rounded-lg px-3 py-2 text-sm"
                        disabled={busy}
                      >
                        <option value="">{t("selectDash")}</option>
                        {mgrList.managers.map((m) => (
                          <option key={m.managerId} value={m.managerId}>
                            {m.managerName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2 ring-1 ring-[var(--border)]">
                      <div className="font-medium text-[var(--muted2)]">{t("receivedStat")}</div>
                      <div className="mt-0.5 font-semibold tabular-nums text-[var(--text)]">{formatVnd(ctx.receivedOnTourVnd)}</div>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2 ring-1 ring-[var(--border)]">
                      <div className="font-medium text-[var(--muted2)]">{t("handedOverStat")}</div>
                      <div className="mt-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatVnd(ctx.handedOnTourVnd)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 px-2 py-2 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:ring-amber-800/50">
                      <div className="font-medium text-amber-900/80 dark:text-amber-200/90">{t("toHandOverStat")}</div>
                      <div className="mt-0.5 font-semibold tabular-nums text-amber-950 dark:text-amber-100">
                        {formatVnd(ctx.outstandingOnTourVnd)}
                      </div>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("touristsManagerBookings")}</h3>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-[11px] font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                      onClick={() => {
                        setStep("all_tours");
                        void loadAllTours(selectedManagerId!);
                      }}
                    >
                      {t("allManagerTours")}
                    </button>
                  </div>
                  <ul className="mb-4 space-y-2 text-xs">
                    {ctx.bookings.length === 0 ? (
                      <li className="text-[var(--muted)]">{t("noManagerBookingsOnTour")}</li>
                    ) : (
                      ctx.bookings.map((b) => {
                        const row = bookingPayRow(b.bookingId);
                        return (
                          <li key={b.bookingId} className="rounded-xl bg-[var(--surface-soft)] p-2.5 ring-1 ring-[var(--border)]">
                            <div className="font-semibold text-[var(--text)]">{b.customerName}</div>
                            <div className="text-[var(--muted)]">{b.hotel || "-"}</div>
                            <div className="mt-1 tabular-nums text-[11px] text-[var(--muted)]">
                              {t("bookingMoneyLine", {
                                tour: formatVnd(b.totalVnd),
                                paid: formatVnd(b.paidVnd),
                                due: formatVnd(b.dueVnd),
                              })}
                              {b.pendingGuideTopupVnd > 0 ? (
                                <span className="text-amber-800 dark:text-amber-200">
                                  {" "}
                                  · {t("withGuide", { amount: formatVnd(b.pendingGuideTopupVnd) })}
                                </span>
                              ) : null}
                            </div>
                            {b.maxHandoverVnd > 0 ? (
                              <div className="mt-2 space-y-2 border-t border-[var(--border)]/70 pt-2">
                                <div className="flex flex-wrap items-end gap-2">
                                  <label className="flex min-w-[7rem] flex-1 flex-col gap-0.5 text-[10px] font-medium text-[var(--muted2)]">
                                    {tCashHandover("amountVndPlaceholder")}
                                    <input
                                      value={row.vnd}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, "");
                                        patchBookingPay(b.bookingId, { vnd: v ? formatVndInput(Number(v)) : "" });
                                      }}
                                      inputMode="numeric"
                                      placeholder="0"
                                      className="field-surface rounded-lg px-2 py-1.5 text-xs tabular-nums"
                                      disabled={busy}
                                    />
                                  </label>
                                  {usdSplitOpen ? (
                                    <label className="flex min-w-[6rem] flex-1 flex-col gap-0.5 text-[10px] font-medium text-[var(--muted2)]">
                                      {t("usdPartLabel")}
                                      <input
                                        value={row.usd}
                                        onChange={(e) => patchBookingPay(b.bookingId, { usd: e.target.value })}
                                        inputMode="decimal"
                                        placeholder="0"
                                        className="field-surface rounded-lg px-2 py-1.5 text-xs tabular-nums"
                                        disabled={busy}
                                      />
                                    </label>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="rounded-md border border-[var(--border)] px-2 py-1.5 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--surface)]"
                                    disabled={busy}
                                    onClick={() => patchBookingPay(b.bookingId, { vnd: formatVndInput(b.maxHandoverVnd) })}
                                  >
                                    {t("maxButton", { amount: formatVnd(b.maxHandoverVnd) })}
                                  </button>
                                </div>
                                <p className="text-[10px] text-[var(--muted)]">{t("canHandOverUpTo", { amount: formatVnd(b.maxHandoverVnd) })}</p>
                              </div>
                            ) : (
                              <p className="mt-2 border-t border-[var(--border)]/70 pt-2 text-[10px] text-[var(--muted)]">
                                {t("nothingToHandOverHint")}
                              </p>
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>

                  <form onSubmit={(e) => void onSubmitTourDetail(e)} className="space-y-3 border-t border-[var(--border)] pt-3">
                    {!cashVndChannelId ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:text-amber-200 dark:ring-amber-800/50">
                        {t("noChannelsCannotAccept")}
                      </p>
                    ) : null}

                    {usdSplitOpen ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUsdSplitOpen(false);
                          setJournalUsd("");
                          setPerBookingPay((prev) =>
                            Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, usd: "" }])),
                          );
                        }}
                        className="text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        {t("withoutUsdOnly")}
                      </button>
                    ) : cashUsdChannelId ? (
                      <button
                        type="button"
                        onClick={() => setUsdSplitOpen(true)}
                        className="text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        {t("addUsdPart")}
                      </button>
                    ) : null}

                    {ctx.outstandingOnTourVnd > 0 ? (
                      <div className="rounded-xl bg-[var(--surface-soft)]/80 p-3 ring-1 ring-[var(--border)]/80">
                        <div className="text-[11px] font-medium text-[var(--muted2)]">{t("journalOnly")}</div>
                        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                          {t("journalAutoFillHint")}
                        </p>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <label className="flex min-w-[7rem] flex-1 flex-col gap-0.5 text-[10px] font-medium text-[var(--muted2)]">
                            {tCashHandover("amountVndPlaceholder")}
                            <input
                              value={journalVnd}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                setJournalVnd(v ? formatVndInput(Number(v)) : "");
                              }}
                              inputMode="numeric"
                              placeholder="0"
                              className="field-surface rounded-lg px-2 py-1.5 text-xs tabular-nums"
                              disabled={busy}
                            />
                          </label>
                          {usdSplitOpen ? (
                            <label className="flex min-w-[6rem] flex-1 flex-col gap-0.5 text-[10px] font-medium text-[var(--muted2)]">
                              {t("usdPartLabel")}
                              <input
                                value={journalUsd}
                                onChange={(e) => setJournalUsd(e.target.value)}
                                inputMode="decimal"
                                placeholder="0"
                                className="field-surface rounded-lg px-2 py-1.5 text-xs tabular-nums"
                                disabled={busy}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {moreOpen ? (
                      <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                        {tCash("commentOptional")}
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="field-surface rounded-lg px-3 py-2 text-sm"
                          disabled={busy}
                        />
                      </label>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        className="text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        {t("addComment")}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={busy || !cashVndChannelId}
                      className="min-h-[52px] w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white disabled:opacity-50 active:opacity-90"
                    >
                      {busy ? tCashHandover("recordingEllipsis") : tCashHandover("acceptToCash")}
                    </button>
                  </form>
                </>
              ) : null}
            </>
          ) : null}

          {step === "all_tours" ? (
            <>
              <BackNavButton
                label={t("thisTour")}
                disabled={busy}
                onClick={() => {
                  setStep("tour_detail");
                  setAllTours(null);
                }}
              />
              {!ctx ? (
                <p className="text-sm text-[var(--muted)]">{t("noChannelDataGoBack")}</p>
              ) : (
                <>
                  {mgrList?.managers && mgrList.managers.length > 1 ? (
                    <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                      {t("managerWhoSold")}
                      <select
                        value={selectedManagerId || ""}
                        onChange={(e) => switchManager(e.target.value)}
                        className="field-surface rounded-lg px-3 py-2 text-sm"
                        disabled={busy}
                      >
                        <option value="">{t("selectDash")}</option>
                        {mgrList.managers.map((m) => (
                          <option key={m.managerId} value={m.managerId}>
                            {m.managerName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {allToursErr ? <p className="text-sm text-red-600 dark:text-red-400">{allToursErr}</p> : null}
                  {!allTours && !allToursErr ? <p className="text-sm text-[var(--muted)]">{tCommon("loading")}</p> : null}
                  {allTours ? (
                    <>
                      <div className="mb-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
                        <div className="text-[11px] font-medium text-[var(--muted2)]">{t("toHandOverByManager")}</div>
                        <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
                          {t("managerCashCalcHint")}
                        </p>
                        <div className="mt-2 text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                          {formatVnd(totalDebtOnly)}
                        </div>
                      </div>
                      <ul className="mb-3 max-h-52 space-y-1.5 overflow-y-auto overscroll-contain text-xs">
                        {toursWithDebt.length === 0 ? (
                          <li className="text-[var(--muted)]">{t("noToursWithDebt")}</li>
                        ) : (
                          toursWithDebt.map((tour) => (
                            <li
                              key={tour.tourId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-soft)] px-2 py-2 ring-1 ring-[var(--border)]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[var(--text)]">{tour.tourName}</div>
                                <div className="tabular-nums text-[10px] text-[var(--muted)]">
                                  {formatYmdWithWeekdayRu(tour.tourDate)} · {t("bookingsCountInline", { n: tour.bookingCount })}
                                </div>
                                {tour.pendingGuideTopupOnTourVnd > 0 ? (
                                  <div className="mt-0.5 text-[10px] text-sky-800 dark:text-sky-200">
                                    {t("withGuideNotInManagerCash", { amount: formatVnd(tour.pendingGuideTopupOnTourVnd) })}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                                <span className="font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                                  {formatVnd(tour.outstandingOnTourVnd)}
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded-md bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-white"
                                  onClick={() => setSingleConfirmTour(tour)}
                                >
                                  {t("handOverButton")}
                                </button>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>

                      {toursNoDebt.length > 0 ? (
                        <details className="mb-4 rounded-lg bg-[var(--surface-soft)] px-2 py-2 text-[11px] ring-1 ring-[var(--border)]">
                          <summary className="cursor-pointer font-medium text-[var(--muted)]">
                            {t("toursNoDebtSummary", { n: toursNoDebt.length })}
                          </summary>
                          <ul className="mt-2 space-y-1 text-[10px] text-[var(--muted)]">
                            {toursNoDebt.map((tour) => (
                              <li key={tour.tourId} className="flex justify-between gap-2 tabular-nums">
                                <span className="truncate">
                                  {tour.tourName} · {formatYmdWithWeekdayRu(tour.tourDate)}
                                </span>
                                {tour.pendingGuideTopupOnTourVnd > 0 ? (
                                  <span className="shrink-0 text-sky-800 dark:text-sky-200">
                                    {t("withGuide", { amount: formatVnd(tour.pendingGuideTopupOnTourVnd) })}
                                  </span>
                                ) : (
                                  <span className="shrink-0">0 đ</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <div className="space-y-3 border-t border-[var(--border)] pt-3">
                        {!cashVndChannelId ? (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:text-amber-200 dark:ring-amber-800/50">
                            {t("noChannelsCannotAccept")}
                          </p>
                        ) : null}
                        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                          {t("commentAppendedToNote")}
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            disabled={busy}
                          />
                        </label>
                        <p className="text-[11px] text-[var(--muted)]">
                          {t("usdPartSeparateHint")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || !cashVndChannelId || toursWithDebt.length === 0}
                            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            onClick={() => setBatchConfirmOpen(true)}
                          >
                            {t("handOverAllWithDebt")}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {singleConfirmTour && ctx && selectedManagerId ? (
            <SingleTourHandoverConfirm
              key={singleConfirmTour.tourId}
              tour={singleConfirmTour}
              cashVndChannelId={cashVndChannelId}
              cashUsdChannelId={cashUsdChannelId}
              busy={busy}
              note={note}
              onNoteChange={setNote}
              onCancel={() => setSingleConfirmTour(null)}
              onConfirm={(posts) => void runSingleTourPosts(singleConfirmTour, posts)}
            />
          ) : null}

          {batchConfirmOpen && ctx && selectedManagerId && allTours ? (
            <BatchHandoverConfirm
              targets={toursWithDebt}
              cashVndChannelId={cashVndChannelId}
              note={note}
              busy={busy}
              onCancel={() => setBatchConfirmOpen(false)}
              onConfirm={() => void runBatchHandovers(toursWithDebt)}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SingleTourHandoverConfirm({
  tour,
  cashVndChannelId,
  cashUsdChannelId,
  busy,
  note,
  onNoteChange,
  onCancel,
  onConfirm,
}: {
  tour: ManagerCashHandoverTourRow;
  cashVndChannelId: string;
  cashUsdChannelId: string;
  busy: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: (posts: { channelId: string; amountVnd: number; amountUsd?: number }[]) => void;
}) {
  const t = useTranslations("managerCashModal");
  const tCashHandover = useTranslations("cashHandover");
  const tCash = useTranslations("cash");
  const tCommon = useTranslations("common");
  const cap = tour.outstandingOnTourVnd;
  // Сброс при смене тура обеспечивает key={tour.tourId} у родителя — компонент перемонтируется.
  const [vnd, setVnd] = useState(() => formatVndInput(cap));
  const [usdOpen, setUsdOpen] = useState(false);
  const [usd, setUsd] = useState("");

  const n = parseVnd(vnd);
  const usdN = parseUsdInput(usd);

  function submit() {
    if (n <= 0) {
      alert(tCashHandover("enterAmountInDong"));
      return;
    }
    if (n > cap) {
      alert(t("amountExceedsTourDebt", { amount: formatVnd(n), cap: formatVnd(cap) }));
      return;
    }
    if (usdOpen && (!usdN || usdN <= 0)) {
      alert(t("enterUsdOrRemove"));
      return;
    }
    const channelId = usdOpen ? cashUsdChannelId : cashVndChannelId;
    if (!channelId) {
      alert(t("noIncomeChannelsHint"));
      return;
    }
    onConfirm([{ channelId, amountVnd: n, amountUsd: usdOpen ? usdN : undefined }]);
  }

  return (
    <div className="absolute inset-0 z-[5] flex flex-col rounded-[inherit] bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{t("reviewBeforeRecording")}</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {tour.tourName} · {formatYmdWithWeekdayRu(tour.tourDate)}
        </p>
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950/35">
          <div className="text-[11px] font-medium text-[var(--muted2)]">{t("debtOnThisTour")}</div>
          <div className="text-xl font-bold tabular-nums text-amber-950 dark:text-amber-100">{formatVnd(cap)}</div>
          {tour.pendingGuideTopupOnTourVnd > 0 ? (
            <p className="mt-1 text-[10px] text-sky-900 dark:text-sky-200">
              {t("separatelyWithGuide", { amount: formatVnd(tour.pendingGuideTopupOnTourVnd) })}
            </p>
          ) : null}
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <label className="flex flex-col gap-1 font-medium text-[var(--muted)]">
            {tCashHandover("amountVndPlaceholder")}
            <input
              value={vnd}
              onChange={(e) => {
                const x = e.target.value.replace(/\D/g, "");
                setVnd(x ? formatVndInput(Number(x)) : "");
              }}
              inputMode="numeric"
              className="field-surface rounded-lg px-2 py-1.5 text-sm tabular-nums"
              disabled={busy}
            />
          </label>

          {usdOpen ? (
            <div className="rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">{t("usdPart")}</span>
                <button
                  type="button"
                  onClick={() => { setUsdOpen(false); setUsd(""); }}
                  disabled={busy}
                  className="text-[var(--accent)] hover:underline"
                >
                  {t("removeBtn")}
                </button>
              </div>
              <label className="mt-2 flex flex-col gap-1 font-medium text-[var(--muted)]">
                {t("amountUsdLabel")}
                <input
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  inputMode="decimal"
                  placeholder={t("forExamplePlaceholder")}
                  className="field-surface rounded-lg px-2 py-1.5 text-sm tabular-nums"
                  disabled={busy}
                />
              </label>
            </div>
          ) : cashUsdChannelId ? (
            <button
              type="button"
              onClick={() => setUsdOpen(true)}
              disabled={busy}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {t("addUsdPart")}
            </button>
          ) : null}

          <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-[11px] ring-1 ring-[var(--border)]">
            <span className="text-[var(--muted2)]">{t("totalToRecord")} </span>
            <span className="font-bold tabular-nums text-[var(--text)]">{formatVnd(n)}</span>
            {usdOpen && usdN > 0 ? (
              <span className="ml-2 font-semibold tabular-nums text-[var(--text)]">+ {formatUsd(usdN)}</span>
            ) : null}
          </div>

          <label className="flex flex-col gap-1 font-medium text-[var(--muted)]">
            {tCash("comment")}
            <input
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              className="field-surface rounded-lg px-2 py-1.5 text-sm"
              disabled={busy}
            />
          </label>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
          onClick={onCancel}
        >
          {tCommon("cancel")}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={submit}
        >
          {busy ? tCashHandover("recordingEllipsis") : t("recordToCash")}
        </button>
      </div>
    </div>
  );
}

function BatchHandoverConfirm({
  targets,
  cashVndChannelId,
  note,
  busy,
  onCancel,
  onConfirm,
}: {
  targets: ManagerCashHandoverTourRow[];
  cashVndChannelId: string;
  note: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("managerCashModal");
  const tCashHandover = useTranslations("cashHandover");
  const tCommon = useTranslations("common");
  const total = targets.reduce((s, tour) => s + tour.outstandingOnTourVnd, 0);
  return (
    <div className="absolute inset-0 z-[5] flex flex-col rounded-[inherit] bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{t("batchConfirmTitle")}</h3>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {t("batchWillCreatePrefix")} <strong>{targets.length}</strong> {t("batchWillCreateSuffix")}
        </p>
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto overscroll-contain text-[11px]">
          {targets.map((tour) => (
            <li key={tour.tourId} className="flex justify-between gap-2 tabular-nums">
              <span className="min-w-0 truncate text-[var(--text)]">
                {tour.tourName} · {formatYmdWithWeekdayRu(tour.tourDate)}
              </span>
              <span className="shrink-0 font-semibold">{formatVnd(tour.outstandingOnTourVnd)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/35">
          <div className="text-[11px] text-[var(--muted2)]">{t("totalDongsInRecords")}</div>
          <div className="text-lg font-bold tabular-nums text-amber-950 dark:text-amber-100">{formatVnd(total)}</div>
        </div>
        {note.trim() ? (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            {t("commentColon")} <span className="text-[var(--text)]">{note.trim()}</span>
          </p>
        ) : null}
        {!cashVndChannelId ? <p className="mt-2 text-xs text-red-600">{t("noIncomeChannelsShort")}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
          onClick={onCancel}
        >
          {tCommon("cancel")}
        </button>
        <button
          type="button"
          disabled={busy || !cashVndChannelId}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={onConfirm}
        >
          {busy ? tCashHandover("recordingEllipsis") : t("recordHandoversCount", { n: targets.length })}
        </button>
      </div>
    </div>
  );
}
