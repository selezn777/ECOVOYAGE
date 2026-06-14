"use client";

import { useState } from "react";
import { showConfirm } from "@/lib/ui-dialog";

export function TourDeleteButton({ tourId, tourName }: { tourId: string; tourName: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleDelete() {
    if (!(await showConfirm(`Удалить тур «${tourName}»?\n\nЭто действие необратимо. Тур исчезнет из расписания.`))) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/tours/${tourId}/delete`, { method: "POST" });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok) { setErr(j.error ?? `Ошибка ${res.status}`); return; }
      window.location.href = "/dashboard";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[200px]">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:border-[var(--danger)] hover:text-white disabled:opacity-50"
      >
        {busy ? "Удаление..." : "Удалить тур"}
      </button>
      {err && <p className="mt-1 break-words text-xs text-red-500">{err}</p>}
    </div>
  );
}
