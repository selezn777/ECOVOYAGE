"use client";

import { useEffect, useMemo, useState } from "react";
import { formatYmdWithWeekdayRu, localDateString } from "@/lib/scheduling";
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
  const invalidRange = rangeDays.length > 3;

  if (!selected) {
    return <p className="text-sm text-[var(--muted)]">Менеджеры не найдены.</p>;
  }

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
      setErrorText("Выберите день или диапазон 1-3 дня в календаре.");
      return;
    }
    if (invalidRange) {
      setErrorText("Максимум 3 дня за одно назначение.");
      return;
    }
    if (blockedByOff.length > 0) {
      setErrorText(`У менеджера выходной на: ${blockedByOff.join(", ")}.`);
      return;
    }
    if (mode === "point" && !pointId) {
      setErrorText("Выберите точку продаж.");
      return;
    }
    if (mode === "point" && blockedByPoint.length > 0) {
      setErrorText(`Точка занята на даты: ${blockedByPoint.join(", ")}.`);
      return;
    }
    if (mode === "promo" && promoPlace.trim().length < 2) {
      setErrorText("Укажите место проведения промо.");
      return;
    }
    if (mode === "online" && onlineChannel.trim().length < 2) {
      setErrorText("Укажите канал трафика для онлайн.");
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
      if (!res.ok) throw new Error(j.error || "Не удалось сохранить назначение.");
      setOkText(`Назначение сохранено (${(j.days ?? rangeDays).length} дн.).`);
      setTimeout(() => window.location.reload(), 350);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs">
        <span className="mb-1 block text-[var(--muted2)]">Сотрудник</span>
        <select
          className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          value={selected.id}
          onChange={(e) => setManagerId(e.target.value)}
          aria-label="Сотрудник для назначения точки"
        >
          {salesStaff.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </label>

      <div className="text-[11px] text-[var(--muted)]">
        {selected.offToday ? "Сегодня выходной" : "Сегодня в работе"} · Выходных в плане: {selectedOffDays.size}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["point", "promo", "online"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`btn-secondary !min-h-[36px] !rounded-xl !px-3 ${mode === m ? "ring-2 ring-[var(--accent)]" : ""}`}
          >
            {m === "point" ? "Точка" : m === "promo" ? "Промо" : "Онлайн"}
          </button>
        ))}
      </div>

      {mode === "point" ? (
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--muted2)]">Точка продаж</span>
          <select
            value={pointId}
            onChange={(e) => setPointId(e.target.value)}
            className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          >
            <option value="">Выберите точку</option>
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
          <span className="mb-1 block text-[var(--muted2)]">Где проводил промо</span>
          <input
            value={promoPlace}
            onChange={(e) => setPromoPlace(e.target.value)}
            placeholder="Например: Vincom Plaza, стойка у входа"
            className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>
      ) : null}

      {mode === "online" ? (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--muted2)]">Канал трафика</span>
            <input
              value={onlineChannel}
              onChange={(e) => setOnlineChannel(e.target.value)}
              placeholder="Instagram / Telegram / WhatsApp и т.п."
              className="field-surface min-h-[44px] w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="text-xs text-[var(--muted2)]">Источник трафика</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn-secondary !min-h-[34px] !px-3 ${onlineTrafficSource === "own" ? "ring-2 ring-[var(--accent)]" : ""}`}
              onClick={() => setOnlineTrafficSource("own")}
            >
              Свой
            </button>
            <button
              type="button"
              className={`btn-secondary !min-h-[34px] !px-3 ${onlineTrafficSource === "office" ? "ring-2 ring-[var(--accent)]" : ""}`}
              onClick={() => setOnlineTrafficSource("office")}
            >
              Офисный
            </button>
          </div>
        </div>
      ) : null}

      <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="btn-secondary !min-h-[32px] !px-2" onClick={() => shiftMonth(-1)}>
            ◀
          </button>
          <div className="text-sm font-semibold">
            {new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          </div>
          <button type="button" className="btn-secondary !min-h-[32px] !px-2" onClick={() => shiftMonth(1)}>
            ▶
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-[var(--muted2)]">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
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
                title={`${formatYmdWithWeekdayRu(d)}${
                  isOff
                    ? " · выходной"
                    : isAssignedAny
                      ? assignmentIsPoint
                        ? ` · уже назначен на точку${assignment?.pointName ? `: ${assignment.pointName}` : ""}`
                        : assignmentIsPromo
                          ? " · уже назначен в промо"
                          : " · уже назначен онлайн"
                      : isBusyPoint
                        ? " · точка занята"
                        : ""
                }`}
              >
                {d.slice(-2)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Выберите диапазон 1-3 дня. Жёлтый — выходной, красный — точка занята, синий/фиолетовый/зелёный —
          уже назначенная работа сотрудника (точка/промо/онлайн).
        </p>
      </div>
      {rangePreview ? (
        <p className="text-xs text-[var(--text)]">
          Выбрано: {formatYmdWithWeekdayRu(rangePreview.from)} - {formatYmdWithWeekdayRu(rangePreview.to)} ({rangeDays.length} дн.)
        </p>
      ) : null}
      <button type="button" onClick={() => void savePlan()} disabled={busy} className="btn-primary w-full rounded-xl px-4 py-2">
        {busy ? "Сохранение..." : "Сохранить назначение"}
      </button>
      {errorText ? <p className="text-xs text-red-600">{errorText}</p> : null}
      {okText ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{okText}</p> : null}
      {mode === "online" ? (
        <p className="text-[11px] text-[var(--muted)]">
          Для отчёта фиксируем канал и источник трафика: офисный трафик учитывается отдельно для вычета рекламных затрат.
        </p>
      ) : null}
    </div>
  );
}

