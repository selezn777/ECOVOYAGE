"use client";

import { useState } from "react";

export function TransferBookingForm({
  bookingId,
  currentTourId,
  tours,
}: {
  bookingId: string;
  currentTourId: string;
  tours: { id: string; name: string; dateLabel: string; booked: number; capacity: number }[];
}) {
  const [targetTourId, setTargetTourId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetTourId) {
      setErr("Выберите тур");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTourId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; tourId?: string };
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось перенести");
      }
      const tid = typeof json.tourId === "string" ? json.tourId : targetTourId;
      // Hard navigation — инвалидирует кэш обеих страниц (старый и новый тур)
      window.location.href = `/tours/${tid}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--muted)]">Перенести на тур</span>
        <select
          className="field-surface w-full rounded-xl px-3 py-2"
          value={targetTourId}
          onChange={(e) => setTargetTourId(e.target.value)}
          disabled={busy}
          required
        >
          <option value="">- выберите -</option>
          {tours
            .filter((t) => t.id !== currentTourId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.dateLabel} · {t.name} ({t.booked}/{t.capacity || "-"})
              </option>
            ))}
        </select>
      </label>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <button
        type="submit"
        disabled={busy || !targetTourId}
        className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Перенос…" : "Перенести бронь"}
      </button>
    </form>
  );
}
