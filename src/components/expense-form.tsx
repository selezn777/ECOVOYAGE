"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { TourOption } from "@/lib/types";
import { receiptFileToJpegDataUrl } from "@/lib/receipt-image-compress";

const MAX_PICK_BYTES = 12 * 1024 * 1024;

function fmt(n: number) {
  return n > 0 ? n.toLocaleString("ru-RU") : "";
}
function parseVnd(s: string) {
  const n = Number(s.replace(/\s/g, "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function ExpenseForm({ tours }: { tours: TourOption[] }) {
  const t = useTranslations("expense");

  const [tourId, setTourId] = useState(tours[0]?.id ?? "");
  const [locationName, setLocationName] = useState("");
  const [amountText, setAmountText] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlightRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const currentTour = tours.find((t) => t.id === tourId);
  const locations = currentTour?.locations ?? [];

  // Reset location when tour changes
  useEffect(() => {
    setLocationName(locations[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  useEffect(() => {
    if (!receiptFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(receiptFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const desc = locationName.trim();
    const amount = parseVnd(amountText);
    if (!tourId || !desc || amount <= 0 || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (receiptFile) {
        if (receiptFile.size > MAX_PICK_BYTES) { alert(t("photoTooBig")); return; }
        try {
          attachmentDataUrl = await receiptFileToJpegDataUrl(receiptFile);
        } catch {
          throw new Error(t("photoProcessError"));
        }
      }
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourId,
          category: "other",
          amountVnd: amount,
          description: desc,
          ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const json = ct.includes("application/json")
        ? ((await res.json()) as { error?: string })
        : ({} as { error?: string });
      if (!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);
      setAmountText("");
      setReceiptFile(null);
      alert(t("expenseSaved"));
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
      submitInFlightRef.current = false;
    }
  }

  if (!tours.length) {
    return <p className="text-sm text-[var(--muted)]">{t("noTours")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {/* Tour selector */}
      <select
        value={tourId}
        onChange={(e) => setTourId(e.target.value)}
        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
      >
        {tours.map((tour) => (
          <option key={tour.id} value={tour.id}>
            {tour.label}
          </option>
        ))}
      </select>

      {/* Compact row: location → amount → photo → save */}
      <div className="flex items-stretch gap-1.5">
        {/* Location picker */}
        {locations.length > 0 ? (
          <select
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="field-surface min-w-0 flex-1 rounded-xl px-2 py-2 text-sm"
            disabled={busy}
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder={t("locationPlaceholder")}
            className="field-surface min-w-0 flex-1 rounded-xl px-2 py-2 text-sm"
            disabled={busy}
          />
        )}

        {/* Amount */}
        <input
          inputMode="numeric"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="0 ₫"
          className="field-surface w-24 rounded-xl px-2 py-2 text-right text-sm tabular-nums"
          disabled={busy}
        />

        {/* Photo button */}
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={busy}
          className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-lg ring-1 transition-colors ${
            receiptFile
              ? "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700"
              : "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
          }`}
          aria-label={t("photoLabel")}
        >
          {receiptFile ? "✓" : "📷"}
        </button>

        {/* Submit */}
        <button
          type="submit"
          disabled={busy || !locationName.trim() || parseVnd(amountText) <= 0}
          className="btn-primary shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "…" : t("saveShort")}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          setReceiptFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {/* Receipt preview (compact) */}
      {previewUrl ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className="h-14 w-14 rounded-lg object-cover ring-1 ring-[var(--border)]"
          />
          <button
            type="button"
            className="text-xs text-[var(--muted)] underline underline-offset-2"
            onClick={() => setReceiptFile(null)}
            disabled={busy}
          >
            {t("removePhoto")}
          </button>
        </div>
      ) : null}
    </form>
  );
}
