"use client";

import { useMemo, useState } from "react";
import { formatYmdWithWeekdayRu, minGuideSelfDayOffDate } from "@/lib/scheduling";

type Mode = "guide" | "manager";
type VisaRunRow = {
  id: string;
  mode: "manager" | "guide";
  cycleDays: 45 | 90;
  dayFrom: string;
  dayTo: string;
  createdAt: string;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

export function ProfileDaysOffPanel({
  mode,
  userId,
  initialDates,
  initialVisaRuns,
}: {
  mode: Mode;
  userId: string;
  initialDates: string[];
  initialVisaRuns: VisaRunRow[];
}) {
  const [dates, setDates] = useState<string[]>(initialDates);
  const [visaRuns, setVisaRuns] = useState<VisaRunRow[]>(initialVisaRuns);
  const [dayFrom, setDayFrom] = useState("");
  const [dayTo, setDayTo] = useState("");
  const [monthKey, setMonthKey] = useState(() => {
    const base = new Date();
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [visaFrom, setVisaFrom] = useState("");
  const [visaTo, setVisaTo] = useState("");
  const [visaCycleDays, setVisaCycleDays] = useState<45 | 90>(90);

  const isManager = mode === "manager";

  async function add() {
    const payload =
      dayFrom && dayTo
        ? dayFrom === dayTo
          ? { dayOff: dayFrom }
          : { dayFrom, dayTo }
        : dayFrom
          ? { dayOff: dayFrom }
          : null;
    if (!payload) return;
    setBusy(true);
    try {
      if (isManager) {
        const res = await fetch("/api/managers/days-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerId: userId, ...payload }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Не удалось сохранить");
      } else {
        const res = await fetch("/api/guides/days-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Не удалось сохранить");
      }
      const newDays = payload.dayOff
        ? [payload.dayOff]
        : (() => {
            const out: string[] = [];
            const cur = new Date(`${payload.dayFrom!}T00:00:00`);
            const to = new Date(`${payload.dayTo!}T00:00:00`);
            while (cur.getTime() <= to.getTime()) {
              const y = cur.getFullYear();
              const m = String(cur.getMonth() + 1).padStart(2, "0");
              const d = String(cur.getDate()).padStart(2, "0");
              out.push(`${y}-${m}-${d}`);
              cur.setDate(cur.getDate() + 1);
            }
            return out;
          })();
      setDates((d) => [...new Set([...d, ...newDays])].sort());
      setDayFrom("");
      setDayTo("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove(dayOff: string) {
    setBusy(true);
    try {
      if (isManager) {
        const res = await fetch(
          `/api/managers/days-off?managerId=${encodeURIComponent(userId)}&dayOff=${encodeURIComponent(dayOff)}`,
          { method: "DELETE" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Не удалось удалить");
      } else {
        const res = await fetch(`/api/guides/days-off?dayOff=${encodeURIComponent(dayOff)}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Не удалось удалить");
      }
      setDates((d) => d.filter((x) => x !== dayOff));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function addVisaRun() {
    if (!visaFrom || !visaTo) return;
    const from = visaFrom <= visaTo ? visaFrom : visaTo;
    const to = visaFrom <= visaTo ? visaTo : visaFrom;
    const cur = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    let len = 0;
    while (cur.getTime() <= end.getTime()) {
      len += 1;
      cur.setDate(cur.getDate() + 1);
    }
    if (len < 2 || len > 3) {
      alert("Для виза-рана выберите диапазон 2-3 дня.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/visa-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          cycleDays: visaCycleDays,
          dayFrom: from,
          dayTo: to,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось сохранить виза-ран.");
      const newId = typeof json.id === "string" ? json.id : null;
      if (newId) {
        setVisaRuns((prev) =>
          [...prev, { id: newId, mode, cycleDays: visaCycleDays, dayFrom: from, dayTo: to, createdAt: new Date().toISOString() }].sort(
            (a, b) => a.dayFrom.localeCompare(b.dayFrom),
          ),
        );
      }
      setVisaFrom("");
      setVisaTo("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function removeVisaRun(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/profile/visa-runs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось удалить.");
      setVisaRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const managerMin = new Date().toISOString().slice(0, 10);
  const guideMin = minGuideSelfDayOffDate();
  const minAllowed = isManager ? managerMin : guideMin;

  const rangePreview = useMemo(() => {
    if (!dayFrom) return null;
    if (!dayTo) return { from: dayFrom, to: dayFrom };
    const a = dayFrom <= dayTo ? dayFrom : dayTo;
    const b = dayFrom <= dayTo ? dayTo : dayFrom;
    return { from: a, to: b };
  }, [dayFrom, dayTo]);

  const monthDays = useMemo(() => {
    const [yy, mm] = monthKey.split("-").map(Number);
    const first = new Date(yy, (mm || 1) - 1, 1);
    const firstWeekdayMon0 = (first.getDay() + 6) % 7;
    const total = new Date(yy, mm || 1, 0).getDate();
    const out: string[] = [];
    for (let i = 0; i < firstWeekdayMon0; i += 1) out.push("");
    for (let d = 1; d <= total; d += 1) {
      out.push(`${monthKey}-${String(d).padStart(2, "0")}`);
    }
    while (out.length % 7 !== 0) out.push("");
    return out;
  }, [monthKey]);

  function shiftMonth(delta: number) {
    const [yy, mm] = monthKey.split("-").map(Number);
    const dt = new Date(yy, (mm || 1) - 1 + delta, 1);
    setMonthKey(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  function pickRangeDay(ymd: string) {
    if (!ymd || ymd < minAllowed || busy) return;
    if (!dayFrom) {
      setDayFrom(ymd);
      setDayTo("");
      return;
    }
    if (!dayTo) {
      if (ymd === dayFrom) {
        setDayTo(dayFrom);
      } else {
        setDayTo(ymd);
      }
      return;
    }
    setDayFrom(ymd);
    setDayTo("");
  }

  return (
    <section
      className="card space-y-3"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setCollapsed((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCollapsed((v) => !v);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{isManager ? "Мои выходные (менеджер)" : "Мои выходные (гид)"}</h2>
        <span className="text-xs font-medium text-[var(--muted2)]">{collapsed ? "Открыть" : "Свернуть"}</span>
      </div>
      {!collapsed && !isManager ? (
        <p className="text-xs text-[var(--muted)]">
          Первый доступный день - не раньше чем через 3 календарных дня (нельзя взять выходной «на завтра»).
        </p>
      ) : null}
      {!collapsed ? (
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="btn-secondary !min-h-[32px] !rounded-lg !px-2.5 text-xs"
              onClick={() => shiftMonth(-1)}
              disabled={busy}
            >
              ◀
            </button>
            <div className="text-sm font-semibold capitalize">
              {new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </div>
            <button
              type="button"
              className="btn-secondary !min-h-[32px] !rounded-lg !px-2.5 text-xs"
              onClick={() => shiftMonth(1)}
              disabled={busy}
            >
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
              if (!d) return <div key={`blank-${idx}`} className="h-9 rounded-lg bg-transparent" />;
              const disabled = d < minAllowed;
              const isStart = dayFrom === d;
              const isEnd = dayTo === d;
              const inRange = rangePreview ? d >= rangePreview.from && d <= rangePreview.to : false;
              const cls = disabled
                ? "bg-[var(--surface)] text-[var(--muted2)] opacity-55"
                : isStart || isEnd
                  ? "bg-[var(--accent)] text-white"
                  : inRange
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-elevated)]";
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => pickRangeDay(d)}
                  className={`h-9 rounded-lg text-sm font-medium ${cls}`}
                >
                  {d.slice(-2)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Нажмите 1 дату для одного выходного. Нажмите 2-ю дату — и выделится весь промежуток между ними.
          </p>
          {rangePreview ? (
            <p className="mt-1 text-xs text-[var(--text)]">
              Выбрано: {formatYmdWithWeekdayRu(rangePreview.from)} - {formatYmdWithWeekdayRu(rangePreview.to)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || !dayFrom}
          onClick={() => void add()}
          className="btn-primary shrink-0 rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
        >
          Добавить выходной
        </button>
      </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">Нажмите на блок, чтобы открыть календарь и добавить выходные.</p>
      )}
      <p className="text-xs text-[var(--muted)]">
        Дни с активными назначениями на туры/точки продаж не добавляются.
      </p>
      <ul className="space-y-1.5 text-sm">
        {dates.length === 0 ? (
          <li className="text-[var(--muted2)]">Нет запланированных выходных</li>
        ) : null}
        {dates.map((d) => (
          <li
            key={d}
            className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
          >
            <span className="min-w-0 truncate text-[var(--text)]" title={d}>
              {formatYmdWithWeekdayRu(d)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(d)}
              className="shrink-0 text-xs font-medium text-[var(--danger)] hover:underline"
            >
              Убрать
            </button>
          </li>
        ))}
      </ul>
      {!collapsed ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="text-sm font-semibold text-[var(--text)]">Виза-ран</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Цикл
              <select
                value={visaCycleDays}
                onChange={(e) => setVisaCycleDays(Number(e.target.value) as 45 | 90)}
                className="field-surface rounded-xl px-3 py-2 text-sm"
                disabled={busy}
              >
                <option value={45}>45 дней</option>
                <option value={90}>90 дней</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              С
              <input
                type="date"
                value={visaFrom}
                onChange={(e) => setVisaFrom(e.target.value)}
                className="field-surface rounded-xl px-3 py-2 text-sm"
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              По
              <input
                type="date"
                value={visaTo}
                onChange={(e) => setVisaTo(e.target.value)}
                className="field-surface rounded-xl px-3 py-2 text-sm"
                disabled={busy}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void addVisaRun()}
                disabled={busy || !visaFrom || !visaTo}
                className="btn-primary w-full rounded-xl px-3 py-2 text-sm disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {visaRuns.length === 0 ? <li className="text-[var(--muted2)]">Нет виза-ранов</li> : null}
            {visaRuns.map((r) => (
              <li
                key={r.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <span className="min-w-0 truncate text-[var(--text)]">
                  {r.cycleDays} дн. · {formatYmdWithWeekdayRu(r.dayFrom)} - {formatYmdWithWeekdayRu(r.dayTo)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeVisaRun(r.id)}
                  className="shrink-0 text-xs font-medium text-[var(--danger)] hover:underline"
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
