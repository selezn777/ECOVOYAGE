"use client";

import { useMemo, useRef, useState } from "react";
import type { TourDispatcherBookingEntry } from "@/lib/types";

function normalizePhoneForTel(raw: string): string {
  return String(raw ?? "").replace(/[^\d+]/g, "");
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

export function TourDispatcherBookingPanel({
  tourId,
  entry,
  canEdit,
  noteTemplate,
  embedInGroup = false,
  noOwnCollapse = false,
}: {
  tourId: string;
  entry: TourDispatcherBookingEntry | null;
  canEdit: boolean;
  /** Шаблон заметки из tour_templates.dispatcher_note_template — преполняет поле если заметка пустая */
  noteTemplate?: string | null;
  /** В общем контейнере с манифестом - без верхнего отступа у карточки */
  embedInGroup?: boolean;
  /** Без своей карточки/заголовка/сворачивания - встраивается в общий свёрнутый блок (для гида). */
  noOwnCollapse?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const initialNote = entry?.note ?? (noteTemplate?.trim() ?? "");
  const [note, setNote] = useState(initialNote);
  const [photoUrl, setPhotoUrl] = useState(entry?.photoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const displayPhotoUrl = useMemo(
    () => (photoUrl || entry?.photoUrl || "").trim(),
    [photoUrl, entry?.photoUrl],
  );

  async function uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append("kind", "dispatcher_tour_booking");
    fd.append("tourId", tourId);
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!res.ok || !json.url) throw new Error(json.error || "Не удалось загрузить фото");
    setPhotoUrl(json.url);
    return json.url;
  }

  async function save(nextPhotoUrl?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/dispatcher-booking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, photoUrl: nextPhotoUrl ?? photoUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось сохранить");
      alert("Сохранено");
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPhoto() {
    if (!displayPhotoUrl) return;
    try {
      const res = await fetch(displayPhotoUrl);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tour-booking-${tourId}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось скачать фото");
    }
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Букинг</p>
      <div className="flex items-center gap-2">
        {entry?.updatedAt ? (
          <p className="text-[11px] text-[var(--muted2)]">
            Обновлено {new Date(entry.updatedAt).toLocaleString("ru-RU")}
            {entry.updatedByName ? ` · ${entry.updatedByName}` : ""}
            {entry.updatedByPhone ? (
              <>
                {" "}
                ·{" "}
                <a
                  href={`tel:${normalizePhoneForTel(entry.updatedByPhone)}`}
                  className="font-medium underline decoration-dotted underline-offset-2"
                >
                  {entry.updatedByPhone}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );

  const body = (
    <>
      {canEdit ? (
        <div className="mt-3 grid gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Внесите бронирование"
            className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            disabled={busy}
          />
          {displayPhotoUrl ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-[var(--muted2)]">Фото букинга</p>
              <a href={displayPhotoUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayPhotoUrl}
                  alt="Фото букинга"
                  className="max-h-72 w-full rounded-xl object-contain ring-1 ring-[var(--border)]"
                />
              </a>
              <button
                type="button"
                onClick={() => void downloadPhoto()}
                className="mt-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
              >
                Скачать фото
              </button>
            </div>
          ) : null}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void (async () => {
              try {
                setBusy(true);
                const url = await uploadPhoto(f);
                await save(url);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Ошибка");
              } finally {
                setBusy(false);
                if (fileRef.current) fileRef.current.value = "";
              }
            })();
          }} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {displayPhotoUrl ? "Заменить фото букинга" : "Добавить фото букинга"}
            </button>
            <button
              type="button"
              className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      ) : null}

      {!canEdit ? (
        <>
          {displayPhotoUrl ? (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-[var(--muted2)]">Фото букинга</p>
              <a href={displayPhotoUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayPhotoUrl}
                  alt="Фото букинга"
                  className="max-h-72 w-full rounded-xl object-contain ring-1 ring-[var(--border)]"
                />
              </a>
              <button
                type="button"
                onClick={() => void downloadPhoto()}
                className="mt-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
              >
                Скачать фото
              </button>
            </div>
          ) : null}
          {entry?.note?.trim() ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--text)]">{entry.note.trim()}</p>
          ) : !displayPhotoUrl ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Комментария и фото пока нет.</p>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (noOwnCollapse) {
    return (
      <div className={embedInGroup ? "mt-0" : "mt-3"}>
        {header}
        {body}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06] ${embedInGroup ? "mt-0" : "mt-4"}`}
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setCollapsed((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCollapsed((v) => !v);
        }
      }}
    >
      {header}
      {!collapsed ? body : null}
    </div>
  );
}
