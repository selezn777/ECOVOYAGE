"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
// onTourSelectHrefPattern prop kept for API compatibility but no longer used (pickTour now applies filter)

export type DashboardFilterPreserved = {
  view: string;
  month?: string;
  cal?: string;
  day?: string;
  range?: string;
};

function buildDashboardHref(
  base: DashboardFilterPreserved & {
    q?: string;
    tour?: string;
  },
  pathname: string = "/dashboard"
) {
  const p = new URLSearchParams();
  p.set("view", base.view);
  if (base.month) p.set("month", base.month);
  if (base.cal) p.set("cal", base.cal);
  if (base.day) p.set("day", base.day);
  if (base.range) p.set("range", base.range);
  const tour = base.tour?.trim() ?? "";
  const qq = base.q?.trim() ?? "";
  if (tour) p.set("tour", tour);
  else if (qq) p.set("q", qq);
  return `${pathname}?${p.toString()}`;
}

export type UpcomingTour = {
  id: string;
  name: string;
  dateLabel: string;
  booked: number;
  capacity: number;
};

type Props = {
  upcomingTours: UpcomingTour[];
  q: string;
  tourExact: string;
  preserved: DashboardFilterPreserved;
  title?: string;
  hint?: string | null;
  onTourSelectHrefPattern?: string;
};

function nextFilterFromInput(raw: string, tours: UpcomingTour[]): { q: string; tour: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { q: "", tour: "" };
  const exactHit = tours.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (exactHit) return { q: "", tour: exactHit.name };
  return { q: trimmed, tour: "" };
}

export function DashboardTourFilters({
  upcomingTours,
  q,
  tourExact,
  preserved,
  title = "Поиск по названию тура",
  hint = "Сужает список ниже: введите часть названия или выберите из подсказок, затем «Найти».",
  onTourSelectHrefPattern = "/tours/[id]",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const appliedText = tourExact || q;
  const [draft, setDraft] = useState(appliedText);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Не перетираем строку во время ввода, пока поле в фокусе (ответ сервера может отставать). */
  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) return;
    setDraft(appliedText);
  }, [appliedText]);

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const navigate = useCallback(
    (next: { q: string; tour?: string }) => {
      startTransition(() =>
        router.push(
          buildDashboardHref({
            ...preserved,
            q: next.q,
            tour: next.tour,
          }, pathname),
        ),
      );
    },
    [router, pathname, preserved],
  );

  const isSameAsApplied = useCallback(
    (next: { q: string; tour: string }) => {
      return next.tour === tourExact.trim() && next.q.trim() === q.trim();
    },
    [tourExact, q],
  );

  const applyFromDraft = useCallback(
    (raw: string) => {
      const next = nextFilterFromInput(raw, upcomingTours);
      if (isSameAsApplied(next)) return;
      navigate({ q: next.q, tour: next.tour });
      setOpen(false);
    },
    [navigate, upcomingTours, isSameAsApplied],
  );

  const suggestions = useMemo(() => {
    const t = draft.trim().toLowerCase();
    const list = t
      ? upcomingTours.filter((tour) => tour.name.toLowerCase().includes(t))
      : upcomingTours;
    return list.slice(0, 15);
  }, [draft, upcomingTours]);

  const pickTour = useCallback(
    (tour: UpcomingTour) => {
      setDraft(tour.name);
      setOpen(false);
      navigate({ q: "", tour: tour.name });
    },
    [navigate],
  );

  const clearFilters = useCallback(() => {
    setDraft("");
    navigate({ q: "", tour: "" });
    setOpen(false);
  }, [navigate]);

  const hasFilter = Boolean(q.trim() || tourExact.trim());

  return (
    <div
      className={`rounded-xl border border-[var(--border)]/80 bg-[var(--surface-soft)]/90 p-3 shadow-[var(--shadow-sm)] dark:bg-[var(--surface-elevated)]/50 ${pending ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-2">
        <div ref={wrapRef} className="relative min-w-0">
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Название тура…"
            aria-label="Поиск по турам"
            className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--text)] outline-none ring-[var(--accent)]/25 transition-shadow focus:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFromDraft(draft);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && upcomingTours.length > 0 && suggestions.length > 0 ? (
            <ul
              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-[var(--shadow-lg)] ring-1 ring-black/5"
              role="listbox"
            >
              {suggestions.map((tour) => (
                <li key={tour.id}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-soft)]"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onTouchStart={(ev) => ev.preventDefault()}
                    onClick={() => pickTour(tour)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">
                      {tour.dateLabel} · {tour.name}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--muted)]">
                      {tour.booked}/{tour.capacity || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex gap-2">
          {hasFilter ? (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary min-h-[44px] flex-1 rounded-xl text-[13px] font-semibold"
            >
              Сбросить
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => applyFromDraft(draft)}
            className={`min-h-[44px] rounded-xl bg-[var(--accent)] px-4 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(255,90,55,0.28)] transition-opacity hover:opacity-90 active:opacity-80 ${hasFilter ? "flex-1" : "w-full"}`}
          >
            Найти
          </button>
        </div>
      </div>
      <div className="pb-3" />
    </div>
  );
}
