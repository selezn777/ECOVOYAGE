"use client";

import { useTranslations, useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { formatMonthYearLong, formatYmdWithWeekday, localDateString } from "@/lib/scheduling";
import type { RosterUser } from "@/lib/types";

export function SalesPointAssignmentPanel({
  salesStaff,
  managerDaysOffById,
  pointBusyDays,
  managerAssignmentsByDay,
}: {
  salesStaff: RosterUser[];
  managerDaysOffById: Record<string, string[]>;
  pointBusyDays: Record<string, string[]>;
  managerAssignmentsByDay: Record<
    string,
    Record<string, { mode: "point" | "promo" | "online"; pointId: string | null; pointName: string | null }>
  >;
}) {
  const [managerId, setManagerId] = useState<string>(salesStaff[0]?.id ?? "");
  const [mode, setMode] = useState<"point" | "promo" | "online">("point");
  const [pointId, setPointId] = useState("");
  const [promoPlace, setPromoPlace] = useState("");
  const [onlineChannel, setOnlineChannel] = useState("");
  const [onlineTrafficSource, setOnlineTrafficSource] = useState<"own" | "office">("own");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [okText, setOkText] = useState<string | null>(null);
  const [points, setPoints] = useState<Array<{ id: string; name: string }>>([]);
  const [monthKey, setMonthKey] = useState(() => localDateString().slice(0, 7));
  const [dayFrom, setDayFrom] = useState("");
  const [dayTo, setDayTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);

  const t = useTranslations("salesPointsPage");
  const tc = useTranslations("common");
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/rental-points");
      const j = (await res.json().catch(() => ({}))) as { points?: Array<{ id: string; name: string }> };
      if (!cancelled) setPoints(Array.isArray(j.points) ? j.points : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => salesStaff.find((r) => r.id === managerId) ?? salesStaff[0] ?? null,
    [salesStaff, managerId],
  );
  const selectedOffDays = selected ? new Set(managerDaysOffById[selected.id] ?? []) : new Set<string>();
  const selectedAssignments = selected ? managerAssignmentsByDay[selected.id] ?? {} : {};

  const rangePreview = useMemo(() => {
    if (!dayFrom) return null;
    if (!dayTo) return { from: dayFrom, to: dayFrom };
    return dayFrom <= dayTo ? { from: dayFrom, to: dayTo } : { from: dayTo, to: dayFrom };
  }, [dayFrom, dayTo]);

  const rangeDays = useMemo(() => {
    if (!rangePreview) return [];
    const out: string[] = [];
    const cur = new Date(`${rangePreview.from}T00:00:00`);
    const end = new Date(`${rangePreview.to}T00:00:00`);
    while (cur.getTime() <= end.getTime()) {
      out.push(localDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [rangePreview]);

  const selectedPointBusy = useMemo(() => new Set(pointId ? pointBusyDays[pointId] ?? [] : []), [pointId, pointBusyDays]);

  const blockedByOff = rangeDays.filter((d) => selectedOffDays.has(d));
  const blockedByPoint = mode === "point" ? rangeDays.filter((d) => selectedPointBusy.has(d)) : [];
  const invalidRange = rangeDays.length > 14;

  function shiftMonth(delta: number) {
    const [y, m] = monthKey.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1 + delta, 1);
    setMonthKey(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthDays = useMemo(() => {
    const [yy, mm] = monthKey.split("-").map(Number);
    const first = new Date(yy, (mm || 1) - 1, 1);
    const firstWeekdayMon0 = (first.getDay() + 6) % 7;
    const total = new Date(yy, mm || 1, 0).getDate();
    const out: string[] = [];
    for (let i = 0; i < firstWeekdayMon0; i += 1) out.push("");
    for (let d = 1; d <= total; d += 1) out.push(`${monthKey}-${String(d).padStart(2, "0")}`);
    while (out.length % 7 !== 0) out.push("");
    return out;
  }, [monthKey]);

  if (!selected) {
    return <p className="text-sm text-[var(--muted)]">{t("assignment.noManagersFound")}</p>;
  }

  function pickDay(d: string) {
    if (!d) return;
    if (!dayFrom || (dayFrom && dayTo)) {
      setDayFrom(d);
      setDayTo("");
      return;
    }
    setDayTo(d);
  }

  async function savePlan() {
    if (!selected) return;
    setErrorText(null);
    setOkText(null);
    if (!rangePreview) {
      setErrorText(t("assignment.errors.selectDayOrRange"));
      return;
    }
    if (invalidRange) {
      setErrorText(t("assignment.errors.maxThreeDays"));
      return;
    }
    if (blockedByOff.length > 0) {
      setErrorText(t("assignment.errors.dayOffOn", { days: blockedByOff.join(", ") }));
      return;
    }
    if (mode === "point" && !pointId) {
      setErrorText(t("assignment.errors.selectPoint"));
      return;
    }
    if (mode === "point" && blockedByPoint.length > 0) {
      setErrorText(t("assignment.errors.pointBusyOn", { days: blockedByPoint.join(", ") }));
      return;
    }
    if (mode === "promo" && promoPlace.trim().length < 2) {
      setErrorText(t("assignment.errors.specifyPromoPlace"));
      return;
    }
    if (mode === "online" && onlineChannel.trim().length < 2) {
      setErrorText(t("assignment.errors.specifyTrafficChannel"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/managers/work-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerId: selected.id,
          mode,
          dayFrom: rangePreview.from,
          dayTo: rangePreview.to,
          pointId: mode === "point" ? pointId : null,
          promoPlace: mode === "promo" ? promoPlace.trim() : undefined,
          onlineChannel: mode === "online" ? onlineChannel.trim() : undefined,
          onlineTrafficSource: mode === "online" ? onlineTrafficSource : undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; days?: string[] };
      if (!res.ok) throw new Error(j.error || t("assignment.couldNotSaveAssignment"));
      setOkText(t("assignment.savedAssignment", { n: (j.days ?? rangeDays).length }));
      setTimeout(() => window.location.reload(), 350);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs">
        <span className="mb-1 block text-[var(--muted2)]">{t("assignment.employeeLabel")}</span>
        <select
          className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          value={selected.id}
          onChange={(e) => setManagerId(e.target.value)}
          aria-label={t("assignment.employeeAria")}
        >
          {salesStaff.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </label>

      <div className="text-[11px] text-[var(--muted)]">
        {selected.offToday ? t("assignment.todayDayOff") : t("assignment.todayWorking")} · {t("assignment.plannedDaysOff")} {selectedOffDays.size}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["point", "promo", "online"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`btn-secondary !min-h-[36px] !rounded-xl !px-3 ${mode === m ? "ring-2 ring-[var(--accent)]" : ""}`}
          >
            {m === "point" ? t("modes.point") : m === "promo" ? t("modes.promo") : t("modes.online")}
          </button>
        ))}
      </div>

      {mode === "point" ? (
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--muted2)]">{t("assignment.pointSelectLabel")}</span>
          <select
            value={pointId}
            onChange={(e) => setPointId(e.target.value)}
            className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          >
            <option value="">{t("assignment.pointSelectOption")}</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === "promo" ? (
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--muted2)]">{t("assignment.promoPlaceLabel")}</span>
          <input
            value={promoPlace}
            onChange={(e) => setPromoPlace(e.target.value)}
            placeholder={t("assignment.promoPlacePlaceholder")}
            className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      {mode === "online" ? (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--muted2)]">{t("assignment.channelLabel")}</span>
            <input
              value={onlineChannel}
              onChange={(e) => setOnlineChannel(e.target.value)}
              placeholder={t("assignment.channelPlaceholder")}
              className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="text-xs text-[var(--muted2)]">{t("assignment.trafficSourceLabel")}</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn-secondary !min-h-[34px] !px-3 ${onlineTrafficSource === "own" ? "ring-2 ring-[var(--accent)]" : ""}`}
              onClick={() => setOnlineTrafficSource("own")}
            >
              {t("logRow.trafficOwn")}
            </button>
            <button
              type="button"
              className={`btn-secondary !min-h-[34px] !px-3 ${onlineTrafficSource === "office" ? "ring-2 ring-[var(--accent)]" : ""}`}
              onClick={() => setOnlineTrafficSource("office")}
            >
              {t("logRow.trafficOffice")}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowCalendar((v) => !v)}
        className="text-xs font-medium text-[var(--accent)]"
      >
        {showCalendar ? t("assignment.hideCalendar") : t("assignment.showCalendar")}
      </button>
      {showCalendar ? (
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="btn-secondary !min-h-[32px] !px-2" onClick={() => shiftMonth(-1)}>
              ◀
            </button>
            <div className="text-sm font-semibold">
              {formatMonthYearLong(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), locale)}
            </div>
            <button type="button" className="btn-secondary !min-h-[32px] !px-2" onClick={() => shiftMonth(1)}>
              ▶
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-[var(--muted2)]">
            {(t.raw("assignment.weekdaysShort") as string[]).map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d, idx) => {
              if (!d) return <div key={`b-${idx}`} className="h-9" />;
              const inRange = rangePreview ? d >= rangePreview.from && d <= rangePreview.to : false;
              const isOff = selectedOffDays.has(d);
              const isBusyPoint = mode === "point" && selectedPointBusy.has(d);
              const assignment = selectedAssignments[d];
              const isAssignedAny = Boolean(assignment);
              const assignmentIsPoint = assignment?.mode === "point";
              const assignmentIsPromo = assignment?.mode === "promo";
              const assignmentIsOnline = assignment?.mode === "online";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`h-9 rounded-lg text-xs ${
                    inRange
                      ? "bg-[var(--accent)] text-white"
                      : isOff
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                        : assignmentIsPoint
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
                          : assignmentIsPromo
                            ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-200"
                            : assignmentIsOnline
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                        : isBusyPoint
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                          : "bg-[var(--surface)] text-[var(--text)]"
                  }`}
                  title={
                    isOff
                      ? t("assignment.tooltipDayOff", { weekday: formatYmdWithWeekday(d, locale) })
                      : `${formatYmdWithWeekday(d, locale)}${
                          isAssignedAny
                            ? assignmentIsPoint
                              ? ` · ${t("assignment.tooltipAlreadyPoint")}${assignment?.pointName ? `: ${assignment.pointName}` : ""}`
                              : assignmentIsPromo
                                ? ` · ${t("assignment.tooltipAlreadyPromo")}`
                                : ` · ${t("assignment.tooltipAlreadyOnline")}`
                            : isBusyPoint
                              ? ` · ${t("assignment.tooltipPointBusy")}`
                              : ""
                        }`
                  }
                >
                  {d.slice(-2)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">{t("assignment.legendHint")}</p>
        </div>
      ) : null}
      {rangePreview ? (
        <p className="text-xs text-[var(--text)]">
          {t("assignment.selectedRange", {
            from: formatYmdWithWeekday(rangePreview.from, locale),
            to: formatYmdWithWeekday(rangePreview.to, locale),
            n: rangeDays.length,
          })}
        </p>
      ) : null}
      <button type="button" onClick={() => void savePlan()} disabled={busy} className="btn-primary w-full rounded-xl px-4 py-2">
        {busy ? tc("saving") : t("assignment.saveButton")}
      </button>
      {errorText ? <p className="text-xs text-red-600">{errorText}</p> : null}
      {okText ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{okText}</p> : null}
      {mode === "online" ? (
        <p className="text-[11px] text-[var(--muted)]">{t("assignment.onlineHint")}</p>
      ) : null}
    </div>
  );
}
