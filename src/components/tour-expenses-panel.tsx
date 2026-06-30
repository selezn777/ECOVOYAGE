"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, TourExpense } from "@/lib/types";
import type { TourTemplateLocation } from "@/lib/tour-description-share";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { formatIsoLocalWithWeekdayRu, ymdFromIsoInTimeZone } from "@/lib/scheduling";
import { receiptFileToJpegDataUrl } from "@/lib/receipt-image-compress";
import {
  buildExpenseDescriptionRuFromOcr,
  formatExpenseDescriptionForDisplay,
  looksLikeOcrGarbageLine,
} from "@/lib/receipt-expense-description-ru";
import {
  extractReceiptDatesYmd,
  extractYmdFromFilename,
  guessVndAmountFromOcrText,
  receiptDateMismatchAgainstTour,
} from "@/lib/receipt-ocr-parse";
import { ExpenseAttachmentOpener } from "@/components/expense-attachment-opener";
import { showConfirm } from "@/lib/ui-dialog";

const CAT_LABEL: Record<TourExpense["category"], string> = {
  guide: "Гид",
  bus: "Автобус",
  salary: "Зарплата",
  other: "Прочее",
};

function catLabel(category: TourExpense["category"], viewerRole?: Role): string {
  if (category === "guide" && (viewerRole === "booking_dispatcher" || viewerRole === "dispatcher")) return "Букинг";
  return CAT_LABEL[category];
}

/** Несовпадение дат / метаданных чека (без учёта очереди подтверждения). */
function expenseDateOrMetadataMismatch(r: TourExpense, tourDateYmd: string | undefined): boolean {
  if (!tourDateYmd) return false;
  if (receiptDateMismatchAgainstTour(tourDateYmd, r.description)) return true;
  if (r.category === "guide") {
    const vnYmd = ymdFromIsoInTimeZone(r.createdAt, "Asia/Ho_Chi_Minh");
    if (vnYmd && vnYmd !== tourDateYmd) return true;
  }
  return false;
}

/** Для бухгалтерии / руководства: очередь подтверждения + несовпадение дат. Для остальных - только явные несовпадения дат. */
function expenseRowHighlight(r: TourExpense, tourDateYmd: string | undefined, reviewerView: boolean): boolean {
  if (reviewerView && r.pendingAccountantReview) return true;
  return expenseDateOrMetadataMismatch(r, tourDateYmd);
}

const MAX_PICK_BYTES = 12 * 1024 * 1024;

/** Количество людей / билетов для формы букинга (0-50). */
const PAX_COUNT_OPTIONS = Array.from({ length: 51 }, (_, i) => i);

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

function ymdToDdMmYyyy(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Компактная последовательная форма расхода по точкам тура:
 * 1) тап по точке из списка шаблона (или «Другое» для свободного текста),
 * 2) сумма + фото чека,
 * 3) сохранить. После сохранения форма сворачивается обратно к выбору точки.
 */
