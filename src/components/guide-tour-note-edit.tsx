"use client";

import { useState } from "react";

export function GuideTourNoteEdit({
  tourGuideRowId,
  initialNote,
}: {
  tourGuideRowId: string;
  initialNote?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tour-guides/${tourGuideRowId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || "Ошибка");
      setSaved(draft);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
          Моя заметка туристам
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={() => { setDraft(saved); setEditing(true); }}
            className="rounded px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-elevated)]"
          >
            {saved ? "Изменить" : "Добавить"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="Ваша заметка — отображается в PDF-квитанции туристов"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
          />
          {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setErr(null); }}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          {saved || "Не указана — туристы увидят только имя и телефон гида."}
        </p>
      )}
    </div>
  );
}
