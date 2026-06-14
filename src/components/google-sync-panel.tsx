"use client";

import { useEffect, useState } from "react";

type SyncStatus = {
  sheets: { configured: boolean; spreadsheetTitle: string | null; error: string | null };
  geocoding: { configured: boolean };
};

type SyncAction = { category: "hotels" | "reports"; action: "push" | "pull"; label: string };

const ACTIONS: SyncAction[] = [
  { category: "hotels", action: "push", label: "Отели → таблица" },
  { category: "hotels", action: "pull", label: "Отели ← таблица" },
  { category: "reports", action: "push", label: "Отчёты → таблица" },
];

export function GoogleSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/google/status");
        const j = (await res.json().catch(() => null)) as SyncStatus | null;
        if (res.ok && j) setStatus(j);
      } catch {
        // best-effort
      }
    })();
  }, []);

  async function run(a: SyncAction) {
    const key = `${a.category}:${a.action}`;
    setBusy(key);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: a.category, action: a.action }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: Record<string, number>; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `Ошибка ${res.status}`);
        return;
      }
      const summary = Object.entries(j.result ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      setResult(`${a.label} — готово (${summary})`);
    } catch {
      setErr("Ошибка сети");
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;
  if (!status.sheets.configured) return null;

  return (
    <section className="card mb-3">
      <h2 className="mb-1 text-base font-semibold">Google Таблица</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        {status.sheets.spreadsheetTitle ?? "Подключено"}
        {status.sheets.error ? ` · ошибка: ${status.sheets.error}` : ""}
      </p>

      {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      {result ? <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">{result}</p> : null}

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => {
          const key = `${a.category}:${a.action}`;
          return (
            <button
              key={key}
              type="button"
              className="btn-secondary disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void run(a)}
            >
              {busy === key ? "..." : a.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
