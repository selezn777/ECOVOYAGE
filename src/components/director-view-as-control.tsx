"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@/lib/types";

export function DirectorViewAsControl({ effectiveRole }: { effectiveRole: Role }) {
  const t = useTranslations("director");
  const [busy, setBusy] = useState(false);

  type OptionValue = "" | "chief_manager" | "manager" | "chief_guide" | "guide" | "dispatcher" | "booking_dispatcher" | "accountant";
  const OPTIONS: { value: OptionValue; label: string }[] = [
    { value: "", label: t("roleDirector") },
    { value: "chief_manager", label: t("roleChiefManager") },
    { value: "manager", label: t("roleManager") },
    { value: "chief_guide", label: t("roleChiefGuide") },
    { value: "guide", label: t("roleGuide") },
    { value: "dispatcher", label: t("roleDispatcher") },
    { value: "booking_dispatcher", label: t("roleBookingDispatcher") },
    { value: "accountant", label: t("roleAccountant") },
  ];

  const current =
    effectiveRole === "director"
      ? ""
      : (OPTIONS.find((o) => o.value === effectiveRole)?.value ?? "");

  async function switchTo(next: (typeof OPTIONS)[number]["value"]) {
    if (next === current || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/director-view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: next === "" ? null : next }),
        credentials: "same-origin",
      });
      if (res.ok) window.location.href = "/dashboard";
    } finally {
      setBusy(false);
    }
  }

  const currentLabel = OPTIONS.find((o) => o.value === current)?.label ?? t("roleDirector");

  return (
    <>
      {/* Mobile: компактный бейдж-селектор роли */}
      <div className="md:hidden w-full">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-3 py-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-dark)]">
            {t("roleLabel")}
          </span>
          <select
            value={current}
            onChange={(e) => void switchTo(e.target.value as (typeof OPTIONS)[number]["value"])}
            disabled={busy}
            className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-semibold text-[var(--text)] outline-none"
            aria-label={t("switchLabel")}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none shrink-0 text-[var(--accent-dark)]" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </label>
      </div>

      {/* Desktop md+: таббар как основная навигация */}
      <div className="hidden md:flex top-nav-shell w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] divide-x divide-[var(--border)]">
        {OPTIONS.map((o) => {
          const active = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => void switchTo(o.value)}
              className={`top-nav-link flex-1 basis-0 min-w-0 disabled:opacity-50 ${active ? "top-nav-link--active" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
