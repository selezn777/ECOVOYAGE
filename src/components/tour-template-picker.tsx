"use client";

import { useRef, useState } from "react";

export type TemplateSummary = {
  id: string;
  name: string;
  priceCurrency?: "USD" | "VND";
  defaultPriceUsd?: number | null;
  defaultPriceVnd?: number;
  tourType?: "group" | "private";
  pickupFrom?: string | null;
};

export function TourTemplatePicker({
  templates,
  selectedId,
  onSelect,
  onClear,
}: {
  templates: TemplateSummary[];
  selectedId: string;
  onSelect: (t: TemplateSummary) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const filtered = query.trim()
    ? templates.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : templates;

  function pick(t: TemplateSummary) {
    onSelect(t);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onClear();
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 text-left transition hover:bg-[var(--surface-elevated)]"
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <span className="block truncate font-medium text-[var(--text)]">{selected.name}</span>
          ) : (
            <span className="text-[var(--muted)]">Выбрать шаблон тура…</span>
          )}
        </span>
        <svg className="ml-2 h-4 w-4 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 20 20">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      {/* Search — клавиатура только при явном тапе */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 20 20">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
        />
        <button
          type="button"
          onClick={() => { setOpen(false); setQuery(""); }}
          className="shrink-0 rounded-lg p-1 text-[var(--muted)] hover:text-[var(--text)]"
        >
          ✕
        </button>
      </div>

      {/* Список шаблонов */}
      <div className="max-h-[55vh] overflow-y-auto overscroll-contain">
        {selected && (
          <button
            type="button"
            onClick={clear}
            className="flex w-full items-center gap-2 border-b border-[var(--border)] px-4 py-3 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          >
            <span className="text-red-400">✕</span>
            Без шаблона
          </button>
        )}
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Ничего не найдено</p>
        ) : (
          filtered.map((t) => {
            const active = t.id === selectedId;
            const price = t.priceCurrency === "USD" && t.defaultPriceUsd
              ? `${t.defaultPriceUsd}$`
              : t.defaultPriceVnd
                ? `${Math.round(t.defaultPriceVnd / 1000)}k`
                : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition ${
                  active
                    ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                    : "text-[var(--text)] hover:bg-[var(--surface-soft)]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {price && <span className="text-xs text-[var(--muted)]">{price}</span>}
                  {t.pickupFrom && (
                    <span className="text-xs text-[var(--muted)]">{t.pickupFrom.slice(0, 5)}</span>
                  )}
                  {active && <span className="text-[var(--accent)]">✓</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
