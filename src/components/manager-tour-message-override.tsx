"use client";

import { useState } from "react";

export function ManagerTourMessageOverride({
  tourId,
  initialText,
  templateText,
}: {
  tourId: string;
  initialText?: string | null;
  templateText?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialText ?? "");
  const [saved, setSaved] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tours/${tourId}/message-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, type: "tourist" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || "Ошибка");
      setSaved(draft);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--muted)]">
          {saved ? "Моё сообщение туристам: задано" : "Личное сообщение: стандартное"}
        </span>
        <button
          type="button"
          onClick={() => { setDraft(saved || templateText || ""); setOpen(true); }}
          className="rounded px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-soft)]"
        >
          {saved ? "Изменить" : "Задать своё"}
        </button>
      </div>

      {open ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={() => { if (!saving) setOpen(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">Моё приветствие туристам</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                Закрыть
              </button>
            </div>
            {templateText ? (
              <p className="mb-2 rounded-lg bg-[var(--surface-soft)] p-2 text-xs text-[var(--muted)]">
                Стандартное: {templateText.slice(0, 120)}{templateText.length > 120 ? "…" : ""}
              </p>
            ) : null}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              rows={6}
              placeholder="Оставьте пустым — будет использоваться стандартное сообщение"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 dark:bg-[var(--surface-elevated)]"
            />
            {err ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              {saved ? (
                <button
                  type="button"
                  onClick={() => { setDraft(""); void save(); }}
                  disabled={saving}
                  className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Сбросить
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
