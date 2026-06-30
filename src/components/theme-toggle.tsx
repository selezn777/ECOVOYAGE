"use client";

import { useState } from "react";

const STORAGE_KEY = "amx-theme";

export function ThemeToggle({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        compact
          ? `btn-secondary flex items-center justify-center ${className}`.trim()
          : `btn-secondary min-h-[42px] w-full justify-start px-3 text-sm font-medium ${className}`.trim()
      }
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {compact ? (
        dark ? (
          <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]" fill="none" aria-hidden>
            <path
              d="M1.8 10c1.7-3.2 4.7-5.2 8.2-5.2S16.5 6.8 18.2 10c-1.7 3.2-4.7 5.2-8.2 5.2S3.5 13.2 1.8 10Z"
              stroke="currentColor" strokeWidth="1.6"
            />
            <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]" fill="none" aria-hidden>
            <path
              d="M1.8 10c1.7-3.2 4.7-5.2 8.2-5.2S16.5 6.8 18.2 10c-1.7 3.2-4.7 5.2-8.2 5.2S3.5 13.2 1.8 10Z"
              stroke="currentColor" strokeWidth="1.6"
            />
            <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )
      ) : dark ? (
        "Светлая тема"
      ) : (
        "Тёмная тема"
      )}
    </button>
  );
}
