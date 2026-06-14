"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { addPassportPhotoToBooking } from "@/lib/passport-booking-client-upload";
import { showConfirm } from "@/lib/ui-dialog";

export function BookingPassportPhotosBlock({
  bookingId,
  tourId,
  initialUrls,
  canView,
  canUpload,
}: {
  bookingId: string;
  tourId: string;
  initialUrls: string[];
  canView: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("booking");
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrls(initialUrls);
  }, [initialUrls]);

  if (!canView) return null;

  async function patch(body: { add?: string; remove?: string }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/passport-photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string | unknown;
        urls?: string[];
      };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : j.error && typeof j.error === "object"
              ? JSON.stringify(j.error)
              : t("passportHint");
        alert(msg);
        return;
      }
      if (Array.isArray(j.urls)) setUrls(j.urls);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(f: File) {
    if (!canUpload) return;
    setBusy(true);
    try {
      const r = await addPassportPhotoToBooking(bookingId, tourId, f);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(url: string) {
    const ok = await showConfirm(
      "Удалить это фото со страницы брони?\n\nВосстановить файл нельзя — только загрузить заново. (Отдельно: удалённую целиком карточку брони можно вернуть на странице «Удалённые» в течение часа — см. раздел в меню.)",
    );
    if (!ok) return;
    await patch({ remove: url });
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("passportPhotos")}</div>
        {canUpload ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/25 hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : t("addPhoto")}
            </button>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-[var(--muted2)]">
        {t("passportHint")}
      </p>
      {urls.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">{t("noPhotos")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {urls.map((u) => (
            <li key={u} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              <a href={u} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
              </a>
              {canUpload ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRemove(u)}
                  className="absolute right-0.5 top-0.5 rounded bg-red-600/90 px-1 text-[10px] font-bold text-white hover:bg-red-700"
                  title={t("deletePhoto")}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
