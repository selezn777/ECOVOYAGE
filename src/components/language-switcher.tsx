"use client";

import { useTransition, useEffect, useState } from "react";
import { setLocale } from "@/app/actions/set-locale";
import { locales, defaultLocale, type Locale } from "@/i18n/config";

const labels: Record<Locale, string> = { ru: "Рус", en: "Eng", vi: "Việt" };

export function LanguageSwitcher({ onSelect }: { onSelect?: () => void }) {
  const [current, setCurrent] = useState<Locale>(defaultLocale);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrent(getCurrentLocale());
  }, []);

  return (
    <div className="flex w-full min-w-0 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)]">
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await setLocale(loc);
              setCurrent(loc);
              onSelect?.();
              window.location.reload();
            });
          }}
          className={`flex flex-1 items-center justify-center py-2 text-[13px] font-semibold transition-all duration-150 ${
            loc === current
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          } ${isPending ? "opacity-50" : ""}`}
        >
          {labels[loc]}
        </button>
      ))}
    </div>
  );
}

function getCurrentLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const val = match?.[1] as Locale | undefined;
  return val && locales.includes(val) ? val : defaultLocale;
}
