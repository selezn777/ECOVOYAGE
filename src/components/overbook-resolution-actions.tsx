"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/lib/ui-dialog";

export function OverbookResolutionActions({
  tourId,
  capacity,
  booked,
}: {
  tourId: string;
  capacity: number;
  booked: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState("");
  const overbookBy = Math.max(0, booked - capacity);
  const suggested = Math.max(capacity + overbookBy, capacity + 1);

  function openCapacityDialog() {
    setCapacityDraft(String(suggested));
    setCapacityOpen(true);
  }

  async function saveCapacity() {
    const next = Math.round(Number(capacityDraft.replace(/[^\d]/g, "")));
    if (!Number.isFinite(next) || next < 1) {
      alert("Введите корректное число мест.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${encodeURIComponent(tourId)}/overbook/capacity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Не удалось обновить вместимость");
      setCapacityOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function createCloneTour() {
    const ok = await showConfirm(
      "Создать дубль тура на эту же дату?\n\nПосле создания вы попадёте в новый тур и сможете перенести часть туристов.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${encodeURIComponent(tourId)}/overbook/clone`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; href?: string; newTourId?: string };
      if (!res.ok) throw new Error(j.error || "Не удалось создать дубль тура");
      const newTourId = typeof j.newTourId === "string" ? j.newTourId.trim() : "";
      const fallbackHref = newTourId ? `/tours/${newTourId}` : `/tours/${tourId}`;
      const rawHref = typeof j.href === "string" && j.href.trim() ? j.href : fallbackHref;
      const glue = rawHref.includes("?") ? "&" : "?";
      const href = `${rawHref}${glue}transferFrom=${encodeURIComponent(tourId)}`;
      router.push(href);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-2 space-y-1.5 rounded-xl border border-rose-200/70 bg-white/70 p-2 dark:border-rose-500/30 dark:bg-rose-950/15 pointer-events-auto">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-800 dark:text-rose-200">
          Решение перебора
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={openCapacityDialog}
          className="w-full rounded-lg border border-rose-300/70 bg-rose-50/80 px-2.5 py-2 text-left text-[11px] font-semibold text-rose-900 hover:bg-rose-100/80 disabled:opacity-60 dark:border-rose-400/35 dark:bg-rose-950/35 dark:text-rose-100"
        >
          <div>Изменить количество мест</div>
          <div className="mt-0.5 text-[10px] font-medium text-rose-700/90 dark:text-rose-200/90">
            Сейчас {capacity}, перебор {overbookBy}
          </div>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createCloneTour()}
          className="w-full rounded-lg border border-rose-300/70 bg-rose-50/80 px-2.5 py-2 text-left text-[11px] font-semibold text-rose-900 hover:bg-rose-100/80 disabled:opacity-60 dark:border-rose-400/35 dark:bg-rose-950/35 dark:text-rose-100"
        >
          <div>Открыть такой же тур (дубль)</div>
          <div className="mt-0.5 text-[10px] font-medium text-rose-700/90 dark:text-rose-200/90">
            Для оперативного переноса части туристов
          </div>
        </button>
      </div>

      {capacityOpen ? (
        <div
          className="fixed inset-0 z-[230] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setCapacityOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]">
            <h3 className="text-base font-semibold text-[var(--text)]">Изменить места</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Перебор: {overbookBy}. Рекомендовано: {suggested} мест.
            </p>
            <label className="mt-3 block text-xs font-medium text-[var(--muted2)]">
              Новая вместимость
              <input
                inputMode="numeric"
                value={capacityDraft}
                onChange={(e) => setCapacityDraft(e.target.value.replace(/[^\d]/g, ""))}
                className="field-surface mt-1 w-full rounded-xl px-3 py-2 text-sm"
                placeholder="Например 25"
                autoFocus
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCapacityOpen(false)}
                className="btn-secondary rounded-xl px-3 py-2 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveCapacity()}
                className="btn-primary rounded-xl px-3 py-2 text-sm"
              >
                {busy ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
