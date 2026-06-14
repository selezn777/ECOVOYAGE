"use client";

import { useState } from "react";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Mon=0
}

function diffDays(a: string, b: string) {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}

export function TourDateRangePicker({
  dateFrom,
  dateTo,
  minDate,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  minDate?: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = ymd(new Date());
  const min = minDate || today;

  const initial = dateFrom
    ? new Date(parseYmd(dateFrom).getFullYear(), parseYmd(dateFrom).getMonth())
    : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function tapDay(d: string) {
    if (d < min) return;
    if (!dateFrom || (dateFrom && dateTo && dateFrom !== dateTo)) {
      // Новый выбор — сбрасываем на один день
      onChange(d, d);
    } else if (dateFrom && dateFrom === dateTo) {
      // Уже один день — расширяем диапазон
      if (d === dateFrom) {
        // Тапнули тот же день — оставляем
        onChange(d, d);
      } else if (d > dateFrom) {
        onChange(dateFrom, d);
      } else {
        onChange(d, dateFrom);
      }
    } else {
      // Неожиданное состояние — начинаем заново
      onChange(d, d);
    }
  }

  const days = daysInMonth(viewYear, viewMonth);
  const firstDow = firstDayOfWeek(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("ru-RU", { month: "long", year: "numeric" });

  const totalDays = dateFrom && dateTo && dateFrom !== dateTo
    ? diffDays(dateFrom, dateTo) + 1
    : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]">
          ‹
        </button>
        <span className="text-sm font-semibold capitalize text-[var(--text)]">{monthName}</span>
        <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]">
          ›
        </button>
      </div>

      {/* Weekday labels */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-semibold text-[var(--muted2)]">{w}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const isStart = d === dateFrom;
          const isEnd = d === dateTo;
          const inRange = dateFrom && dateTo && d > dateFrom && d < dateTo;
          const disabled = d < min;
          const isToday = d === today;

          let cellClass = "flex h-9 items-center justify-center text-sm select-none ";
          if (disabled) {
            cellClass += "text-[var(--muted2)] cursor-not-allowed ";
          } else if (isStart || isEnd) {
            cellClass += "bg-[var(--accent)] text-white font-bold rounded-full cursor-pointer ";
          } else if (inRange) {
            cellClass += "bg-[var(--accent-soft)] text-[var(--accent)] cursor-pointer ";
          } else {
            cellClass += "text-[var(--text)] cursor-pointer hover:bg-[var(--surface-soft)] rounded-full ";
          }
          if (isToday && !isStart && !isEnd && !inRange) {
            cellClass += "ring-1 ring-[var(--accent)] rounded-full ";
          }

          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => tapDay(d)}
              className={cellClass}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-3 border-t border-[var(--border)] pt-2 text-center text-xs text-[var(--muted)]">
        {dateFrom ? (
          totalDays && totalDays > 1 ? (
            <span>
              {dateFrom} — {dateTo}{" "}
              <span className="ml-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                {totalDays} дня
              </span>
            </span>
          ) : dateFrom ? (
            <span>
              {dateFrom}{" "}
              <span className="ml-1 text-[var(--muted2)]">1 день</span>
            </span>
          ) : null
        ) : (
          <span>Нажмите на день чтобы выбрать дату</span>
        )}
      </div>

      {/* Quick reset */}
      {dateFrom && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="mt-2 w-full rounded-lg py-1 text-xs text-[var(--muted)] hover:text-red-400"
        >
          Сбросить дату
        </button>
      )}
    </div>
  );
}
