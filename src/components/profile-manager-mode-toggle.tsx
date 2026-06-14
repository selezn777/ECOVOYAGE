"use client";

import { useState } from "react";

export function ProfileManagerModeToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function setMode(next: boolean) {
    if (busy || next === enabled) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/manager-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ enabled: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось переключить режим");
      }
      setEnabled(next);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3">
      <h2 className="text-base font-semibold text-[var(--text)]">Режим менеджера</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void setMode(!enabled)}
          className={`relative inline-flex h-9 w-[52px] shrink-0 touch-manipulation rounded-full p-1 transition-colors ${
            enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-soft)] ring-1 ring-[var(--border)]"
          } disabled:opacity-50`}
          role="switch"
          aria-checked={enabled}
          aria-label="Режим менеджера"
        >
          <span
            className={`block h-7 w-7 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm font-medium text-[var(--text)]">{enabled ? "Включён" : "Выключен"}</span>
      </div>
    </section>
  );
}
