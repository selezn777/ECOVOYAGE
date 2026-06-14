"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { rangeOptions } from "@/components/numeric-roll-select";

export function NewBookingIntentStepForm({
  tourId,
  initialAdults = 1,
  initialChildren = 0,
  initialInfants = 0,
  availableSeats,
  editingBookingId,
  detailsHref,
  backHref,
}: {
  tourId: string;
  initialAdults?: number;
  initialChildren?: number;
  initialInfants?: number;
  availableSeats?: number;
  editingBookingId?: string;
  detailsHref: string;
  /** Куда вернуться при отмене (обычно страница тура) */
  backHref?: string;
}) {
  const [adults, setAdults] = useState(Math.max(0, initialAdults));
  const [children, setChildren] = useState(Math.max(0, initialChildren));
  const [infants, setInfants] = useState(Math.max(0, initialInfants));
  const t = useTranslations("booking");
  const [busy, setBusy] = useState(false);

  async function releaseIntent() {
    if (!confirm(t("intentReleaseConfirm"))) return;
    setBusy(true);
    try {
      await fetch(`/api/tours/${tourId}/booking-intent`, { method: "DELETE", credentials: "same-origin" });
    } finally {
      setBusy(false);
      window.location.href = backHref || `/tours/${tourId}`;
    }
  }

  useEffect(() => {
    setAdults(Math.max(0, initialAdults));
    setChildren(Math.max(0, initialChildren));
    setInfants(Math.max(0, initialInfants));
  }, [initialAdults, initialChildren, initialInfants]);

  const total = adults + children + infants;
  const seatsRequested = adults + children;
  const overCapacity = typeof availableSeats === "number" && availableSeats >= 0 && seatsRequested > availableSeats;

  async function submitStep1() {
    if (total <= 0) {
      alert(t("atLeastOneTourist"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/booking-intent`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adults,
          children,
          infants,
          ...(editingBookingId ? { editingBookingId } : {}),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || t("couldNotFixSeats"));
      try {
        sessionStorage.removeItem(`nb-draft-${tourId}`);
      } catch {
        /* ignore */
      }
      window.location.href = detailsHref;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="text-xs text-[var(--muted)]">
        {t("intentStep1Hint")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("adultsLabel")}
          <select
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className="w-full rounded-xl field-surface px-3 py-2 text-sm text-[var(--text)]"
          >
            {rangeOptions(0, 50).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("childrenLabel")}
          <select
            value={children}
            onChange={(e) => setChildren(Number(e.target.value))}
            className="w-full rounded-xl field-surface px-3 py-2 text-sm text-[var(--text)]"
          >
            {rangeOptions(0, 50).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("infantsLabel")}
          <select
            value={infants}
            onChange={(e) => setInfants(Number(e.target.value))}
            className="w-full rounded-xl field-surface px-3 py-2 text-sm text-[var(--text)]"
          >
            {rangeOptions(0, 50).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-[var(--muted2)]">
        {t("intentNextHint")}
      </p>
      {overCapacity ? (
        <p className="text-[11px] font-medium text-[var(--warn)]">
          {t("overCapacityWarn", { requested: seatsRequested, available: availableSeats })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submitStep1()}
          disabled={busy || total <= 0}
          className="btn-primary flex-1 sm:flex-none disabled:opacity-50"
        >
          {busy ? t("intentFixing") : t("nextLabel")}
        </button>
        {backHref ? (
          <button
            type="button"
            onClick={() => void releaseIntent()}
            disabled={busy}
            className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/20 disabled:opacity-50"
          >
            {t("intentRelease")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

