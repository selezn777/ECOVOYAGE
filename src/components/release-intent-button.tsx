"use client";

import { useState } from "react";

/** Кнопка «Турист отказался — освободить места» для шагов 2-3 бронирования */
export function ReleaseIntentButton({ tourId, tourHref }: { tourId: string; tourHref: string }) {
  const [busy, setBusy] = useState(false);

  async function release() {
    if (!confirm("Освободить места? Турист отказался от брони.")) return;
    setBusy(true);
    try {
      await fetch(`/api/tours/${tourId}/booking-intent`, { method: "DELETE", credentials: "same-origin" });
    } finally {
      setBusy(false);
      window.location.href = tourHref;
    }
  }

  return (
    <button
      type="button"
      onClick={() => void release()}
      disabled={busy}
      className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/20 disabled:opacity-50"
    >
      {busy ? "Освобождаем..." : "Турист отказался — освободить места"}
    </button>
  );
}
