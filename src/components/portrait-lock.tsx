"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Блокировка portrait-режима для PWA.
 *
 * Android: screen.orientation.lock("portrait") — API работает.
 * iOS: API полностью игнорируется. Единственный надёжный способ —
 *      показывать overlay "поверните телефон" при landscape.
 *      Manifest orientation: "portrait" работает только при запуске.
 */
export function PortraitLock() {
  const [landscape, setLandscape] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    // Проверяем standalone только один раз при монтировании
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);

    // Android: пробуем заблокировать через API
    if (isStandalone) {
      const ori = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      ori?.lock?.("portrait").catch(() => {});
    }

    // Следим за ориентацией для overlay
    const check = () => setLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check, { passive: true });
    screen.orientation?.addEventListener?.("change", check);
    return () => {
      window.removeEventListener("resize", check);
      screen.orientation?.removeEventListener?.("change", check);
    };
  }, []);

  const t = useTranslations("common");

  // Overlay: только в standalone PWA и только когда landscape
  if (!standalone || !landscape) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#111",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        gap: "16px",
        touchAction: "none",
        userSelect: "none",
      }}
      aria-live="assertive"
      aria-label={t("rotatePhone")}
    >
      {/* Иконка телефона с поворотом */}
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden>
        <rect x="20" y="8" width="24" height="40" rx="4" stroke="#a8ce40" strokeWidth="2.5" />
        <circle cx="32" cy="43" r="2" fill="#a8ce40" />
        <path d="M44 28 Q54 28 54 38" stroke="#a8ce40" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M50 34 L54 38 L58 34" stroke="#a8ce40" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p style={{ fontSize: "17px", fontWeight: 600, margin: 0, textAlign: "center", padding: "0 32px" }}>
        {t("rotatePhone")}
      </p>
      <p style={{ fontSize: "13px", color: "#888", margin: 0, textAlign: "center", padding: "0 32px" }}>
        {t("rotatePhoneHint")}
      </p>
    </div>
  );
}
