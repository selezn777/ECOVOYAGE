"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccountingActions } from "@/components/accounting-actions-context";

export function TourAccountingFooterButtons({ tourId }: { tourId: string }) {
  const router = useRouter();
  const { runManifestSaveDraft, runManifestSaveFinal } = useAccountingActions();
  const [busy, setBusy] = useState<"closed" | "open" | null>(null);

  async function submit(markTourCompleted: boolean): Promise<boolean> {
    setBusy(markTourCompleted ? "closed" : "open");
    try {
      const res = await fetch(`/api/tours/${tourId}/accounting-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markTourCompleted }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось сохранить");
        return false;
      }
      if (markTourCompleted) {
        alert("Тур отмечен как выполненный (закрыт). Проверьте список на дашборде.");
      } else {
        alert("Отметка сохранена: статус тура не меняли.");
      }
      router.refresh();
      return true;
    } catch {
      alert("Нет соединения");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onDraft() {
    if (busy !== null) return;
    const manifestOk = await runManifestSaveDraft();
    if (!manifestOk) return;
    await submit(false);
  }

  async function onClosed() {
    if (busy !== null) return;
    const manifestOk = await runManifestSaveFinal();
    if (!manifestOk) return;
    await submit(true);
  }

  return (
    <section className="card mb-3">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Статус сводки</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Блоки зарплаты и таблицы - своими кнопками. «Сохранить черновик» сохраняет строки по неявкам (если блок есть) без
        завершения проверки и оставляет тур открытым в учёте. «Закрыто» завершает проверку по неявкам и отмечает тур закрытым.
      </p>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onDraft()}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-600/30 hover:bg-amber-300 disabled:opacity-50 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
        >
          {busy === "open" ? "…" : "Сохранить черновик"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onClosed()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 sm:ml-auto"
        >
          {busy === "closed" ? (
            "…"
          ) : (
            <>
              <span className="text-lg leading-none" aria-hidden>
                ✓
              </span>
              Закрыто
            </>
          )}
        </button>
      </div>
    </section>
  );
}
