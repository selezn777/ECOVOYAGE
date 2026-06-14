"use client";

import { useState } from "react";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";

function parseDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return formatYmdWithWeekdayRu(ymd);
  } catch {
    return null;
  }
}

export function DollarRateWidget({
  initialRate,
  initialSetAt,
  initialSetByName,
  canEdit,
}: {
  initialRate: number;
  initialSetAt: string | null;
  initialSetByName: string | null;
  canEdit: boolean;
}) {
  const [rate, setRate] = useState(initialRate);
  const [setAt, setSetAt] = useState(initialSetAt);
  const [setByName, setSetByName] = useState(initialSetByName);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    const n = Math.round(Number(inputVal.replace(/\D/g, "")));
    if (!n || n < 1000 || n > 500_000) {
      setErr("Введите курс от 1 000 до 500 000");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/currency-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: n }),
      });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; rate?: number; error?: string };
      if (!res.ok) { setErr(j.error ?? `Ошибка ${res.status}`); return; }
      setRate(j.rate ?? n);
      setSetAt(new Date().toISOString());
      setSetByName(null);
      setEditing(false);
      setInputVal("");
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setInputVal(String(rate));
    setErr("");
    setEditing(true);
  }

  const dateStr = parseDate(setAt);

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--muted)] shrink-0">$1 =</span>
          <input
            type="text"
            inputMode="numeric"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-base tabular-nums font-semibold"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            placeholder="25000"
          />
          <span className="text-sm text-[var(--muted)] shrink-0">₫</span>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setErr(""); }}
            className="flex-1 rounded-xl bg-[var(--surface-soft)] py-2.5 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={canEdit ? startEdit : undefined}
      disabled={!canEdit}
      className={`w-full text-left rounded-xl bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-[var(--border)] transition-colors ${canEdit ? "hover:bg-[var(--surface-elevated)] active:bg-[var(--surface-elevated)] cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <span className="text-xs font-medium text-[var(--muted)] shrink-0">$1 =</span>
          <span className="text-xl font-bold tabular-nums text-[var(--accent)]">
            {rate.toLocaleString("ru-RU")} ₫
          </span>
        </div>
        {canEdit && (
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[var(--muted2)]" fill="none" aria-hidden>
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {(dateStr || setByName) && (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[var(--muted)]">
          {dateStr && <span>{dateStr}</span>}
          {setByName && <span>· {setByName}</span>}
        </div>
      )}
    </button>
  );
}
