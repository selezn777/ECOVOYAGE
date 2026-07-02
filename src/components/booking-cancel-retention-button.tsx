"use client";

import { useState } from "react";
import { formatVnd } from "@/lib/format";

type Props = {
  bookingId: string;
  customerName: string;
  totalVnd: number;
  depositVnd: number;
};

export function BookingCancelRetentionButton({ bookingId, customerName, totalVnd, depositVnd }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pct, setPct] = useState<number | "">(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const retentionVnd = typeof pct === "number" ? Math.round(totalVnd * pct / 100) : 0;
  const shortfallVnd = Math.max(0, retentionVnd - depositVnd);

  async function submit() {
    if (!reason.trim()) { setErr("Укажите причину отмены"); return; }
    if (typeof pct !== "number") { setErr("Укажите процент удержания"); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel-with-retention`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), retentionPct: pct, totalVnd }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || "Ошибка");
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-red-300/80 bg-red-50 px-3 text-[13px] font-medium text-red-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-red-400/40 dark:bg-red-900/30 dark:text-red-200"
      >
        Отмена с удержанием
      </button>

      {open ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={() => { if (!busy) setOpen(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">Отмена брони</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                Закрыть
              </button>
            </div>

            <p className="mb-3 text-sm text-[var(--muted)]">{customerName}</p>

            {/* Финансовая сводка */}
            <div className="mb-3 rounded-xl bg-[var(--surface-soft)] p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--muted2)]">Стоимость путёвки</span>
                <span className="font-semibold tabular-nums">{formatVnd(totalVnd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted2)]">Депозит (у менеджера)</span>
                <span className="font-semibold tabular-nums">{formatVnd(depositVnd)}</span>
              </div>
              {typeof pct === "number" && pct > 0 ? (
                <>
                  <div className="flex justify-between border-t border-[var(--border)] pt-1">
                    <span className="text-[var(--muted2)]">Удержание ({pct}%)</span>
                    <span className="font-bold tabular-nums text-red-700 dark:text-red-300">{formatVnd(retentionVnd)}</span>
                  </div>
                  {shortfallVnd > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-amber-700 dark:text-amber-300">Нехватка у менеджера</span>
                      <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatVnd(shortfallVnd)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-[var(--muted2)]">Возврат туристу</span>
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatVnd(Math.max(0, depositVnd - retentionVnd))}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted2)]">
                  % удержания от стоимости путёвки
                </label>
                <div className="flex gap-2">
                  {[0, 30, 100].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPct(v)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        pct === v
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--border)]"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) => setPct(e.target.value === "" ? "" : Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-center text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    placeholder="%"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted2)]">
                  Причина отмены <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder="Укажите причину отмены бронирования"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 dark:bg-[var(--surface-elevated)]"
                />
              </div>

              {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

              {shortfallVnd > 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Депозит не покрывает удержание. Разница {formatVnd(shortfallVnd)} будет зафиксирована как нехватка у менеджера и отражена в кассе.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !reason.trim() || typeof pct !== "number"}
                className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Отмена брони…" : `Подтвердить отмену${retentionVnd > 0 ? ` · удержание ${formatVnd(retentionVnd)}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