function LocationExpensePicker({
  locations,
  tourId,
  tourDateYmd,
  guideBlocked,
  locationTotals,
  onSaved,
}: {
  locations: TourTemplateLocation[];
  tourId: string;
  tourDateYmd?: string;
  guideBlocked: boolean;
  locationTotals: Map<string, number>;
  onSaved: () => void;
}) {
  const inputId = `tour-loc-receipt-${tourId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customDesc, setCustomDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setSelected(null);
    setCustomMode(false);
    setCustomDesc("");
    setAmount("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pick(name: string | null) {
    if (name === null) {
      if (customMode) { reset(); return; }
      setCustomMode(true);
      setSelected(null);
    } else {
      if (selected === name) { reset(); return; }
      setSelected(name);
      setCustomMode(false);
    }
    setAmount("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const description = customMode ? customDesc.trim() : (selected ?? "");
  const vnd = parseVndInput(amount);
  const canSave = !busy && !guideBlocked && vnd >= 1 && description.length > 0;

  async function submit() {
    if (!canSave || submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (file) {
        if (file.size > MAX_PICK_BYTES) { alert("Фото больше 12 МБ"); return; }
        try { attachmentDataUrl = await receiptFileToJpegDataUrl(file); }
        catch { alert("Не удалось обработать фото"); return; }
      }
      const fromFilename = file?.name ? extractYmdFromFilename(file.name) : null;
      const dateMismatch = Boolean(tourDateYmd && fromFilename && fromFilename !== tourDateYmd);
      const res = await fetch(`/api/tours/${tourId}/guide-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd: vnd,
          description,
          ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
          ...(dateMismatch ? { pendingAccountantReview: true } : {}),
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const j = ct.includes("application/json")
        ? ((await res.json().catch(() => ({}))) as { error?: string })
        : ({} as { error?: string });
      if (!res.ok) { alert(j.error || "Не удалось сохранить"); return; }
      reset();
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения");
    } finally {
      setBusy(false);
      submitRef.current = false;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {locations.map((loc) => {
          const sum = locationTotals.get(loc.name) ?? 0;
          const isSelected = selected === loc.name;
          return (
            <button
              key={loc.name}
              type="button"
              onClick={() => pick(loc.name)}
              disabled={guideBlocked}
              className={`rounded-full px-3 py-2 text-[13px] font-medium ring-1 transition-colors disabled:opacity-50 ${
                isSelected
                  ? "btn-primary ring-transparent"
                  : sum > 0
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800"
                    : "bg-[var(--surface)] text-[var(--text)] ring-[var(--border)]"
              }`}
            >
              {loc.name}
              {sum > 0 ? <span className="ml-1 opacity-70">· {formatVnd(sum)}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={guideBlocked}
          className={`rounded-full px-3 py-2 text-[13px] font-medium ring-1 transition-colors disabled:opacity-50 ${
            customMode ? "btn-primary ring-transparent" : "bg-[var(--surface)] text-[var(--text)] ring-[var(--border)]"
          }`}
        >
          Другое
        </button>
      </div>

      {selected !== null || customMode ? (
        <div className="space-y-2 rounded-xl bg-[var(--surface)] p-2.5 ring-1 ring-[var(--border)]">
          {customMode ? (
            <input
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="За что (например: обед, такси)"
              aria-label="За что"
              disabled={busy || guideBlocked}
              autoFocus
            />
          ) : (
            <div className="truncate text-sm font-medium text-[var(--text)]" title={selected ?? ""}>
              {selected}
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatVndInput(parseVndInput(e.target.value)))}
              placeholder="Сумма, ₫"
              className="field-surface flex-1 rounded-xl px-3 py-2 text-sm tabular-nums"
              disabled={busy || guideBlocked}
              autoFocus={!customMode}
            />
            <label
              htmlFor={inputId}
              className={`flex h-[40px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-xl text-base ring-1 transition-colors ${
                file
                  ? "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700"
                  : "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)]"
              } ${busy || guideBlocked ? "pointer-events-none opacity-50" : ""}`}
              aria-label="Фото чека"
            >
              {file ? "✓" : "📷"}
            </label>
            <input
              ref={fileRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              className="fixed left-[-9999px] top-0 h-px w-px opacity-0"
              disabled={busy || guideBlocked}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
          </div>
          {preview ? (
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="h-8 w-8 rounded object-cover ring-1 ring-[var(--border)]" />
              <button type="button" className="text-[11px] text-[var(--muted)] underline" onClick={() => setFile(null)} disabled={busy}>
                Убрать
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
              disabled={busy}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSave}
              className="btn-primary flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? "…" : "Сохранить"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TourExpensesPanel({
  tourId,
  tourDateYmd,
  initial,
  guideCanSubmit = false,
  guideUserId,
  canConfirmAccountantReview = false,
  viewerRole,
  tourLocations,
}: {
  tourId: string;
  /** YYYY-MM-DD - для сравнения с датой на чеке */
  tourDateYmd?: string;
  initial: TourExpense[];
  guideCanSubmit?: boolean;
  /** Кто сейчас вошёл - чтобы гиду разрешить правку своих расходов */
  guideUserId?: string;
  /** Бухгалтерия / руководство: подтвердить строку и снять «в обработке» */
  canConfirmAccountantReview?: boolean;
  /** Роль сессии: гид на туре видит только свои расходы (категория «Гид»), без автобуса/прочего учёта */
  viewerRole?: Role;
  /** Локации тура из шаблона — для выбора в форме расхода */
  tourLocations?: TourTemplateLocation[];
}) {
  const router = useRouter();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const receiptInputId = `tour-receipt-${tourId}`;
  const editReceiptInputId = `tour-receipt-edit-${tourId}`;
  const [rows, setRows] = useState<TourExpense[]>(initial);
  const [amountStr, setAmountStr] = useState("");

  const filteredLocations = useMemo(() => {
    if (!tourLocations) return [];
    if (!viewerRole) return tourLocations;
    const isGuide = viewerRole === "guide" || viewerRole === "chief_guide";
    const isDispatcher = viewerRole === "dispatcher" || viewerRole === "booking_dispatcher";
    return tourLocations.filter((l) => {
      if (!l.paidBy) return true;
      if (isGuide) return l.paidBy === "guide";
      if (isDispatcher) return l.paidBy === "office";
      return true;
    });
  }, [tourLocations, viewerRole]);

  /** Все точки тура (без фильтра по paidBy) - для выбора «точки» в свободной форме расхода. */
  const allLocationNames = useMemo(() => {
    const names = (tourLocations ?? []).map((l) => l.name.trim()).filter(Boolean);
    return Array.from(new Set(names));
  }, [tourLocations]);

  const [desc, setDesc] = useState(filteredLocations[0]?.name ?? "");
  const [visitorAdults, setVisitorAdults] = useState(0);
  const [visitorChildren, setVisitorChildren] = useState(0);
  const [paidTicketsCount, setPaidTicketsCount] = useState(0);
  const [paidBy, setPaidBy] = useState<"" | "guide" | "office">("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlightRef = useRef(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  /** Полный текст OCR (автозаполнение, дата чека vs тур - без показа в UI). */
  const [ocrText, setOcrText] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  /** Список «Учтённые расходы» сворачиваем по умолчанию для гида - сверху всегда видна форма ввода. */
  const [expensesListCollapsed, setExpensesListCollapsed] = useState(
    viewerRole === "guide" || viewerRole === "chief_guide",
  );

  // Редактирование уже внесённого расхода гида (для исправления ошибок).
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editAmountStr, setEditAmountStr] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const editReceiptInputRef = useRef<HTMLInputElement>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewModalExpense, setReviewModalExpense] = useState<TourExpense | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewActionBusy, setReviewActionBusy] = useState(false);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    if (!receiptFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(receiptFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  useEffect(() => {
    if (!editReceiptFile) {
      setEditPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(editReceiptFile);
    setEditPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [editReceiptFile]);

  useEffect(() => {
    if (!receiptFile) {
      setOcrText(null);
      setOcrBusy(false);
      return;
    }
    let cancelled = false;
    setOcrBusy(true);
    setOcrText(null);
    void (async () => {
      try {
        const { recognizeReceiptText } = await import("@/lib/receipt-ocr");
        const text = await recognizeReceiptText(receiptFile);
        if (cancelled) return;
        const t = text.trim();
        setOcrText(t || null);
        const guessed = guessVndAmountFromOcrText(t);
        // Одна строка «за что», как без чека (сумма - отдельное поле).
        setDesc((prev) => {
          if (prev.trim()) return prev;
          if (!t) return prev;
          return buildExpenseDescriptionRuFromOcr(t, guessed).slice(0, 500);
        });
        if (guessed != null && guessed >= 1) {
          setAmountStr((prev) => {
            if (parseVndInput(prev) >= 1000) return prev;
            return formatVndInput(guessed);
          });
        }
      } catch {
        if (!cancelled) setOcrText(null);
      } finally {
        if (!cancelled) setOcrBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receiptFile]);

  /** После OCR пользователь может ввести сумму вручную - пересобрать описание, если в поле остался мусор. */
  useEffect(() => {
    if (!ocrText?.trim()) return;
    const typed = parseVndInput(amountStr);
    if (typed < 1000) return;
    setDesc((prev) => {
      const p = prev.trim();
      if (!p || !looksLikeOcrGarbageLine(p)) return prev;
      return buildExpenseDescriptionRuFromOcr(ocrText, typed).slice(0, 500);
    });
  }, [amountStr, ocrText]);

  const displayRows = useMemo(() => {
    if (viewerRole === "dispatcher" || viewerRole === "booking_dispatcher") {
      return rows.filter((r) => r.createdByRole !== "guide" && r.createdByRole !== "chief_guide");
    }
    if (viewerRole === "guide" || viewerRole === "chief_guide") {
      // Гид видит только расходы, которые внёс сам - расходы офиса ему не показываем вообще.
      return rows.filter((r) => r.category === "guide" && r.createdById === guideUserId);
    }
    return rows;
  }, [rows, viewerRole, guideUserId]);

  const total = useMemo(
    () => displayRows.reduce((s, r) => s + (Number(r.amountVnd) || 0), 0),
    [displayRows],
  );

  /** Сколько уже внесено по каждой точке - бейдж на кнопке точки в форме гида. */
  const guideLocationTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of displayRows) {
      if (r.category !== "guide") continue;
      map.set(r.description, (map.get(r.description) ?? 0) + (Number(r.amountVnd) || 0));
    }
    return map;
  }, [displayRows]);

  const guideBlocked = !guideCanSubmit;

  const guideCanEditExisting = guideCanSubmit && Boolean(guideUserId);
  const dispatcherExpenseMode = viewerRole === "dispatcher" || viewerRole === "booking_dispatcher";

  const guessedVndFromOcr = useMemo(() => {
    if (!ocrText?.trim()) return null;
    return guessVndAmountFromOcrText(ocrText);
  }, [ocrText]);

  /** Сумма из поля ввода (если уже ввели) важнее для угадывания объекта при плохом OCR. */
  const amountHintForOcrDesc = useMemo(() => {
    const typed = parseVndInput(amountStr);
    if (typed >= 1000) return typed;
    return guessedVndFromOcr;
  }, [amountStr, guessedVndFromOcr]);

  /** Описание для API: вручную (если не мусор с OCR), иначе короткая строка с OCR, иначе заглушка если есть фото. */
  const resolvedDescription = useMemo(() => {
    if (dispatcherExpenseMode) {
      const objectName = desc.trim();
      if (!objectName) return "";
      if (!paidBy) return "";
      const paidLabel = paidBy === "guide" ? "гид" : "офис";
      return `${objectName} | Взрослых: ${visitorAdults} | Детей: ${visitorChildren} | Оплачено билетов: ${paidTicketsCount} | Оплатил: ${paidLabel}`.slice(
        0,
        500,
      );
    }
    const manual = desc.trim();
    const fromOcr = ocrText?.trim();
    if (manual && (!fromOcr || !looksLikeOcrGarbageLine(manual))) return manual.slice(0, 500);
    if (fromOcr) {
      const short = buildExpenseDescriptionRuFromOcr(fromOcr, amountHintForOcrDesc);
      const ds = extractReceiptDatesYmd(fromOcr);
      const datePart =
        ds.length > 0 ? ` · чек ${ds.slice(0, 2).map(ymdToDdMmYyyy).join(", ")}` : "";
      return (short + datePart).slice(0, 500);
    }
    if (receiptFile) return "Чек (фото)";
    return "";
  }, [
    desc,
    ocrText,
    receiptFile,
    amountHintForOcrDesc,
    dispatcherExpenseMode,
    visitorAdults,
    visitorChildren,
    paidTicketsCount,
    paidBy,
  ]);

  const typedVnd = useMemo(() => parseVndInput(amountStr), [amountStr]);
  const effectiveAmountVnd =
    typedVnd >= 1 ? typedVnd : guessedVndFromOcr != null && guessedVndFromOcr >= 1 ? guessedVndFromOcr : 0;

  const dateMismatch = useMemo(() => {
    if (!tourDateYmd) return false;
    if (receiptDateMismatchAgainstTour(tourDateYmd, ocrText)) return true;
    const fromFile = receiptFile?.name ? extractYmdFromFilename(receiptFile.name) : null;
    return Boolean(fromFile && fromFile !== tourDateYmd);
  }, [tourDateYmd, ocrText, receiptFile]);

  const receiptDatesDdMmYyyy = useMemo(() => {
    const fromOcr = ocrText?.trim() ? extractReceiptDatesYmd(ocrText) : [];
    if (fromOcr.length) return fromOcr.map(ymdToDdMmYyyy);
    const fromFile = receiptFile?.name ? extractYmdFromFilename(receiptFile.name) : null;
    return fromFile ? [ymdToDdMmYyyy(fromFile)] : [];
  }, [ocrText, receiptFile]);

  const canSaveExpense =
    !busy && !guideBlocked && effectiveAmountVnd >= 1 && resolvedDescription.length >= 1;

  async function submitGuideExpense() {
    const amount = effectiveAmountVnd;
    const descriptionFinal = resolvedDescription;
    if (amount < 1 || !descriptionFinal || busy || guideBlocked || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (receiptFile) {
        if (receiptFile.size > MAX_PICK_BYTES) {
          alert("Фото больше 12 МБ - выберите файл поменьше.");
          return;
        }
        try {
          attachmentDataUrl = await receiptFileToJpegDataUrl(receiptFile);
        } catch {
          alert("Не удалось обработать фото. Попробуйте другой снимок (JPEG/PNG) или пересохраните чек в галерее.");
          return;
        }
      }

      const res = await fetch(`/api/tours/${tourId}/guide-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd: amount,
          description: descriptionFinal,
          ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
          ...(dateMismatch ? { pendingAccountantReview: true } : {}),
        }),
      });

      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) {
        j = (await res.json().catch(() => ({}))) as { error?: string };
      } else if (!res.ok) {
        const t = await res.text().catch(() => "");
        alert(t ? `Сервер (${res.status}): ${t.slice(0, 240)}` : `Ошибка сервера ${res.status}`);
        return;
      }

      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось сохранить");
        return;
      }

      setAmountStr("");
      setDesc(filteredLocations[0]?.name ?? "");
      setVisitorAdults(0);
      setVisitorChildren(0);
      setPaidTicketsCount(0);
      setPaidBy("");
      setReceiptFile(null);
      setOcrText(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setBusy(false);
      submitInFlightRef.current = false;
    }
  }

  function beginEditExpense(r: TourExpense) {
    setEditingExpenseId(r.id);
    setEditAmountStr(formatVndInput(r.amountVnd));
    setEditDesc(r.description);
    setEditReceiptFile(null);
    setEditPreviewUrl(null);
    setEditBusy(false);
  }

  function cancelEditExpense() {
    setEditingExpenseId(null);
    setEditAmountStr("");
    setEditDesc("");
    setEditReceiptFile(null);
    setEditPreviewUrl(null);
    setEditBusy(false);
    if (editReceiptInputRef.current) editReceiptInputRef.current.value = "";
  }

  async function submitEditExpense() {
    if (!editingExpenseId) return;
    const amount = parseVndInput(editAmountStr);
    const descriptionFinal = editDesc.trim();
    if (amount < 1 || !descriptionFinal || editBusy) return;

    setEditBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (editReceiptFile) {
        if (editReceiptFile.size > MAX_PICK_BYTES) {
          alert("Фото больше 12 МБ - выберите файл поменьше.");
          return;
        }
        try {
          attachmentDataUrl = await receiptFileToJpegDataUrl(editReceiptFile);
        } catch {
          alert("Не удалось обработать фото. Попробуйте другой снимок.");
          return;
        }
      }

      const pending = tourDateYmd ? receiptDateMismatchAgainstTour(tourDateYmd, descriptionFinal) : false;

      const res = await fetch(`/api/tours/${tourId}/guide-expenses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId: editingExpenseId,
          amountVnd: amount,
          description: descriptionFinal,
          ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
          pendingAccountantReview: pending,
        }),
      });

      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) {
        j = (await res.json().catch(() => ({}))) as { error?: string };
      }
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : `Не удалось сохранить (ошибка ${res.status})`);
        return;
      }

      cancelEditExpense();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setEditBusy(false);
    }
  }

  async function runReviewAction(expenseId: string, action: "approve" | "recheck" | "reset", note?: string) {
    setReviewingId(expenseId);
    setReviewActionBusy(true);
    try {
      const res =
        action === "approve" && !note
          ? await fetch(`/api/expenses/${expenseId}/accountant-review`, { method: "POST" })
          : await fetch(`/api/expenses/${expenseId}/accountant-review`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, note }),
            });
      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : `Не удалось отметить (ошибка ${res.status})`);
        return;
      }
      setReviewModalExpense(null);
      setReviewComment("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setReviewingId(null);
      setReviewActionBusy(false);
    }
  }

  async function submitDeleteExpense() {
    if (!editingExpenseId) return;
    const ok = await showConfirm("Удалить этот расход? После подтверждения бухгалтерией удаление будет недоступно.");
    if (!ok) return;

    setEditBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-expenses`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId: editingExpenseId }),
      });

      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        alert(j.error || `Не удалось удалить (ошибка ${res.status})`);
        return;
      }

      cancelEditExpense();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения с сервером");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div
      id="tour-expenses"
      className="mt-4 border-t border-[var(--border)] pt-4"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setCollapsed((s) => !s);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCollapsed((s) => !s);
        }
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-base font-semibold">Расходы тура</h2>
          <div className="text-sm text-[var(--muted)]">Итого: {formatVnd(total)}</div>
          {canConfirmAccountantReview ? (
            <Link
              href="/accounting"
              className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
            >
              Рабочий стол бухгалтерии
            </Link>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <>
          {guideCanSubmit ? (
            <div className="mt-3 rounded-2xl bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04]">
              {!dispatcherExpenseMode && filteredLocations.length > 0 ? (
                <LocationExpensePicker
                  locations={filteredLocations}
                  tourId={tourId}
                  tourDateYmd={tourDateYmd}
                  guideBlocked={guideBlocked}
                  locationTotals={guideLocationTotals}
                  onSaved={() => router.refresh()}
                />
              ) : (
                /* Single compact row for free-text guide or dispatcher */
                <div className="space-y-2">
                  {allLocationNames.length > 0 ? (
                    <select
                      className="field-surface w-full rounded-xl px-3 py-2.5 text-sm"
                      value={allLocationNames.includes(desc.trim()) ? desc.trim() : ""}
                      onChange={(e) => setDesc(e.target.value)}
                      aria-label="Точка"
                      disabled={busy || guideBlocked}
                    >
                      <option value="">Точка: другое (ввести текст)</option>
                      {allLocationNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    className="field-surface w-full rounded-xl px-3 py-2.5 text-[15px]"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={dispatcherExpenseMode ? "Объект" : "За что (например: обед, такси, входные билеты)"}
                    aria-label={dispatcherExpenseMode ? "Объект" : "За что"}
                    disabled={busy || guideBlocked}
                  />
                  <div className="flex items-stretch gap-2">
                    <input
                      className="field-surface w-[120px] shrink-0 rounded-xl px-3 py-2.5 text-right text-sm tabular-nums"
                      value={amountStr}
                      onChange={(e) => setAmountStr(formatVndInput(parseVndInput(e.target.value)))}
                      inputMode="numeric"
                      placeholder="0 ₫"
                      aria-label="Сумма"
                      disabled={busy || guideBlocked}
                    />
                    <label
                      htmlFor={receiptInputId}
                      className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 transition-colors ${
                        receiptFile
                          ? "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700"
                          : "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      } ${busy || guideBlocked ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <span aria-hidden>{receiptFile ? "✓" : "📷"}</span>
                      <span className="truncate">{receiptFile ? "Чек добавлен" : "Фото чека"}</span>
                    </label>
                  </div>
                  {dispatcherExpenseMode ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-[var(--muted2)]">Взрослых</span>
                          <select
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            value={visitorAdults}
                            onChange={(e) => setVisitorAdults(Number(e.target.value))}
                            aria-label="Взрослых"
                            disabled={busy || guideBlocked}
                          >
                            {PAX_COUNT_OPTIONS.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-[var(--muted2)]">Детей</span>
                          <select
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            value={visitorChildren}
                            onChange={(e) => setVisitorChildren(Number(e.target.value))}
                            aria-label="Детей"
                            disabled={busy || guideBlocked}
                          >
                            {PAX_COUNT_OPTIONS.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-[var(--muted2)]">Оплачено билетов</span>
                          <select
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            value={paidTicketsCount}
                            onChange={(e) => setPaidTicketsCount(Number(e.target.value))}
                            aria-label="Оплачено билетов"
                            disabled={busy || guideBlocked}
                          >
                            {PAX_COUNT_OPTIONS.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-[var(--muted2)]">Кто оплатил</span>
                        <select
                          className="field-surface rounded-xl px-3 py-2 text-sm"
                          value={paidBy}
                          onChange={(e) => setPaidBy(e.target.value as "" | "guide" | "office")}
                          aria-label="Кто оплатил"
                          disabled={busy || guideBlocked}
                        >
                          <option value="">Выберите…</option>
                          <option value="guide">Оплатил гид</option>
                          <option value="office">Оплатил офис</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                  {/* Hidden file input */}
                  <input
                    ref={receiptInputRef}
                    id={receiptInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                    className="fixed left-[-9999px] top-0 h-px w-px opacity-0"
                    disabled={busy || guideBlocked}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setReceiptFile(f);
                    }}
                  />
                  {/* Receipt preview + OCR hint */}
                  {previewUrl ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-[var(--border)]" />
                      {ocrBusy ? <span className="text-[10px] text-[var(--muted)]">Распознаём…</span> : null}
                      <button
                        type="button"
                        className="text-xs text-[var(--muted)] underline underline-offset-2"
                        onClick={() => { setReceiptFile(null); setOcrText(null); if (receiptInputRef.current) receiptInputRef.current.value = ""; }}
                        disabled={busy}
                      >
                        Убрать
                      </button>
                    </div>
                  ) : null}
                  {dateMismatch && tourDateYmd ? (
                    <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800/60">
                      Дата на чеке ({receiptDatesDdMmYyyy.length ? receiptDatesDdMmYyyy.join(", ") : "…"})
                      не совпадает с днём тура ({ymdToDdMmYyyy(tourDateYmd)}). Сохранить можно.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void submitGuideExpense()}
                    disabled={!canSaveExpense}
                    className="btn-primary w-full rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    {busy ? "…" : "Сохранить расход"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={!expensesListCollapsed}
              onClick={() => setExpensesListCollapsed((v) => !v)}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
                Учтённые расходы{displayRows.length > 0 ? ` (${displayRows.length})` : ""}
              </p>
              <span className="text-xs text-[var(--muted2)]">{expensesListCollapsed ? "Показать ▾" : "Скрыть ▴"}</span>
            </button>
            {expensesListCollapsed ? null : displayRows.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Пока нет</p>
            ) : (
              <>
                <ul className="mt-2 space-y-2">
                  {displayRows.map((r) => {
                    const dateOnly = expenseDateOrMetadataMismatch(r, tourDateYmd);
                    const highlight = expenseRowHighlight(r, tourDateYmd, Boolean(canConfirmAccountantReview));
                    const isEditable =
                      guideCanEditExisting &&
                      r.category === "guide" &&
                      guideUserId != null &&
                      r.createdById === guideUserId &&
                      !r.accountantReviewedAt;
                    const isEditing = editingExpenseId === r.id;
                    const editLocked = Boolean(r.accountantReviewedAt);

                    if (isEditing) {
                    const editPending =
                      tourDateYmd ? receiptDateMismatchAgainstTour(tourDateYmd, editDesc.trim()) : false;
                    return (
                      <li
                        key={r.id}
                        className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="font-semibold text-[var(--text)]">Редактирование расхода</div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-xs text-[var(--muted)] underline underline-offset-2"
                              disabled={editBusy}
                              onClick={cancelEditExpense}
                            >
                              Отмена
                            </button>
                            {!editLocked ? (
                              <button
                                type="button"
                                className="text-xs text-red-600 dark:text-red-300 underline underline-offset-2 disabled:opacity-50"
                                disabled={editBusy}
                                onClick={() => void submitDeleteExpense()}
                              >
                                Удалить
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,130px)_1fr]">
                          <input
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            value={editAmountStr}
                            onChange={(e) => setEditAmountStr(formatVndInput(parseVndInput(e.target.value)))}
                            inputMode="numeric"
                            placeholder="800.000"
                            disabled={editBusy || editLocked}
                          />
                          <input
                            className="field-surface rounded-xl px-3 py-2 text-sm"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Локация / описание"
                            aria-label="Описание"
                            disabled={editBusy || editLocked}
                          />
                        </div>

                        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-2.5">
                          <div className="text-xs font-medium text-[var(--muted2)]">Фото чека (замена)</div>
                          <input
                            ref={editReceiptInputRef}
                            id={editReceiptInputId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                            className="fixed left-[-9999px] top-0 h-px w-px opacity-0"
                            disabled={editBusy || editLocked}
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setEditReceiptFile(f);
                            }}
                          />
                          <label
                            htmlFor={editReceiptInputId}
                            className={`mt-1 inline-flex cursor-pointer rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] ${
                              editBusy ? "pointer-events-none opacity-50" : ""
                            }`}
                          >
                            Выбрать новое фото
                          </label>
                          {editReceiptFile ? (
                            <p className="mt-1 truncate text-[11px] text-[var(--muted2)]" title={editReceiptFile.name}>
                              Выбрано: {editReceiptFile.name}
                            </p>
                          ) : r.attachmentUrl ? (
                            <p className="mt-1 text-[11px] text-[var(--muted)]">Есть текущее фото чека</p>
                          ) : (
                            <p className="mt-1 text-[11px] text-[var(--muted)]">Фото не прикреплено</p>
                          )}

                          {editPreviewUrl ? (
                            <div className="mt-2 flex items-start gap-2">
                              <Image
                                src={editPreviewUrl}
                                alt=""
                                width={120}
                                height={80}
                                unoptimized
                                className="h-20 w-auto rounded-lg object-contain ring-1 ring-[var(--border)]"
                              />
                              <button
                                type="button"
                                className="text-xs text-[var(--muted)] underline underline-offset-2"
                                onClick={() => {
                                  setEditReceiptFile(null);
                                  setEditPreviewUrl(null);
                                  if (editReceiptInputRef.current) editReceiptInputRef.current.value = "";
                                }}
                                disabled={editBusy || editLocked}
                              >
                                Убрать
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {editPending && tourDateYmd ? (
                          <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800/60">
                            Дата на чеке/в описании не совпадает с днём тура - строка будет в обработке.

                          </p>
                        ) : null}

                        <button
                          type="button"
                          className="btn-primary w-full disabled:opacity-50 sm:w-auto sm:px-6"
                          disabled={editBusy || editLocked || parseVndInput(editAmountStr) < 1 || !editDesc.trim()}
                          onClick={() => void submitEditExpense()}
                        >
                          {editBusy ? "…" : "Сохранить правку"}
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={r.id}
                      className={
                        "flex flex-col gap-2 rounded-xl p-3 text-sm sm:flex-row sm:items-start sm:justify-between " +
                        (highlight
                          ? "border border-red-200/90 bg-red-50/50 dark:border-red-700/45 dark:bg-[var(--danger-soft)] dark:ring-1 dark:ring-red-900/35"
                          : "border border-[var(--border)] bg-[var(--surface)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]")
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-medium text-[var(--text)]">{formatVnd(r.amountVnd)}</span>
                          {dateOnly ? (
                            <span className="rounded-md bg-red-200/80 px-2 py-0.5 text-[10px] font-semibold text-red-950 dark:border dark:border-amber-700/40 dark:bg-[var(--surface-elevated)] dark:text-[var(--warn)] dark:shadow-sm">
                              Не день тура
                            </span>
                          ) : canConfirmAccountantReview && r.pendingAccountantReview ? (
                            <span className="rounded-md bg-stone-200/90 px-2 py-0.5 text-[10px] font-medium text-stone-800 dark:bg-stone-700/50 dark:text-stone-200">
                              На проверке
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[var(--muted)]">{formatExpenseDescriptionForDisplay(r.description)}</div>
                        {!canConfirmAccountantReview ? (
                          <div className="mt-1 text-xs text-[var(--muted2)]">
                            {catLabel(r.category, viewerRole)} · {formatIsoLocalWithWeekdayRu(r.createdAt)}
                          </div>
                        ) : null}
                        {r.attachmentUrl ? (
                          <ExpenseAttachmentOpener
                            url={r.attachmentUrl}
                            variant="thumb-with-caption"
                            text="Открыть"
                            buttonClassName={
                              "mt-2 inline-flex items-center gap-2 rounded-lg ring-1 " +
                              (dateOnly ? "ring-red-200/80 dark:ring-amber-800/50" : "ring-[var(--border)]")
                            }
                          />
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-stretch gap-2 pt-1 sm:flex-row sm:items-start">
                        {canConfirmAccountantReview ? (
                          <button
                            type="button"
                            className="rounded-lg bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] disabled:opacity-50"
                            disabled={reviewingId === r.id}
                            onClick={() => {
                              setReviewModalExpense(r);
                              setReviewComment(r.accountantReviewNote ?? "");
                            }}
                          >
                            {r.accountantReviewState === "approved"
                              ? "Проверено"
                              : r.accountantReviewState === "recheck"
                                ? "Перепроверить"
                                : "Проверить"}
                          </button>
                        ) : null}
                        {r.accountantReviewedAt ? (
                          <span className="self-start text-[11px] text-[var(--muted2)]">
                            Проверено{" "}
                            {new Date(r.accountantReviewedAt).toLocaleString("ru-RU", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : null}
                        {isEditable ? (
                          <button
                            type="button"
                            className="rounded-lg bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                            disabled={editBusy}
                            onClick={() => beginEditExpense(r)}
                          >
                            Редактировать
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
        </>
      ) : null}

      {reviewModalExpense ? (
        <div
          className="ui-scrim fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Проверка расхода"
          onClick={(e) => {
            if (e.target === e.currentTarget && !reviewActionBusy) setReviewModalExpense(null);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-[var(--surface)] p-4 shadow-xl ring-1 ring-[var(--border)]">
            <p className="text-base font-semibold text-[var(--text)]">Проверка расхода</p>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="text-[var(--muted)]">Сумма: </span>
                <span className="font-semibold text-[var(--text)]">{formatVnd(reviewModalExpense.amountVnd)}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Категория: </span>
                <span className="text-[var(--text)]">{catLabel(reviewModalExpense.category, viewerRole)}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Когда внесено: </span>
                <span className="text-[var(--text)]">{formatIsoLocalWithWeekdayRu(reviewModalExpense.createdAt)}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Кто внёс: </span>
                <span className="text-[var(--text)]">{reviewModalExpense.createdByName || reviewModalExpense.createdByRole || "—"}</span>
              </div>
              <div>
                <span className="text-[var(--muted)]">Основание: </span>
                <span className="text-[var(--text)]">{formatExpenseDescriptionForDisplay(reviewModalExpense.description)}</span>
              </div>
              {reviewModalExpense.attachmentUrl ? (
                <div className="pt-1">
                  <Image
                    src={reviewModalExpense.attachmentUrl}
                    alt="Чек расхода"
                    width={420}
                    height={280}
                    unoptimized
                    className="max-h-56 rounded-lg border border-[var(--border)] object-contain"
                  />
                  <ExpenseAttachmentOpener url={reviewModalExpense.attachmentUrl} variant="text" text="Открыть фото чека" />
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">Фото чека не приложено.</p>
              )}
              <label className="block pt-1 text-xs">
                <span className="text-[var(--muted)]">Комментарий для проверки / причина перепроверки</span>
                <textarea
                  className="field-surface mt-1 min-h-[84px] w-full rounded-xl px-3 py-2 text-sm"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  disabled={reviewActionBusy}
                  placeholder="Что подтверждено или что нужно исправить"
                />
              </label>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={reviewActionBusy}
                onClick={() => void runReviewAction(reviewModalExpense.id, "approve", reviewComment.trim() || undefined)}
              >
                Подтвердить проверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:text-amber-300"
                disabled={reviewActionBusy}
                onClick={() => void runReviewAction(reviewModalExpense.id, "recheck", reviewComment.trim() || "Нужна перепроверка")}
              >
                Отправить на перепроверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                disabled={reviewActionBusy}
                onClick={() => void runReviewAction(reviewModalExpense.id, "reset", reviewComment.trim() || undefined)}
              >
                Снять проверку
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--muted)] disabled:opacity-50"
                disabled={reviewActionBusy}
                onClick={() => setReviewModalExpense(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
