"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

function BookingPhotoPreview({ url, className }: { url: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`block ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Фото букинга"
        className="max-h-56 w-full rounded-xl object-contain ring-1 ring-[var(--border)] sm:max-h-72"
      />
    </a>
  );
}

type Entry = { note?: string | null; photo_url?: string | null; photoUrl?: string | null } | null;

function entryPhotoUrl(e: Entry): string {
  if (!e) return "";
  const raw = e.photo_url ?? e.photoUrl ?? "";
  return String(raw).trim();
}

type ViewMode = "compact" | "preview" | "edit";

const btnNeutral =
  "rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-white ring-1 ring-emerald-500/70 hover:bg-emerald-500 disabled:opacity-50";

/**
 * Заполненный букинг по умолчанию - одна полоска (не занимает полэкрана).
 * «Проверить» - развернуть только просмотр; «Изменить» - сразу форма.
 */
export function DispatcherTourBookingQuickForm({ tourId }: { tourId: string }) {
  const t = useTranslations("dispatcher");
  const tC = useTranslations("common");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");

  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [savedPhotoUrl, setSavedPhotoUrl] = useState("");

  const hasSavedContent = useMemo(
    () => savedNote.trim().length > 0 || savedPhotoUrl.trim().length > 0,
    [savedNote, savedPhotoUrl],
  );

  const compactHint = useMemo(() => {
    if (!hasSavedContent) return "";
    const parts: string[] = [];
    if (savedPhotoUrl.trim()) parts.push("фото");
    if (savedNote.trim()) parts.push("текст");
    return parts.join(" · ");
  }, [hasSavedContent, savedPhotoUrl, savedNote]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setBusy(true);
        const res = await fetch(`/api/tours/${tourId}/dispatcher-booking`);
        const json = (await res.json().catch(() => ({}))) as { entry?: Entry; error?: string };
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : t("bookingTitle"));
        const e = json.entry ?? null;
        if (cancelled) return;
        const nextNote = (e?.note ?? "").trim();
        const nextPhoto = entryPhotoUrl(e);
        setSavedNote(nextNote);
        setSavedPhotoUrl(nextPhoto);
        setNote(nextNote);
        setPhotoUrl(nextPhoto);
        const hasAny = Boolean(nextNote || nextPhoto);
        setViewMode(hasAny ? "compact" : "edit");
      } catch (err) {
        if (!cancelled) {
          alert(err instanceof Error ? err.message : "Ошибка");
          setViewMode("edit");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tourId, t]);

  function goCompact() {
    setNote(savedNote);
    setPhotoUrl(savedPhotoUrl);
    setViewMode("compact");
  }

  function goEdit() {
    setNote(savedNote);
    setPhotoUrl(savedPhotoUrl);
    setViewMode("edit");
  }

  async function uploadAndSet(file: File) {
    const fd = new FormData();
    fd.append("kind", "dispatcher_tour_booking");
    fd.append("tourId", tourId);
    fd.append("file", file);
    const up = await fetch("/api/uploads", { method: "POST", body: fd });
    const upj = (await up.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!up.ok || !upj.url) throw new Error(upj.error || t("uploadFailed"));
    setPhotoUrl(upj.url);
    return upj.url;
  }

  async function savePatch(nextPhoto?: string) {
    const effectivePhoto = (nextPhoto ?? photoUrl).trim();
    const res = await fetch(`/api/tours/${tourId}/dispatcher-booking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, photoUrl: effectivePhoto }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string | object };
    if (!res.ok) {
      const msg =
        typeof json.error === "string"
          ? json.error
          : json.error != null
            ? JSON.stringify(json.error)
            : tC("couldNotSave");
      throw new Error(msg);
    }
    const n = note.trim();
    setSavedNote(n);
    setSavedPhotoUrl(effectivePhoto);
    setNote(n);
    setPhotoUrl(effectivePhoto);
    setViewMode("compact");
  }

  async function persistToServer() {
    setBusy(true);
    try {
      await savePatch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm dark:bg-[var(--surface-elevated)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("bookingTitle")}</div>
          {ready && viewMode === "compact" && hasSavedContent ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{t("bookingSaved")} {compactHint}</p>
          ) : null}
        </div>
        {!ready ? (
          <span className="shrink-0 text-[11px] text-[var(--muted2)]">{tC("loading")}</span>
        ) : viewMode === "edit" ? (
          <button type="button" disabled={busy} onClick={goCompact} className={btnNeutral}>
            {t("bookingCollapse")}
          </button>
        ) : viewMode === "preview" ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <button type="button" disabled={busy} onClick={goCompact} className={btnNeutral}>
              {t("bookingCollapse")}
            </button>
            <button type="button" disabled={busy} onClick={goEdit} className={btnPrimary}>
              {t("bookingChange")}
            </button>
          </div>
        ) : viewMode === "compact" && hasSavedContent ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <button type="button" disabled={busy} onClick={() => setViewMode("preview")} className={btnNeutral}>
              {t("bookingCheck")}
            </button>
            <button type="button" disabled={busy} onClick={goEdit} className={btnPrimary}>
              {t("bookingChange")}
            </button>
          </div>
        ) : viewMode === "compact" && !hasSavedContent ? (
          <button type="button" disabled={busy} onClick={() => setViewMode("edit")} className={btnPrimary}>
            {t("bookingFill")}
          </button>
        ) : null}
      </div>

      {ready && viewMode === "compact" && !hasSavedContent ? (
        <p className="mt-2 text-[13px] text-[var(--muted)]">{t("bookingNoContent")}</p>
      ) : null}

      {ready && viewMode === "preview" ? (
        <div className="mt-3 space-y-2">
          {savedPhotoUrl ? <BookingPhotoPreview url={savedPhotoUrl} /> : null}
          {savedNote ? (
            <p className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
              {savedNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {ready && viewMode === "edit" ? (
        <div className="mt-3 grid gap-2">
          {photoUrl.trim() ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-[var(--muted2)]">{t("bookingCurrentPhoto")}</p>
              <BookingPhotoPreview url={photoUrl.trim()} />
            </div>
          ) : null}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("bookingCommentPlaceholder")}
            className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]">
              {photoUrl.trim() ? t("bookingReplacePhoto") : t("bookingAddPhoto")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void (async () => {
                    setBusy(true);
                    try {
                      const url = await uploadAndSet(f);
                      await savePatch(url);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : tC("error"));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </label>
            <button
              type="button"
              className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={() => void persistToServer()}
            >
              {busy ? t("bookingSaving") : t("bookingSaveBtn")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
