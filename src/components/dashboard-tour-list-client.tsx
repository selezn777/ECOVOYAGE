"use client";

import Link from "next/link";
import { useState, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatYmdWeekdayLongDmy } from "@/lib/scheduling";
import type { Tour } from "@/lib/types";
import type { Role } from "@/lib/types";

function isPartnerTour(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("катамар") ||
    n.includes("зиплайн") || n.includes("zip") ||
    n.includes("квадр") ||
    n.includes("круиз") ||
    n.includes("рыбалк")
  );
}

type TourNameGroup = { name: string; items: Tour[]; totalBooked: number };

function groupToursByName(tours: Tour[]): TourNameGroup[] {
  const nameMap = new Map<string, Tour[]>();
  for (const t of tours) {
    const arr = nameMap.get(t.name) ?? [];
    arr.push(t);
    nameMap.set(t.name, arr);
  }
  return [...nameMap.entries()]
    .map(([name, items]) => ({
      name,
      items: items.slice().sort((a, b) => (b.booked ?? 0) - (a.booked ?? 0)),
      totalBooked: items.reduce((s, t) => s + (t.booked ?? 0), 0),
    }))
    .sort((a, b) => {
      const ap = isPartnerTour(a.name) ? 1 : 0;
      const bp = isPartnerTour(b.name) ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return b.totalBooked - a.totalBooked || a.name.localeCompare(b.name, "ru");
    });
}

function groupToursByDate(tours: Tour[]): { date: string; nameGroups: TourNameGroup[] }[] {
  const order: string[] = [];
  const map = new Map<string, Tour[]>();
  for (const t of tours) {
    if (!map.has(t.date)) order.push(t.date);
    const arr = map.get(t.date) ?? [];
    arr.push(t);
    map.set(t.date, arr);
  }
  return order.map((date) => ({
    date,
    nameGroups: groupToursByName(map.get(date) ?? []),
  }));
}

function DispatcherStatusBadges({ tour, tDispatcher }: { tour: Tour; tDispatcher: (k: string) => string }) {
  const hasGuide = Boolean(tour.guideName && tour.guideName !== "Unassigned");
  const hasBus = (tour.busCount ?? 0) > 0;
  const hasBooking = tour.hasDispatcherBooking ?? false;

  const dot = (ok: boolean) => (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />
  );

  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted2)]">
        {dot(hasGuide)}<span>{tDispatcher("guide")}</span>
      </span>
      <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted2)]">
        {dot(hasBus)}<span>{tDispatcher("bus")}</span>
      </span>
      <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--muted2)]">
        {dot(hasBooking)}<span>{tDispatcher("booking")}</span>
      </span>
    </span>
  );
}

type Props = {
  tours: Tour[];
  initialQ?: string;
  viewerRole: Role;
};

export function DashboardTourListClient({ tours, initialQ = "", viewerRole }: Props) {
  const isDispatcher = viewerRole === "dispatcher" || viewerRole === "booking_dispatcher";
  const tDashboard = useTranslations("dashboard");
  const tDispatcher = useTranslations("dispatcher");
  const [query, setQuery] = useState(initialQ);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) return tours;
    return tours.filter((t) => t.name.toLowerCase().includes(trimmed));
  }, [tours, trimmed]);

  const suggestions = useMemo(() => {
    const names = [...new Set(tours.map((t) => t.name))];
    if (!trimmed) return [];
    return names.filter((n) => n.toLowerCase().includes(trimmed)).slice(0, 8);
  }, [tours, trimmed]);

  const grouped = useMemo(() => groupToursByDate(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Поиск ── */}
      <div className="relative" ref={wrapRef}>
        <div className="relative flex items-center">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]"
            fill="none"
            aria-hidden
          >
            <path
              d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16ZM19 19l-4.35-4.35"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder={tDashboard("search")}
            aria-label={tDashboard("search")}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm font-medium text-[var(--text)] shadow-[var(--shadow-sm)] outline-none ring-[var(--accent)]/30 transition-all placeholder:text-[var(--muted2)] focus:border-[var(--accent)]/50 focus:ring-2 focus:shadow-[var(--shadow-md)]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--muted2)] hover:text-[var(--text)] transition-colors"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                <path d="M12 4 4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Dropdown подсказок */}
        {showDropdown && suggestions.length > 0 ? (
          <ul className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-[var(--shadow-lg)]">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setQuery(name); setShowDropdown(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-[var(--surface-soft)] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="font-medium text-[var(--text)]">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── Список туров ── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {trimmed ? tDashboard("searchNotFound", { query }) : tDashboard("notFound")}
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.date} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            {/* Заголовок дня */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--accent)] px-4 py-2.5">
              <span className="text-sm font-bold leading-snug tracking-wide text-white">
                {formatYmdWeekdayLongDmy(g.date)}
              </span>
              <span className="rounded-lg bg-white/25 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                {g.nameGroups.reduce((s, ng) => s + ng.items.length, 0)}
              </span>
            </div>

            {/* Туры дня */}
            <div>
              {g.nameGroups.map((ng, ngIdx) => (
                <div key={ng.name} className={ngIdx > 0 ? "border-t-2 border-[var(--border)]" : ""}>
                  {ng.items.map((tour, itemIdx) => {
                    const booked = tour.booked ?? 0;
                    const cap = tour.capacity ?? 0;
                    const free = cap > 0 ? cap - booked : null;
                    const full = cap > 0 && booked >= cap;
                    const almostFull = cap > 0 && !full && free !== null && free <= 3;
                    const paxColor = full
                      ? "text-red-600 dark:text-red-400"
                      : almostFull
                        ? "text-amber-600 dark:text-amber-400"
                        : booked > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-[var(--muted2)]";
                    const displayName = itemIdx === 0 ? tour.name : `${tour.name} (${itemIdx + 1})`;
                    const fillPct = cap > 0 ? Math.min(100, Math.round((booked / cap) * 100)) : 0;

                    return (
                      <Link
                        key={tour.id}
                        href={`/tours/${tour.id}`}
                        className={`group flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] active:bg-[var(--surface-elevated)]${itemIdx > 0 ? " border-t border-[var(--border)]" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold leading-snug text-[var(--text)]">
                            {displayName}
                          </span>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {tour.pickupWindow ? (
                              <span className="text-[11px] text-[var(--muted2)]">{tour.pickupWindow}</span>
                            ) : null}
                            {cap > 0 ? (
                              <div className="h-1 w-14 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                                <div
                                  className={`h-full rounded-full transition-all ${full ? "bg-red-500" : almostFull ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            ) : null}
                            {isDispatcher ? (
                              <DispatcherStatusBadges tour={tour} tDispatcher={tDispatcher} />
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`text-sm font-bold tabular-nums leading-none ${paxColor}`}>
                            {booked}
                            {cap > 0 ? <span className="font-normal text-[var(--muted2)]">/{cap}</span> : null}
                          </span>
                          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[var(--muted2)] transition-transform group-hover:translate-x-0.5" fill="none" aria-hidden>
                            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
