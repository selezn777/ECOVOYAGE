"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

export type AccountingFilterPreserved = {
  tours: string;
  /** "1" = фильтр «все ещё открытые» на прошедших */
  openOnly?: string;
};

function buildAccountingHref(
  base: AccountingFilterPreserved & {
    q?: string;
    tour?: string;
  },
) {
  const p = new URLSearchParams();
  p.set("tours", base.tours || "today");
  const tour = base.tour?.trim() ?? "";
  const qq = base.q?.trim() ?? "";
  if (tour) p.set("tour", tour);
  else if (qq) p.set("q", qq);
  if (base.openOnly === "1") p.set("open", "1");
  return `/accounting?${p.toString()}`;
}

const FILTER_DEBOUNCE_MS = 320;

type Props = {
  tourNames: string[];
  q: string;
  tourExact: string;
  preserved: AccountingFilterPreserved;
  searchPlaceholder?: string;
  searchLabel?: string;
};

function nextFilterFromInput(raw: string, tourNames: string[]): { q: string; tour: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { q: "", tour: "" };
  const exactHit = tourNames.find((n) => n.toLowerCase() === trimmed.toLowerCase());
  if (exactHit) return { q: "", tour: exactHit };
  return { q: trimmed, tour: "" };
}

export function AccountingTourFilters({ tourNames, q, tourExact, preserved, searchPlaceholder = "Название тура…", searchLabel = "Поиск по турам" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const appliedText = tourExact || q;
  const [draft, setDraft] = useState(appliedText);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement === inputRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(appliedText);
  }, [appliedText]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const navigate = useCallback(
    (next: { q: string; tour?: string }) => {
      startTransition(() =>
        router.push(
          buildAccountingHref({
            ...preserved,
            q: next.q,
            tour: next.tour,
          }),
        ),
      );
    },
    [router, preserved],
  );

  const isSameAsApplied = useCallback(
    (next: { q: string; tour: string }) => {
      return next.tour === tourExact.trim() && next.q.trim() === q.trim();
    },
    [tourExact, q],
  );

  const applyFromDraft = useCallback(
    (raw: string) => {
      const next = nextFilterFromInput(raw, tourNames);
      if (isSameAsApplied(next)) return;
      navigate({ q: next.q, tour: next.tour });
      setOpen(false);
    },
    [navigate, tourNames, isSameAsApplied],
  );

  const scheduleApply = useCallback(
    (raw: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        applyFromDraft(raw);
      }, FILTER_DEBOUNCE_MS);
    },
    [applyFromDraft],
  );

  const suggestions = useMemo(() => {
    const t = draft.trim().toLowerCase();
    const list = t ? tourNames.filter((name) => name.toLowerCase().includes(t)) : tourNames;
    return list.slice(0, 12);
  }, [draft, tourNames]);

  const pickName = useCallback(
    (name: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setDraft(name);
      navigate({ q: "", tour: name });
      setOpen(false);
    },
    [navigate],
  );

  const clearFilters = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setDraft("");
    navigate({ q: "", tour: "" });
    setOpen(false);
  }, [navigate]);

  const hasFilter = Boolean(q.trim() || tourExact.trim());

  return (
    <div
      className={`mb-3 flex flex-col gap-2 border-b border-[var(--border)] pb-3 sm:flex-row sm:flex-wrap sm:items-end ${pending ? "opacity-70" : ""}`}
    >
      <div ref={wrapRef} className="relative min-w-0 flex-1">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">
          Поиск по турам
        </label>
        <div className="relative min-w-0">
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              setOpen(true);
              scheduleApply(v);
            }}
            onFocus={() => setOpen(true)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] shadow-sm outline-none ring-[var(--accent)]/25 focus:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                  debounceRef.current = null;
                }
                applyFromDraft(draft);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && tourNames.length > 0 && suggestions.length > 0 ? (
            <ul
              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg ring-1 ring-black/5"
              role="listbox"
            >
              {suggestions.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={name === tourExact}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--surface-soft)]"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => pickName(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {hasFilter ? (
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-soft)]"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}
