"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CASH_MANUAL_CURRENCY_OPTIONS, isValidIso4217Code, normalizeCurrencyCode } from "@/lib/cash-manual-currencies";
import type { TourOption } from "@/lib/types";
import { showConfirm } from "@/lib/ui-dialog";

type CashEmployeeOption = { id: string; fullName: string };
type CashRentalPointOption = { id: string; name: string };

type LedgerCategory = { id: string; label: string };

function formatVndDots(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseVnd(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function parseDecimal(raw: string): number {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeSearchText(input: string): string {
  const lower = input.toLowerCase().replace(/ё/g, "е");
  try {
    return lower
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return lower.replace(/[^\w\s\u0400-\u04FF]/gi, " ").replace(/\s+/g, " ").trim();
  }
}

function extractDateFromTourLabel(label: string): number {
  const m = label.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!m) return Number.NEGATIVE_INFINITY;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const dt = new Date(year, month, day);
  return Number.isFinite(dt.getTime()) ? dt.getTime() : Number.NEGATIVE_INFINITY;
}

export function CashManualEntryForm({
  tourOptions,
  employeeOptions,
  rentalPointOptions,
  prefillTitle,
  linkedEmployeeId,
  linkedEmployeeName,
}: {
  tourOptions: TourOption[];
  employeeOptions: CashEmployeeOption[];
  rentalPointOptions: CashRentalPointOption[];
  prefillTitle?: string | null;
  linkedEmployeeId?: string | null;
  linkedEmployeeName?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const receiptFileInputId = useId();
  const [receiptFileName, setReceiptFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [paymentKind, setPaymentKind] = useState<"cash" | "bank_transfer">("cash");
  const [currencySelect, setCurrencySelect] = useState<string>("VND");
  const [otherCurrency, setOtherCurrency] = useState("");
  const [amountText, setAmountText] = useState("");
  const [foreignAmountText, setForeignAmountText] = useState("");
  const [fxRateText, setFxRateText] = useState("");
  const [title, setTitle] = useState(prefillTitle?.trim() ? prefillTitle.trim() : "");
  const [note, setNote] = useState("");
  const [tourId, setTourId] = useState("");
  /** Текст в строке выбора тура (фильтр + отображение выбранной подписи). */
  const [tourQuery, setTourQuery] = useState("");
  const [tourPickerOpen, setTourPickerOpen] = useState(false);
  /** Поступление в кассу офиса по брони (опционально, только приход + тур) */
  const [bookingId, setBookingId] = useState("");
  /** Выбор строки для блока «несколько туристов» (не путать с основной бронью). */
  const [multiPickId, setMultiPickId] = useState("");
  const [officeBookingOptions, setOfficeBookingOptions] = useState<
    { id: string; customerName: string; hotel: string; dueVnd: number; onlineCode?: string }[]
  >([]);
  const [officeBookingPayments, setOfficeBookingPayments] = useState<Record<string, string>>({});
  const [officeBookingsLoading, setOfficeBookingsLoading] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<LedgerCategory[]>([]);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => linkedEmployeeId?.trim() ?? "");
  const [employeeIncomeIncluded, setEmployeeIncomeIncluded] = useState(false);
  const [selectedRentalPointId, setSelectedRentalPointId] = useState("");

  const effectiveCurrency = useMemo(() => {
    if (currencySelect === "__OTHER__") return normalizeCurrencyCode(otherCurrency);
    return currencySelect;
  }, [currencySelect, otherCurrency]);

  const isForeign = effectiveCurrency !== "VND" && isValidIso4217Code(effectiveCurrency);

  const sortedTourOptions = useMemo(() => {
    const withIndex = tourOptions.map((o, idx) => ({ o, idx, dateKey: extractDateFromTourLabel(o.label) }));
    withIndex.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return b.dateKey - a.dateKey;
      return a.idx - b.idx;
    });
    return withIndex.map((x) => x.o);
  }, [tourOptions]);

  const filteredTourOptions = useMemo(() => {
    const selected = tourId.trim();
    const q = normalizeSearchText(tourQuery);
    if (!q) return sortedTourOptions;
    const keys = q.split(" ").filter(Boolean);
    const base = sortedTourOptions.filter((o) => {
      const hay = normalizeSearchText(`${o.label} ${o.id}`);
      return keys.every((k) => hay.includes(k));
    });
    if (!selected || base.some((o) => o.id === selected)) return base;
    const picked = sortedTourOptions.find((o) => o.id === selected);
    return picked ? [picked, ...base.filter((o) => o.id !== picked.id)] : base;
  }, [sortedTourOptions, tourQuery, tourId]);

  const suggestedVnd = useMemo(() => {
    if (!isForeign) return null;
    const f = parseDecimal(foreignAmountText);
    const r = parseVnd(fxRateText);
    if (f > 0 && r > 0) return Math.round(f * r);
    return null;
  }, [isForeign, foreignAmountText, fxRateText]);

  async function loadCategories() {
    try {
      const res = await fetch("/api/cash/manual-ledger/categories");
      const j = (await res.json().catch(() => ({}))) as { categories?: LedgerCategory[] };
      if (res.ok && Array.isArray(j.categories)) {
        setCategories(j.categories);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    const t = prefillTitle?.trim();
    if (t) setTitle(t);
  }, [prefillTitle]);

  useEffect(() => {
    const id = linkedEmployeeId?.trim();
    if (id) {
      setSelectedEmployeeId(id);
      setEmployeeIncomeIncluded(false);
    }
  }, [linkedEmployeeId]);

  useEffect(() => {
    if (currencySelect !== "__OTHER__") setOtherCurrency("");
  }, [currencySelect]);

  useEffect(() => {
    if (direction !== "in" || !tourId.trim()) {
      setOfficeBookingOptions([]);
      setBookingId("");
      setOfficeBookingPayments({});
      return;
    }
    let cancelled = false;
    setOfficeBookingsLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/tours/${encodeURIComponent(tourId.trim())}/cash-office-bookings`);
        const j = (await res.json().catch(() => ({}))) as {
          bookings?: { id: string; customerName: string; hotel: string; dueVnd: number; onlineCode?: string }[];
        };
        if (!cancelled) {
          if (res.ok && Array.isArray(j.bookings)) {
            setOfficeBookingOptions(j.bookings);
          } else {
            setOfficeBookingOptions([]);
          }
        }
      } catch {
        if (!cancelled) setOfficeBookingOptions([]);
      } finally {
        if (!cancelled) setOfficeBookingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, tourId]);

  function applySuggestedVnd() {
    if (suggestedVnd != null && suggestedVnd > 0) {
      setAmountText(formatVndDots(suggestedVnd));
    }
  }

  async function addCategory() {
    const t = newCategoryLabel.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cash/manual-ledger/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: t }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; category?: LedgerCategory };
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось добавить категорию");
        return;
      }
      setNewCategoryLabel("");
      await loadCategories();
      if (j.category?.id) setCategoryId(j.category.id);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string) {
    const ok = await showConfirm("Удалить эту категорию? Записи в журнале останутся, поле категории у них обнулится.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cash/manual-ledger/categories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(typeof j.error === "string" ? j.error : "Ошибка удаления");
        return;
      }
      if (categoryId === id) setCategoryId("");
      await loadCategories();
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountVnd = parseVnd(amountText);
    const bookingPayments = Object.entries(officeBookingPayments)
      .map(([id, text]) => ({ id, amountVnd: parseVnd(text) }))
      .filter((x) => x.amountVnd > 0);
    if (bookingPayments.length === 0 && amountVnd <= 0) {
      alert("Укажите сумму больше нуля или заполните суммы по карточкам туристов.");
      return;
    }
    if (bookingPayments.length > 0) {
      for (const line of bookingPayments) {
        const opt = officeBookingOptions.find((b) => b.id === line.id);
        if (!opt) {
          alert("Одна из выбранных карточек туриста больше не доступна. Обновите форму.");
          return;
        }
        if (line.amountVnd > opt.dueVnd) {
          alert(`${opt.customerName}: сумма не больше долга по карточке (${opt.dueVnd.toLocaleString("ru-RU")} ₫).`);
          return;
        }
      }
    } else if (bookingId.trim() && direction === "in") {
      const opt = officeBookingOptions.find((b) => b.id === bookingId.trim());
      if (opt && amountVnd > opt.dueVnd) {
        alert(`Сумма не больше долга по выбранной брони: ${opt.dueVnd.toLocaleString("ru-RU")} ₫`);
        return;
      }
    }
    const t = title.trim();
    if (t.length < 2) {
      alert("Опишите операцию (от 2 символов).");
      return;
    }
    const code = effectiveCurrency;
    if (!isValidIso4217Code(code)) {
      alert("Выберите валюту из списка или укажите корректный код ISO из 3 латинских букв.");
      return;
    }
    let amountForeign: number | undefined;
    let fxRateToVnd: number | undefined;
    if (code !== "VND") {
      const f = parseDecimal(foreignAmountText);
      const r = parseVnd(fxRateText);
      amountForeign = f;
      fxRateToVnd = r;
      if (f <= 0 || r <= 0) {
        alert("Для валюты не VND укажите сумму в этой валюте и курс: сколько донгов за 1 единицу валюты.");
        return;
      }
    }

    setBusy(true);
    try {
      let attachmentUrl: string | undefined;
      const file = fileRef.current?.files?.[0];
      if (file && file.size > 0) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "cash_manual_ledger");
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        const uj = (await up.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!up.ok) {
          throw new Error(typeof uj.error === "string" ? uj.error : "Не удалось загрузить фото");
        }
        if (typeof uj.url === "string" && uj.url.startsWith("http")) {
          attachmentUrl = uj.url;
        }
      }

      let noteCombined = note.trim();
      const eid = selectedEmployeeId.trim();
      if (eid) {
        const en =
          employeeOptions.find((x) => x.id === eid)?.fullName?.trim() || linkedEmployeeName?.trim();
        const tag = en ? `Сотрудник: ${en} (${eid})` : `Сотрудник (ID): ${eid}`;
        if (!noteCombined.includes(eid)) {
          noteCombined = noteCombined ? `${noteCombined}\n${tag}` : tag;
        }
      }

      const rid = selectedRentalPointId.trim();
      if (rid) {
        const pn = rentalPointOptions.find((x) => x.id === rid)?.name?.trim();
        const tag = pn ? `Арендная точка: ${pn} (${rid})` : `Арендная точка (ID): ${rid}`;
        if (!noteCombined.includes(rid)) {
          noteCombined = noteCombined ? `${noteCombined}\n${tag}` : tag;
        }
      }

      const payloadBase: Record<string, unknown> = {
        direction,
        title: t,
        note: noteCombined || undefined,
        attachmentUrl,
        currencyCode: code,
        paymentKind,
        ...(tourId.trim() ? { tourId: tourId.trim() } : {}),
        ...(categoryId.trim() ? { categoryId: categoryId.trim() } : {}),
        ...(eid ? { employeeId: eid, employeeIncomeIncluded } : {}),
        ...(rid ? { rentalPointId: rid } : {}),
      };
      if (code !== "VND") {
        payloadBase.amountForeign = amountForeign;
        payloadBase.fxRateToVnd = fxRateToVnd;
      }
      const submitOne = async (payload: Record<string, unknown>) => {
        const res = await fetch("/api/cash/manual-ledger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string | { formErrors?: string[] } };
        if (!res.ok) {
          const msg =
            typeof j.error === "string"
              ? j.error
              : typeof j.error === "object" && j.error && "formErrors" in j.error && Array.isArray(j.error.formErrors)
                ? j.error.formErrors.join(" ")
                : "Не удалось сохранить";
          throw new Error(msg);
        }
      };
      if (bookingPayments.length > 0 && direction === "in") {
        for (const line of bookingPayments) {
          const opt = officeBookingOptions.find((b) => b.id === line.id);
          const touristTag = opt ? `Турист: ${opt.customerName}` : "Турист";
          await submitOne({
            ...payloadBase,
            amountVnd: line.amountVnd,
            bookingId: line.id,
            note: noteCombined ? `${noteCombined}\n${touristTag}` : touristTag,
          });
        }
      } else {
        await submitOne({
          ...payloadBase,
          amountVnd,
          ...(bookingId.trim() && direction === "in" ? { bookingId: bookingId.trim() } : {}),
        });
      }
      setAmountText("");
      setForeignAmountText("");
      setFxRateText("");
      setCurrencySelect("VND");
      setPaymentKind("cash");
      setTitle("");
      setNote("");
      setTourId("");
      setBookingId("");
      setMultiPickId("");
      setOfficeBookingPayments({});
      setCategoryId("");
      setSelectedEmployeeId("");
      setEmployeeIncomeIncluded(false);
      setSelectedRentalPointId("");
      if (fileRef.current) fileRef.current.value = "";
      setReceiptFileName("");
      router.replace("/cash");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]";
  const fieldClass = "field-surface w-full rounded-xl px-3 py-2.5 text-sm";

  return (
    <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text)]">Добавить операцию</h2>

        <div
          className="mt-4 grid min-w-0 grid-cols-2 gap-2"
          role="group"
          aria-label="Направление движения и форма расчёта"
        >
              <button
                type="button"
                disabled={busy}
                aria-pressed={direction === "in"}
                aria-label="В кассу"
                onClick={() => setDirection("in")}
                className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-base font-bold tracking-tight transition-colors active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 sm:min-h-[52px] ${
                  direction === "in"
                    ? "border-emerald-400/80 bg-emerald-500 text-white shadow-[var(--shadow-sm)] dark:border-emerald-500/70 dark:bg-emerald-600"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25"
                }`}
              >
                В кассу
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={direction === "out"}
                aria-label="Из кассы"
                onClick={() => setDirection("out")}
                className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-base font-bold tracking-tight transition-colors active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 sm:min-h-[52px] ${
                  direction === "out"
                    ? "border-rose-400/80 bg-rose-500 text-white shadow-[var(--shadow-sm)] dark:border-rose-500/70 dark:bg-rose-600"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-rose-50/50 dark:hover:bg-rose-950/25"
                }`}
              >
                Из кассы
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={paymentKind === "cash"}
                aria-label="Наличные в кассе"
                onClick={() => setPaymentKind("cash")}
                className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-base font-bold tracking-tight transition-colors active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 sm:min-h-[52px] ${
                  paymentKind === "cash"
                    ? "border-amber-400/80 bg-amber-500 text-white shadow-[var(--shadow-sm)] dark:border-amber-500/70 dark:bg-amber-600"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-amber-50/55 dark:hover:bg-amber-950/20"
                }`}
              >
                Наличные
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={paymentKind === "bank_transfer"}
                aria-label="Безнал, банк"
                onClick={() => setPaymentKind("bank_transfer")}
                className={`flex min-h-[48px] w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-base font-bold tracking-tight transition-colors active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 sm:min-h-[52px] ${
                  paymentKind === "bank_transfer"
                    ? "border-sky-400/80 bg-sky-500 text-white shadow-[var(--shadow-sm)] dark:border-sky-500/70 dark:bg-sky-600"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-sky-50/60 dark:hover:bg-sky-950/25"
                }`}
              >
                Банк
              </button>
          </div>

          <div className="space-y-4">
            <div className={labelClass}>Сумма и валюта</div>

            <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col">
              <span className={labelClass}>Валюта</span>
              <select
                value={currencySelect}
                onChange={(e) => setCurrencySelect(e.target.value)}
                className={fieldClass}
                disabled={busy}
              >
                {CASH_MANUAL_CURRENCY_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
                <option value="__OTHER__">Другая (код ISO)…</option>
              </select>
            </label>
            {currencySelect === "__OTHER__" ? (
              <label className="flex flex-col">
                <span className={labelClass}>Код ISO (3 буквы)</span>
                <input
                  value={otherCurrency}
                  onChange={(e) => setOtherCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                  maxLength={3}
                  placeholder="EUR"
                  className={`${fieldClass} font-mono uppercase`}
                  disabled={busy}
                />
              </label>
            ) : (
              <div className="hidden sm:block" aria-hidden />
            )}
            </div>

            <label className="block">
            <span className={labelClass}>Сумма в кассе, ₫</span>
            <input
              value={amountText}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (!v) {
                  setAmountText("");
                  return;
                }
                const n = Number(v);
                setAmountText(
                  Number.isFinite(n)
                    ? Math.floor(n)
                        .toString()
                        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                    : "",
                );
              }}
              inputMode="numeric"
              placeholder="0"
              className={`${fieldClass} py-3 text-base font-semibold tabular-nums sm:text-lg`}
              disabled={busy}
            />
            <span className="mt-1 block text-[11px] text-[var(--muted)]">
              В балансе кассы учитывается только эта сумма в ₫. При валюте ≠ ₫ заполните блок ниже для справки и сверки.
            </span>
            </label>

            {isForeign ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col">
                <span className={labelClass}>Сумма в {effectiveCurrency}</span>
                <input
                  value={foreignAmountText}
                  onChange={(e) => setForeignAmountText(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className={`${fieldClass} tabular-nums`}
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col">
                <span className={labelClass}>Курс: 1 {effectiveCurrency} = ? ₫</span>
                <input
                  value={fxRateText}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setFxRateText(digits ? formatVndDots(Number(digits)) : "");
                  }}
                  inputMode="decimal"
                  placeholder="например 26000"
                  className={`${fieldClass} tabular-nums`}
                  disabled={busy}
                />
              </label>
              <div className="action-row sm:col-span-2">
                <button
                  type="button"
                  disabled={busy || suggestedVnd == null}
                  onClick={() => applySuggestedVnd()}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium text-[var(--text)] disabled:opacity-40"
                >
                  Подставить ₫ по курсу
                </button>
                {suggestedVnd != null ? (
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    ≈ {formatVndDots(suggestedVnd)} ₫ по введённым сумме и курсу
                  </span>
                ) : null}
              </div>
            </div>
            ) : null}

          <div className="grid gap-2">
            <label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Описание"
                className={fieldClass}
                disabled={busy}
              />
            </label>
            <label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder="Комментарий"
                className={fieldClass}
                disabled={busy}
              />
            </label>
          </div>

          <div className="space-y-3 border-t border-[var(--border)]/70 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Тур и зачёт долга по брони</p>

            <div>
              <span className={labelClass}>Тур</span>
              <div className="relative">
                <input
                  value={tourQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTourQuery(v);
                    setTourPickerOpen(true);
                    const sel = sortedTourOptions.find((o) => o.id === tourId);
                    if (sel && normalizeSearchText(v) !== normalizeSearchText(sel.label)) {
                      setTourId("");
                      setBookingId("");
                      setMultiPickId("");
                      setOfficeBookingPayments({});
                    }
                  }}
                  onFocus={() => setTourPickerOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setTourPickerOpen(false), 200);
                  }}
                  className={fieldClass}
                  placeholder="Название или дата…"
                  disabled={busy || sortedTourOptions.length === 0}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={tourPickerOpen}
                />
                {tourPickerOpen && !busy && sortedTourOptions.length > 0 ? (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 z-[60] mt-1 max-h-60 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)] ring-1 ring-black/10 dark:ring-white/10"
                  >
                    <li role="option">
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTourId("");
                          setTourQuery("");
                          setBookingId("");
                          setMultiPickId("");
                          setOfficeBookingPayments({});
                          setTourPickerOpen(false);
                        }}
                      >
                        Без тура
                      </button>
                    </li>
                    {filteredTourOptions.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-[var(--muted)]">Ничего не найдено.</li>
                    ) : (
                      filteredTourOptions.map((o) => (
                        <li key={o.id} role="option">
                          <button
                            type="button"
                            className="w-full px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--accent-soft)]"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setTourId(o.id);
                              setTourQuery(o.label);
                              setBookingId("");
                              setMultiPickId("");
                              setOfficeBookingPayments({});
                              setTourPickerOpen(false);
                            }}
                          >
                            {o.label}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              {sortedTourOptions.length === 0 ? <p className="mt-1.5 text-xs text-[var(--muted)]">Туры не загружены.</p> : null}
            </div>

            {direction === "in" && tourId.trim() ? (
              <div className="space-y-2">
                <label className="block">
                  <span className={labelClass}>Бронь (списать долг туриста)</span>
                  <select
                    value={bookingId}
                    onChange={(e) => {
                      setBookingId(e.target.value);
                      setOfficeBookingPayments({});
                      setMultiPickId("");
                    }}
                    className={fieldClass}
                    disabled={busy || officeBookingsLoading}
                  >
                    <option value="">
                      {officeBookingsLoading
                        ? "Загрузка…"
                        : officeBookingOptions.length === 0
                          ? "Нет долга по броням"
                          : "Только тур в журнале, без списания долга"}
                    </option>
                    {officeBookingOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.customerName}
                        {b.hotel ? ` · ${b.hotel}` : ""}
                        {b.onlineCode ? ` · ${b.onlineCode}` : ""} — долг {b.dueVnd.toLocaleString("ru-RU")} ₫
                      </option>
                    ))}
                  </select>
                </label>
                {bookingId.trim() && Object.keys(officeBookingPayments).length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">
                    Укажите сумму в поле «Сумма в кассе, ₫» выше — при записи долг по этой брони уменьшится (как оплата в кассу офиса).
                  </p>
                ) : null}

                <details className="rounded-lg border border-[var(--border)]/60 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--muted)]">
                    Несколько туристов за раз
                  </summary>
                  <div className="space-y-2 border-t border-[var(--border)]/50 px-3 py-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1">
                        <span className={labelClass}>Добавить бронь</span>
                        <select
                          value={multiPickId}
                          onChange={(e) => setMultiPickId(e.target.value)}
                          className={fieldClass}
                          disabled={busy || officeBookingsLoading}
                        >
                          <option value="">Кого добавить</option>
                          {officeBookingOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.customerName} — {b.dueVnd.toLocaleString("ru-RU")} ₫
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy || !multiPickId.trim()}
                        className="btn-secondary min-h-[42px] shrink-0 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                        onClick={() => {
                          const id = multiPickId.trim();
                          if (!id) return;
                          const max = officeBookingOptions.find((x) => x.id === id)?.dueVnd ?? 0;
                          setOfficeBookingPayments((prev) => ({ ...prev, [id]: prev[id] ?? (max > 0 ? formatVndDots(max) : "") }));
                          setBookingId("");
                          setMultiPickId("");
                        }}
                      >
                        В список
                      </button>
                    </div>
                    {Object.keys(officeBookingPayments).length > 0 ? (
                      <ul className="space-y-2">
                        {Object.entries(officeBookingPayments).map(([id, text]) => {
                          const row = officeBookingOptions.find((x) => x.id === id);
                          if (!row) return null;
                          return (
                            <li key={id} className="rounded-lg bg-[var(--surface-soft)]/70 px-2 py-2">
                              <div className="text-xs font-medium text-[var(--text)]">
                                {row.customerName} · долг {row.dueVnd.toLocaleString("ru-RU")} ₫
                              </div>
                              <div className="mt-1 flex flex-wrap items-end gap-2">
                                <label className="min-w-[8rem] flex-1">
                                  <span className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--muted2)]">₫</span>
                                  <input
                                    value={text}
                                    onChange={(e) => {
                                      const digits = e.target.value.replace(/\D/g, "");
                                      setOfficeBookingPayments((prev) => ({
                                        ...prev,
                                        [id]: digits ? formatVndDots(Number(digits)) : "",
                                      }));
                                    }}
                                    inputMode="numeric"
                                    className="field-surface w-full rounded-lg px-2 py-1.5 text-xs tabular-nums"
                                    disabled={busy}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="btn-secondary !min-h-[32px] !px-2.5 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    setOfficeBookingPayments((prev) => ({
                                      ...prev,
                                      [id]: formatVndDots(row.dueVnd),
                                    }))
                                  }
                                >
                                  Весь долг
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary !min-h-[32px] !px-2.5 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    setOfficeBookingPayments((prev) => {
                                      const next = { ...prev };
                                      delete next[id];
                                      return next;
                                    })
                                  }
                                >
                                  Убрать
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </details>
              </div>
            ) : null}

            <details className="rounded-lg border border-[var(--border)]/60 [&_summary::-webkit-details-marker]:hidden">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--muted)]">Сотрудник и арендная точка</summary>
              <div className="space-y-3 border-t border-[var(--border)]/50 px-3 py-3">
                <div>
                  <span className={labelClass}>Сотрудник</span>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedEmployeeId(v);
                      if (!v) setEmployeeIncomeIncluded(false);
                    }}
                    className={fieldClass}
                    disabled={busy}
                  >
                    <option value="">Нет</option>
                    {employeeOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                  {selectedEmployeeId ? (
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="cash-employee-income"
                          checked={employeeIncomeIncluded}
                          onChange={() => setEmployeeIncomeIncluded(true)}
                          disabled={busy}
                        />
                        Зачесть в доход сотрудника
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="cash-employee-income"
                          checked={!employeeIncomeIncluded}
                          onChange={() => setEmployeeIncomeIncluded(false)}
                          disabled={busy}
                        />
                        Только метка, без дохода
                      </label>
                    </div>
                  ) : null}
                </div>
                <div>
                  <span className={labelClass}>Арендная точка</span>
                  <select
                    value={selectedRentalPointId}
                    onChange={(e) => setSelectedRentalPointId(e.target.value)}
                    className={fieldClass}
                    disabled={busy || rentalPointOptions.length === 0}
                  >
                    <option value="">Нет</option>
                    {rentalPointOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {rentalPointOptions.length === 0 ? (
                    <p className="mt-1.5 text-xs text-[var(--muted)]">Точки в разделе «Аренда».</p>
                  ) : null}
                </div>
              </div>
            </details>
          </div>

          <label className="block">
            <span className={labelClass}>Категория</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass}
              disabled={busy}
            >
              <option value="">Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              maxLength={120}
              placeholder="Новая категория"
              className={`${fieldClass} min-w-[10rem] flex-1 sm:max-w-md`}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCategory();
                }
              }}
            />
            <button
              type="button"
              className="btn-primary shrink-0 self-center rounded-xl px-3 py-2 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => void addCategory()}
            >
              Добавить
            </button>
          </div>
          {categories.length > 0 ? (
            <details className="rounded-lg border border-[var(--border)]/80 bg-[var(--surface-soft)]/40 px-2 py-1.5 text-sm [&_summary::-webkit-details-marker]:hidden">
              <summary className="cursor-pointer list-none text-xs font-medium text-[var(--muted)]">Удалить категорию</summary>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface)] px-2 py-1.5 text-sm ring-1 ring-[var(--border)]/60"
                  >
                    <span className="min-w-0 truncate">{c.label}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                      disabled={busy}
                      onClick={() => void deleteCategory(c.id)}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-xs text-[var(--muted)]">Категории появятся в списке после добавления.</p>
          )}

          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <span className={labelClass}>Фото чека или подтверждения</span>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <input
                  ref={fileRef}
                  id={receiptFileInputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => setReceiptFileName(e.target.files?.[0]?.name ?? "")}
                />
                <label
                  htmlFor={receiptFileInputId}
                  className={`group inline-flex items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] transition-[box-shadow,border-color,background-color,transform] sm:shrink-0 sm:self-stretch dark:bg-[var(--surface-elevated)]/50 dark:ring-white/[0.06] ${busy ? "pointer-events-none cursor-not-allowed opacity-50" : "cursor-pointer hover:border-emerald-400/55 hover:bg-emerald-50/40 hover:shadow-md active:scale-[0.99] dark:hover:border-emerald-500/45 dark:hover:bg-emerald-950/35"}`}
                >
                  <svg
                    className="h-5 w-5 shrink-0 text-emerald-600/90 transition-colors group-hover:text-emerald-700 dark:text-emerald-400/90 dark:group-hover:text-emerald-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Выбрать файл</span>
                </label>
                <div className="flex min-h-[48px] min-w-0 flex-1 items-center rounded-xl border border-dashed border-[var(--border)]/90 bg-[var(--surface-soft)]/60 px-4 py-2.5 dark:bg-[var(--surface-elevated)]/25">
                  <p className="w-full truncate text-xs leading-snug">
                    {receiptFileName ? (
                      <span className="font-medium text-[var(--text)]" title={receiptFileName}>
                        {receiptFileName}
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">JPG, PNG, WebP или GIF - файл не выбран</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary min-h-[52px] w-full rounded-xl px-7 py-3 text-base font-bold shadow-[var(--shadow-sm)] transition-[transform,box-shadow] hover:shadow-md active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:min-w-[12rem]"
            >
              {busy ? "Сохранение…" : "Записать"}
            </button>
          </div>
          </div>
      </form>
    </div>
  );
}
