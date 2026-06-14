"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffReviewRow } from "@/lib/types";

export function StaffReviewBlock({
  subjectId,
  kind,
  canAdd,
  subjectName,
  tone = "default",
}: {
  subjectId: string;
  kind: "guide" | "manager";
  canAdd: boolean;
  subjectName: string;
  /** Карточка на тёплом фоне (выходной) - контрастный текст вместо var(--text). */
  tone?: "default" | "warmCard";
}) {
  const warm = tone === "warmCard";
  const tMuted = warm ? "text-stone-700 dark:text-amber-200/90" : "text-[var(--muted2)]";
  const tBody = warm ? "text-stone-800 dark:text-amber-50" : "text-[var(--text)]";
  const tMutedList = warm ? "text-stone-700 dark:text-amber-200/85" : "text-[var(--muted)]";
  const [reviews, setReviews] = useState<StaffReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");

  async function load() {
    const res = await fetch(`/api/staff-reviews?subjectId=${encodeURIComponent(subjectId)}&kind=${kind}`, {
      credentials: "same-origin",
    });
    const j = (await res.json().catch(() => ({}))) as { reviews?: StaffReviewRow[] };
    if (res.ok) setReviews(j.reviews ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [subjectId, kind]);

  async function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("kind", "staff_feedback");
      const up = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "same-origin" });
      const j = (await up.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!up.ok) throw new Error(j.error || "Загрузка не удалась");
      if (!j.url) throw new Error("Нет URL файла");
      setAttachmentUrl(j.url.trim());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploadBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/staff-reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          subjectId,
          rating,
          comment: comment.trim() || undefined,
          attachmentUrl: attachmentUrl || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : Array.isArray(j.error?.formErrors) && j.error.formErrors[0]
              ? String(j.error.formErrors[0])
              : "Не удалось сохранить";
        throw new Error(msg);
      }
      setComment("");
      setAttachmentUrl("");
      await load();
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-xs">
      {loading ? (
        <p className={tMuted}>Загрузка отзывов…</p>
      ) : reviews.length > 0 ? (
        <ul className={`max-h-48 space-y-2 overflow-y-auto ${tMutedList}`}>
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg bg-[var(--surface)] p-2 ring-1 ring-[var(--border)]">
              <div className="flex flex-wrap justify-between gap-1">
                <span className={`font-medium ${tBody}`}>{r.authorName}</span>
                <span className={warm ? "text-teal-700 dark:text-teal-300" : "text-[var(--accent)]"}>★ {r.rating}</span>
              </div>
              {r.comment ? <p className={`mt-1 ${tBody}`}>{r.comment}</p> : null}
              {r.attachmentUrl ? (
                <a
                  href={r.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-1 inline-block underline ${warm ? "text-teal-800 dark:text-teal-300" : "text-[var(--accent)]"}`}
                >
                  Вложение
                </a>
              ) : null}
              <p className={`mt-1 text-[10px] ${tMuted}`}>
                {new Date(r.createdAt).toLocaleString("ru-RU")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {canAdd ? (
        <form onSubmit={(e) => void submit(e)} className="space-y-2 rounded-xl bg-[var(--surface-soft)] p-2 ring-1 ring-[var(--border)]">
          <p className={`font-medium ${tBody}`}>Новый отзыв · {subjectName}</p>
          <label className={`block ${tMuted}`}>
            Оценка
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className={`mt-0.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm ${tBody}`}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (обратная связь)"
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onPickFile}
          />
          <div className="action-row">
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-[var(--surface-soft)] px-2 py-1 text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
            >
              {uploadBusy ? "Загрузка…" : "Прикрепить фото"}
            </button>
            {attachmentUrl ? <span className="text-emerald-600 dark:text-emerald-400">Файл прикреплён</span> : null}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Сохранить отзыв"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
