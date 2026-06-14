"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd } from "@/lib/format";
import type { ManagerRosterFinanceSummary } from "@/lib/types";

function CommissionEditor({ manager }: { manager: ManagerRosterFinanceSummary }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(manager.commissionPercent));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setErr(null);
    const t = value.trim();
    const pct = t === "" ? null : Number(t.replace(",", "."));
    if (t !== "" && (pct === null || isNaN(pct) || pct < 0 || pct > 100)) {
      setErr("0-100");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(manager.id)}/manager-sales-commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent: pct }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setErr(j.error ?? `Ошибка ${res.status}`);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1 text-[12px] font-semibold tabular-nums ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
      >
        {manager.commissionPercent}%
        <span className="text-[10px] text-[var(--muted2)]">изм.</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="field-surface w-16 rounded-lg px-2 py-1 text-[12px] tabular-nums"
        placeholder="12"
        disabled={saving}
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setOpen(false); }}
      />
      <span className="text-[11px] text-[var(--muted)]">%</span>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
      >
        {saving ? "…" : "OK"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg px-1.5 py-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        ✕
      </button>
      {err ? <span className="text-[11px] text-red-600">{err}</span> : null}
    </div>
  );
}

export function ChiefManagerRosterPanel({
  managers,
  payoutDay,
}: {
  managers: ManagerRosterFinanceSummary[];
  payoutDay: number;
}) {
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? managers.filter((m) => m.fullName.toLowerCase().includes(q.trim().toLowerCase()))
    : managers;

  const totalOutstanding = managers.reduce((s, m) => s + m.outstandingVnd, 0);
  const totalCommission = managers.reduce((s, m) => s + m.commissionEstimateVnd, 0);

  return (
    <section className="mb-3">
      {/* Сводка */}
      <div className="card mb-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
          Менеджеры · выплата {payoutDay}-го числа
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">На руках у всех</div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {formatVnd(totalOutstanding)}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Комиссия (оценка)</div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatVnd(totalCommission)}
            </div>
          </div>
        </div>
      </div>

      {/* Поиск */}
      <div className="mb-2 px-0.5">
        <input
          type="search"
          placeholder="Поиск менеджера…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="field-surface w-full rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="card text-sm text-[var(--muted)]">Нет менеджеров.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => (
            <li key={m.id} className="card">
              {/* Шапка карточки */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-[var(--text)]">{m.fullName}</div>
                  {m.rentalPointName ? (
                    <div className="mt-0.5 text-[11px] text-[var(--muted2)]">📍 {m.rentalPointName}</div>
                  ) : null}
                </div>
                <Link
                  href={`/team/${m.id}`}
                  className="shrink-0 rounded-xl bg-[var(--surface-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--accent)] ring-1 ring-[var(--border)] no-underline hover:bg-[var(--surface-elevated)]"
                >
                  Карточка
                </Link>
              </div>

              {/* Метрики */}
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5 ring-1 ring-[var(--border)]">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-[var(--muted2)]">Броней (мес.)</div>
                  <div className="mt-0.5 text-[13px] font-bold tabular-nums">{m.bookingsMonth}</div>
                  <div className="text-[9px] text-[var(--muted2)]">всего {m.bookingsAllTime}</div>
                </div>
                <div className="rounded-lg bg-amber-50/80 px-2 py-1.5 ring-1 ring-amber-200/60 dark:bg-amber-950/30 dark:ring-amber-800/40">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">На руках</div>
                  <div className="mt-0.5 text-[11px] font-bold tabular-nums text-amber-800 dark:text-amber-300">
                    {formatVnd(m.outstandingVnd)}
                  </div>
                  <div className="text-[9px] text-[var(--muted2)]">сдано {formatVnd(m.handedAllTimeVnd)}</div>
                </div>
                <div className="rounded-lg bg-emerald-50/60 px-2 py-1.5 ring-1 ring-emerald-200/50 dark:bg-emerald-950/20 dark:ring-emerald-800/30">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Комиссия ≈</div>
                  <div className="mt-0.5 text-[11px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                    {formatVnd(m.commissionEstimateVnd)}
                  </div>
                  <div className="text-[9px] text-[var(--muted2)]">принято {formatVnd(m.receivedAllTimeVnd)}</div>
                </div>
              </div>

              {/* % комиссии */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--muted2)]">%:</span>
                <CommissionEditor manager={m} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
