"use client";

import type { ChangeEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

/** Ссылки шаринга из приложения Google Maps (часто короткие). */
function looksLikeGoogleMapsLink(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (h === "maps.google.com") return true;
    if ((h === "google.com" || h === "google.ru") && u.pathname.includes("/maps")) return true;
    if ((h.endsWith(".google.com") || h.endsWith(".google.ru")) && u.pathname.includes("/maps")) return true;
    if (h === "goo.gl" || h.endsWith(".goo.gl")) return true;
    if (h === "maps.app.goo.gl" || h.endsWith("app.goo.gl")) return true;
    return false;
  } catch {
    return false;
  }
}

function isStandaloneIosPwa(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // safari legacy standalone flag for home screen apps
    (typeof navigator !== "undefined" && "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return isIos && standalone;
}

/** Достаёт первый похожий URL из текста (многострочный буфер от «Поделиться»). */
export function extractGoogleMapsUrlFromText(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (looksLikeGoogleMapsLink(t)) return t.split(/\s/)[0];
  const re = /https?:\/\/[^\s<>"']+/gi;
  for (const m of t.matchAll(re)) {
    const url = m[0].replace(/[),.;]+$/, "");
    if (looksLikeGoogleMapsLink(url)) return url;
  }
  return null;
}

type Props = {
  /** react-hook-form register("hotelMapsUrl"); не нужен, если заданы value + onChange */
  register?: UseFormRegisterReturn;
  setValue: (value: string) => void;
  /** Подпись над полем */
  label?: string;
  /** Управляемый режим (без react-hook-form) */
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * Поле ссылки на точку в Google Maps: открываем карты в новой вкладке,
 * пользователь выбирает место и копирует ссылку — вставляем из буфера одним нажатием.
 */
export function GoogleMapsUrlField({ register, setValue, label = "Ссылка Google Maps", value, onChange }: Props) {
  const controlled = value !== undefined && typeof onChange === "function";
  if (!controlled && !register) {
    throw new Error("GoogleMapsUrlField: укажите register или пару value+onChange");
  }
  const rr = !controlled && register ? register : null;
  const ref = rr?.ref;
  const rest = rr ? (() => {
    const { ref: _ignore, ...x } = rr;
    return x;
  })() : {};

  function openMaps() {
    const mapsUrl = "https://www.google.com/maps";
    // iOS PWA: _blank creates a gray intermediate overlay after returning from Maps app.
    if (isStandaloneIosPwa()) {
      window.location.assign(mapsUrl);
      return;
    }
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const url = extractGoogleMapsUrlFromText(text);
      if (!url) {
        alert("В буфере не найдена ссылка на Google Maps. Скопируйте её из «Поделиться» в приложении Карт.");
        return;
      }
      if (controlled) onChange!(url);
      else setValue(url);
    } catch {
      alert("Не удалось прочитать буфер. Разрешите доступ в настройках браузера или вставьте ссылку вручную.");
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{label}</label>
      <input
        ref={controlled ? undefined : ref}
        inputMode="url"
        autoComplete="off"
        placeholder="https://maps.google.com/… или maps.app.goo.gl/…"
        className="w-full rounded-xl field-surface px-3 py-2"
        {...(!controlled ? rest : {})}
        {...(controlled
          ? { value, onChange: (e: ChangeEvent<HTMLInputElement>) => onChange!(e.target.value) }
          : {})}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openMaps}
          className="btn-secondary min-h-[40px] flex-1 rounded-xl px-3 py-2 text-sm font-medium sm:flex-none"
        >
          Открыть Google Карты
        </button>
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          className="btn-secondary min-h-[40px] flex-1 rounded-xl px-3 py-2 text-sm font-medium sm:flex-none"
        >
          Вставить ссылку из буфера
        </button>
      </div>
      <p className="text-[11px] leading-snug text-[var(--muted)]">
        Откроются Карты в новой вкладке (или в приложении на телефоне). Выберите отель или точку на карте → «Поделиться» →
        «Копировать ссылку» → вернитесь сюда и нажмите «Вставить ссылку из буфера».
      </p>
    </div>
  );
}
