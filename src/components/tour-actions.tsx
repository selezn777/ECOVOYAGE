"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { telegramMsgHref, telegramProfileHref } from "@/lib/telegram-username";
import { waMeHref } from "@/lib/wa-me";
import { showPrompt } from "@/lib/ui-dialog";

function formatVndInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseVndInput(raw: string): number {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function parseUsdInput(raw: string): number {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  const safe = normalized.replace(/[^\d.]/g, "");
  const n = Number(safe);
  return Number.isFinite(n) ? n : 0;
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

async function openPdfBlob(blob: Blob, filename: string): Promise<void> {
  // iOS (Safari browser + PWA): Web Share API with File gives proper filename and shares as real file.
  // blob: URLs can't be accessed by WhatsApp — only the native share sheet sends the actual PDF.
  if (isIosDevice() && typeof navigator !== "undefined" && "share" in navigator) {
    const file = new File([blob], filename, { type: "application/pdf" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      // fall through to URL approach
    }
    const url = URL.createObjectURL(blob);
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 90_000);
    return;
  }
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) {
    setTimeout(() => URL.revokeObjectURL(url), 90_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener noreferrer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

export function CopyGroupButton({ tourId }: { tourId: string }) {
  const [busy, setBusy] = useState(false);

  async function onCopy() {
    try {
      setBusy(true);
      const res = await fetch(`/api/tours/${tourId}/copy`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Не удалось скопировать");
      await navigator.clipboard.writeText(json.text);
      alert("Скопировано");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      onClick={onCopy}
      disabled={busy}
      type="button"
    >
      {busy ? "Копирование…" : "WhatsApp"}
    </button>
  );
}

export function CopyDriverButton({ tourId }: { tourId: string }) {
  const [busy, setBusy] = useState(false);

  async function onCopy() {
    try {
      setBusy(true);
      const res = await fetch(`/api/tours/${tourId}/copy-driver`);
      const json = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось скопировать");
      await navigator.clipboard.writeText(json.text || "");
      alert("Скопировано");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="rounded-xl bg-[var(--surface-soft)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
      onClick={onCopy}
      disabled={busy}
      type="button"
    >
      {busy ? "Копирование…" : "Адреса"}
    </button>
  );
}

export function TelegramBookingLink({
  username,
  className,
  prefillMessage,
  onOpen,
}: {
  username: string;
  className?: string;
  prefillMessage?: string | null;
  onOpen?: () => void;
}) {
  const u = String(username ?? "")
    .trim()
    .replace(/^@+/, "");
  const base =
    "inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium shadow-sm transition-[transform,box-shadow,filter] hover:brightness-[1.06] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#229ED9]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] max-w-full dark:focus-visible:ring-offset-[var(--surface)]";
  const brand =
    "!bg-[#229ED9] !text-white ring-1 ring-black/15 hover:!ring-black/25 dark:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]";
  if (!u) {
    return (
      <span
        className={`${base} cursor-not-allowed bg-[var(--surface-soft)] text-[var(--muted2)] ring-[var(--border)] opacity-70 ${className ?? ""}`}
      >
        Нет Telegram
      </span>
    );
  }
  const href = telegramMsgHref(u, prefillMessage) || telegramProfileHref(u);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={`${base} ${className ?? ""} ${brand}`}
    >
      Telegram
    </a>
  );
}

export function CopyTouristBriefingButton({ text, className }: { text: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const trimmed = String(text ?? "").trim();

  async function onCopy() {
    if (!trimmed) {
      alert("В шаблоне тура не задан текст для туриста.");
      return;
    }
    try {
      setBusy(true);
      await navigator.clipboard.writeText(trimmed);
      alert("Скопировано. Откройте WhatsApp, вставьте текст и приложите квитанцию.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось скопировать");
    } finally {
      setBusy(false);
    }
  }

  const defaultCls =
    "inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium shadow-sm transition-[transform,box-shadow,filter] hover:brightness-[1.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] dark:focus-visible:ring-offset-[var(--surface)] bg-[var(--surface-elevated)] text-[var(--text)] ring-1 ring-[var(--border)]";
  return (
    <button
      type="button"
      disabled={busy || !trimmed}
      onClick={() => void onCopy()}
      className={className ? `${defaultCls} ${className}` : defaultCls}
    >
      {busy ? "…" : "Инфо"}
    </button>
  );
}

export function WhatsAppBookingLink({
  phone,
  className,
  prefillMessage,
  label = "WhatsApp",
  onOpen,
}: {
  phone: string;
  className?: string;
  /** Текст в поле сообщения при открытии чата (если номер валиден). */
  prefillMessage?: string | null;
  /** Подпись кнопки (например запасной номер). */
  label?: string;
  /** Вызывается при клике — для отметки «отправлено». */
  onOpen?: () => void;
}) {
  const href = waMeHref(phone, { minDigits: 1, text: prefillMessage?.trim() || undefined });
  const base =
    "inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium shadow-sm transition-[transform,box-shadow,filter] hover:brightness-[1.06] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] max-w-full dark:focus-visible:ring-offset-[var(--surface)]";
  /** Фирменный зелёный + белый текст - читается на любом фоне (в т.ч. при html.dark без prefers-color-scheme). */
  const defaultStyle =
    "bg-[#25D366] text-white ring-1 ring-black/15 hover:ring-black/25 dark:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]";
  if (!href) {
    return (
      <span
        className={`${base} cursor-not-allowed bg-[var(--surface-soft)] text-[var(--muted2)] ring-[var(--border)] opacity-70 ${className ?? ""}`}
      >
        Нет телефона
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={`${base} ${defaultStyle} ${className ?? ""}`}>
      {label}
    </a>
  );
}

/** Тот же размер и поведение, что у WhatsApp в карточке брони — для звонка в ростере «Команда» и т.п. */
export function PhoneCallLink({
  phone,
  label = "Позвонить",
  className,
}: {
  phone: string;
  label?: string;
  className?: string;
}) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  const base =
    "inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium shadow-sm transition-[transform,box-shadow,filter] hover:brightness-[1.06] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] max-w-full dark:focus-visible:ring-offset-[var(--surface)]";
  const style =
    "bg-sky-600 text-white ring-1 ring-black/15 hover:ring-black/25 dark:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]";
  if (!digits) {
    return (
      <span
        className={`${base} cursor-not-allowed bg-[var(--surface-soft)] text-[var(--muted2)] ring-[var(--border)] opacity-70 ${className ?? ""}`}
      >
        Нет номера
      </span>
    );
  }
  return (
    <a href={`tel:${digits}`} className={`${base} ${style} ${className ?? ""}`}>
      {label}
    </a>
  );
}

export function ReceiptPdfButton({
  bookingId,
  label,
  className,
}: {
  bookingId: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch in SSR (Next.js dev overlay).
  if (!mounted) return null;

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Не удалось сформировать квитанцию");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `receipt-${bookingId}.pdf`;
      await openPdfBlob(blob, filename);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const defaultCls =
    "inline-flex h-10 min-h-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium text-[var(--text)] shadow-sm transition-[transform,background-color,filter] hover:brightness-[1.04] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] max-w-full dark:focus-visible:ring-offset-[var(--surface)]";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void download()}
      className={className ? `${defaultCls} ${className}` : defaultCls}
    >
      {busy ? "…" : (label ?? "Квитанция PDF")}
    </button>
  );
}

export function ActionBurgerMenu({
  label = "Меню",
  align = "left",
  className,
  children,
}: {
  label?: string;
  align?: "left" | "right";
  className?: string;
  children: (ctx: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const triggerClass =
    "inline-flex h-10 min-h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium text-[var(--text)] shadow-sm transition-[transform,filter] hover:brightness-[1.04] active:scale-[0.99]";
  const panelAlignClass = align === "right" ? "right-0" : "left-0";

  return (
    <div className={`relative ${className ?? ""}`} ref={rootRef}>
      <button
        type="button"
        aria-label={open ? "Закрыть меню действий" : "Открыть меню действий"}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((s) => !s);
        }}
        className={triggerClass}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      {open ? (
        <div
          className={`absolute ${panelAlignClass} top-[calc(100%+6px)] z-30 min-w-[15.5rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">{children({ close: () => setOpen(false) })}</div>
        </div>
      ) : null}
    </div>
  );
}

async function fetchUsdToVndRateFallback(): Promise<number> {
  try {
    const res = await fetch("/api/currency-rates/active");
    const json = (await res.json()) as { usdToVndRate?: number };
    const rate = Number(json.usdToVndRate);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // ignore
  }
  return 26000;
}

export function BookingPaymentButtons({ bookingId, dueVnd }: { bookingId: string; dueVnd: number }) {
  const [busy, setBusy] = useState(false);

  async function downloadReceiptIfPossible() {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt`, { method: "POST" });
      if (!res.ok) return;
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `receipt-${bookingId}.pdf`;
      await openPdfBlob(blob, filename);
    } catch {
      // ignore
    }
  }

  async function send(kind: "topup" | "deposit" | "refund", amountVnd: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, amountVnd }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Платёж не записан");
      alert("Сохранено");
      const dueAfter = dueVnd - amountVnd;
      if (dueAfter <= 0) {
        await downloadReceiptIfPossible();
        return;
      }
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (dueVnd <= 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        className="rounded-lg bg-orange-50 px-2 py-1 text-xs text-orange-900 ring-1 ring-orange-200/70 disabled:opacity-50 dark:bg-orange-950/35 dark:text-orange-200 dark:ring-orange-800/45"
        disabled={busy}
        onClick={() => {
          void (async () => {
            const currency = (await showPrompt("Валюта доплаты: VND или USD", "VND"))?.trim().toUpperCase();
            if (!currency) return;

            if (currency === "USD") {
              const rate = await fetchUsdToVndRateFallback();
              const defaultUsd = dueVnd > 0 ? dueVnd / rate : 0;
              const rawUsd = await showPrompt("Сумма доплаты, USD (можно с точкой)", defaultUsd.toFixed(2));
              if (!rawUsd) return;
              const usd = parseUsdInput(rawUsd);
              if (usd <= 0) return;
              const amountVnd = Math.round(usd * rate);
              if (amountVnd > 0) void send("topup", amountVnd);
              return;
            }

            // VND by default: input with dot separators
            const rawVnd = await showPrompt("Сумма доплаты, VND (через точку)", formatVndInput(dueVnd));
            if (!rawVnd) return;
            const amount = parseVndInput(rawVnd);
            if (amount > 0) void send("topup", amount);
          })();
        }}
        type="button"
      >
        Доплата
      </button>
    </div>
  );
}
