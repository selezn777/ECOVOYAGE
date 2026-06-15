"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { managerWorkModeToggleClass } from "@/lib/manager-work-mode-ui";
import { salesDayKind, salesStatusCellClass, type SalesDayAssignment } from "@/lib/sales-point-status-ui";
import type { ManagerSalesPointStatus } from "@/lib/types";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";

export type ProfileWeekScheduleDay = { ymd: string; assignment?: SalesDayAssignment; isOff: boolean };

export function ProfileManagerSalesPointCard({
  initial,
  managerId,
  weekSchedule,
}: {
  initial: ManagerSalesPointStatus;
  managerId: string;
  weekSchedule?: ProfileWeekScheduleDay[];
}) {
  const t = useTranslations("profile");
  const tM = useTranslations("manager");
  const tSales = useTranslations("salesPointsPage");
  const locale = useLocale();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const today = tourBusinessTodayYmd();

  const weekdayShort = (ymd: string) => {
    const dt = new Date(`${ymd}T00:00:00`);
    const intlLocale = locale === "ru" ? "ru-RU" : locale === "vi" ? "vi-VN" : "en-GB";
    return new Intl.DateTimeFormat(intlLocale, { weekday: "short" }).format(dt);
  };

  const dayLabel = (day: ProfileWeekScheduleDay) => {
    const kind = salesDayKind(day.assignment, day.isOff);
    switch (kind) {
      case "point":
        return day.assignment?.pointName || tSales("pointFallbackName");
      case "promo":
        return tSales("weekGrid.shortPromo");
      case "online":
        return tSales("weekGrid.shortOnline");
      case "off":
        return tSales("weekGrid.shortOff");
      default:
        return tSales("weekGrid.shortFree");
    }
  };

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

      {weekSchedule && weekSchedule.length > 0 ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <h3 className="text-xs font-semibold text-[var(--muted2)]">{t("weekSchedule.title")}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{t("weekSchedule.hint")}</p>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {weekSchedule.map((day) => {
              const kind = salesDayKind(day.assignment, day.isOff);
              return (
                <div key={day.ymd} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] uppercase text-[var(--muted2)]">{weekdayShort(day.ymd)}</span>
                  <span
                    className={`${salesStatusCellClass(kind)} truncate ${day.ymd === today ? "ring-2 ring-[var(--accent)]" : ""}`}
                    title={day.assignment?.pointName ?? undefined}
                  >
                    {dayLabel(day)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
