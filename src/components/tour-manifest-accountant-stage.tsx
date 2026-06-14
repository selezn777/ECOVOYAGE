"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TourManifestAbsence } from "@/lib/types";

type BookingBrief = {
  id: string;
  customerName: string;
  hotel: string;
  adults: number;
  children: number;
  infants: number;
};

function paxLine(a: number, c: number, i: number) {
  const parts: string[] = [];
  if (a) parts.push(`${a} взр.`);
  if (c) parts.push(`${c} дет.`);
  if (i) parts.push(`${i} мл.`);
  return parts.join(", ") || "0";
}

export function TourManifestAccountantStage({
  tourId,
  expectedPax,
  actualPax,
  bookings,
  absences,
}: {
  tourId: string;
  expectedPax: number;
  actualPax: number;
  bookings: BookingBrief[];
  absences: TourManifestAbsence[];
}) {
  const router = useRouter();
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const significant = useMemo(
    () => absences.filter((a) => a.absentAdults + a.absentChildren + a.absentInfants > 0),
    [absences],
  );

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const a of absences) {
      const t = a.absentAdults + a.absentChildren + a.absentInfants;
      if (t <= 0) continue;
      next[a.bookingId] = a.refundExecutionNote ?? "";
    }
    setNotes(next);
  }, [tourId, absences]);

  async function save() {
    setBusy(true);
    try {
      const items = significant.map((a) => ({
        bookingId: a.bookingId,
        refundExecutionNote: notes[a.bookingId] ?? "",
      }));
      const res = await fetch(`/api/tours/${tourId}/manifest/refund-notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Не удалось сохранить");
        return;
      }
      router.refresh();
    } catch {
      alert("Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Бухгалтерия · второй этап
        </p>
        <p className="mt-1 text-sm text-[var(--text)]">
          Сверка «записано / поехало» и фиксация, как сделан возврат по каждой неявке.
        </p>
      </div>

      <div className="p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">1. По брони</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{expectedPax}</div>
            <div className="text-xs text-[var(--muted)]">человек записано</div>
          </div>
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
            <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-900/80 dark:text-emerald-200/90">
              2. Поехало
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{actualPax}</div>
            <div className="text-xs text-[var(--muted)]">по учёту гида</div>
          </div>
        </div>

        {bookings.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              Карточки на туре
            </p>
            <ul className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-xs ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="rounded-lg border border-[var(--border)]/80 bg-[var(--surface-soft)]/60 px-3 py-2 dark:bg-[var(--surface-elevated)]/20"
                >
                  <div className="font-medium text-[var(--text)]">{b.customerName}</div>
                  <div className="mt-0.5 text-[var(--muted)]">{b.hotel || "-"}</div>
                  <div className="mt-1 tabular-nums text-[var(--muted2)]">
                    В/Д/М: {b.adults}/{b.children}/{b.infants}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {significant.length === 0 ? (
          <p className="mt-4 rounded-xl bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--muted)]">
            Невыходов нет - заполнять возвраты не нужно.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              Неявки - как выполнен возврат
            </p>
            <ul className="space-y-3">
              {significant.map((a) => {
                const b = bookingById.get(a.bookingId);
                return (
                  <li
                    key={a.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 shadow-[var(--shadow-sm)]"
                  >
                    <div className="text-xs font-semibold text-[var(--text)]">{b?.hotel || "-"}</div>
                    <div className="text-sm font-medium text-[var(--text)]">{b?.customerName ?? "-"}</div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      В брони: {b ? paxLine(b.adults, b.children, b.infants) : "-"} · Не поехало:{" "}
                      {paxLine(a.absentAdults, a.absentChildren, a.absentInfants)}
                    </p>
                    {a.note ? (
                      <p className="mt-2 rounded-lg bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
                        <span className="font-medium text-[var(--text)]">Гид: </span>
                        {a.note}
                      </p>
                    ) : null}
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] font-medium text-[var(--muted2)]">
                        Комментарий: как выполнен возврат денег
                      </span>
                      <textarea
                        className="field-surface min-h-[5rem] w-full rounded-xl px-3 py-2 text-sm"
                        placeholder="Например: перевод на карту, наличные в офисе, перенос на другой тур, отказ от возврата по договорённости…"
                        value={notes[a.bookingId] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [a.bookingId]: e.target.value }))}
                        disabled={busy}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="btn-primary w-full rounded-xl py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {busy ? "Сохранение…" : "Сохранить комментарии по возвратам"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
