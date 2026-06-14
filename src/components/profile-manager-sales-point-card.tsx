"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { managerWorkModeToggleClass } from "@/lib/manager-work-mode-ui";
import type { ManagerSalesPointStatus } from "@/lib/types";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";

export function ProfileManagerSalesPointCard({ initial, managerId }: { initial: ManagerSalesPointStatus; managerId: string }) {
  const t = useTranslations("profile");
  const tM = useTranslations("manager");
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const today = tourBusinessTodayYmd();

  const MODE_LABEL: Record<"point" | "promo" | "online", string> = {
    point: t("modePoint"),
    promo: t("modePromo"),
    online: t("modeOnline"),
  };

  async function setMode(mode: "point" | "promo" | "online") {
    if (busy || state.todayWorkMode === mode) return;
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/managers/work-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ managerId, mode }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : tM("couldNotSave"));
      setState((prev) => ({ ...prev, todayWorkMode: mode, openedToday: mode === "point" }));
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : tM("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3">
      <h2 className="text-base font-semibold text-[var(--text)]">{t("salesPointTitle")}</h2>
      {state.pointId ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("salesPointAssigned")} <span className="font-semibold text-[var(--text)]">{state.pointName || t("salesPointNoName")}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("salesPointNotAssigned")}
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--muted2)]">{formatYmdWithWeekdayRu(today)}</p>
      <div className="action-row mt-3">
        {(["point", "promo", "online"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={busy || (mode === "point" && !state.pointId)}
            onClick={() => void setMode(mode)}
            className={`${managerWorkModeToggleClass(state.todayWorkMode === mode)} disabled:opacity-50`}
          >
            {MODE_LABEL[mode]}
          </button>
        ))}
      </div>
      {errorText ? <p className="mt-1.5 text-[11px] text-red-600">{errorText}</p> : null}
      <p className="mt-2 text-xs text-[var(--muted)]">{t("currentMode")} {MODE_LABEL[state.todayWorkMode]}</p>
    </section>
  );
}
