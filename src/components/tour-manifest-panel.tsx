"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TourManifest, TourManifestAbsence } from "@/lib/types";
import { formatIsoLocalWithWeekdayRu } from "@/lib/scheduling";

export type TourManifestBookingBrief = {
  id: string;
  customerName: string;
  hotel: string;
  adults: number;
  children: number;
  infants: number;
};

type AbsenceLine = {
  bookingId: string;
  absentAdults: number;
  absentChildren: number;
  absentInfants: number;
  note: string;
};

/** Порядок броней как в списке, но каждый bookingId только один раз (дубликаты в данных ломали UI). */
function uniqueBookingsInOrder(bookingList: TourManifestBookingBrief[]): TourManifestBookingBrief[] {
  const seen = new Set<string>();
  return bookingList.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

function buildLinesFromBookings(
  bookingList: TourManifestBookingBrief[],
  saved: TourManifestAbsence[],
): AbsenceLine[] {
  return uniqueBookingsInOrder(bookingList).map((b) => {
    const ex = saved.find((a) => a.bookingId === b.id);
    return {
      bookingId: b.id,
      absentAdults: ex?.absentAdults ?? 0,
      absentChildren: ex?.absentChildren ?? 0,
      absentInfants: ex?.absentInfants ?? 0,
      note: ex?.note ?? "",
    };
  });
}

/** Убирает повторы и id, которых уже нет в списке броней. */
function normalizeVisibleBookingIds(
  ids: string[],
  bookingList: TourManifestBookingBrief[],
): string[] {
  const valid = new Set(uniqueBookingsInOrder(bookingList).map((b) => b.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Какие брони показываем карточками: только те, по которым уже есть неявки в данных (без автоподстановки первой брони). */
function initialVisibleBookingIds(
  bookingList: TourManifestBookingBrief[],
  saved: TourManifestAbsence[],
): string[] {
  const unique = uniqueBookingsInOrder(bookingList);
  const orderedIds = unique.map((b) => b.id);
  const withData = new Set(
    saved
      .filter(
        (a) =>
          a.absentAdults + a.absentChildren + a.absentInfants > 0 || (a.note ?? "").trim().length > 0,
      )
      .map((a) => a.bookingId),
  );
  if (withData.size > 0) {
    return orderedIds.filter((id) => withData.has(id));
  }
  return [];
}

function hasSavedAbsenceData(saved: TourManifestAbsence[]): boolean {
  return saved.some(
    (a) =>
      a.absentAdults + a.absentChildren + a.absentInfants > 0 || (a.note ?? "").trim().length > 0,
  );
}

function absenceLinesSignature(lines: AbsenceLine[]): string {
  return [...lines]
    .sort((a, b) => a.bookingId.localeCompare(b.bookingId))
    .map(
      (l) =>
        `${l.bookingId}:${l.absentAdults}:${l.absentChildren}:${l.absentInfants}:${(l.note ?? "").trim()}`,
    )
    .join("|");
}

function parseQty(s: string): number {
  const n = parseInt(s.replace(/\s/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 999) : 0;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

export type TourManifestEditMode = "full" | "none";

export function TourManifestPanel({
  tourId,
  expectedPax,
  bookings,
  initialManifest,
  initialAbsences,
  editMode,
  canAckReview = false,
}: {
  tourId: string;
  expectedPax: number;
  bookings: TourManifestBookingBrief[];
  initialManifest: TourManifest | null;
  initialAbsences: TourManifestAbsence[];
  editMode: TourManifestEditMode;
  /** Бухгалтерия / руководство: снять флаг «на проверке» */
  canAckReview?: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<AbsenceLine[]>(() => buildLinesFromBookings(bookings, initialAbsences));
  const [visibleBookingIds, setVisibleBookingIds] = useState<string[]>(() =>
    normalizeVisibleBookingIds(initialVisibleBookingIds(bookings, initialAbsences), bookings),
  );
  const [rumStr, setRumStr] = useState(() => (initialManifest != null ? String(initialManifest.rumBottles) : ""));
  const [colaStr, setColaStr] = useState(() => (initialManifest != null ? String(initialManifest.colaBottles) : ""));
  const [waterStr, setWaterStr] = useState(() => (initialManifest != null ? String(initialManifest.waterBottles) : ""));
  const [rainStr, setRainStr] = useState(() => (initialManifest != null ? String(initialManifest.raincoatsQty) : ""));
  const [busy, setBusy] = useState(false);
  /** Для гида на туре блок сразу развёрнут - это основной экран на выезде. */
  const [collapsed, setCollapsed] = useState(editMode !== "full");
  /** true - свёрнуто (после сохранения и при открытии страницы); false - ввод неявок. */
  const [noShowsHidden, setNoShowsHidden] = useState(true);

  const bookingsUnique = useMemo(() => uniqueBookingsInOrder(bookings), [bookings]);
  const bookingById = useMemo(
    () => new Map(bookingsUnique.map((b) => [b.id, b])),
    [bookingsUnique],
  );
  const bookingSig = useMemo(
    () =>
      bookingsUnique.map((b) => `${b.id}:${b.adults}:${b.children}:${b.infants}:${b.hotel}:${b.customerName}`).join("|"),
    [bookingsUnique],
  );

  useEffect(() => {
    setLines(buildLinesFromBookings(bookings, initialAbsences));
    setVisibleBookingIds(normalizeVisibleBookingIds(initialVisibleBookingIds(bookings, initialAbsences), bookings));
    setRumStr(initialManifest != null ? String(initialManifest.rumBottles) : "");
    setColaStr(initialManifest != null ? String(initialManifest.colaBottles) : "");
    setWaterStr(initialManifest != null ? String(initialManifest.waterBottles) : "");
    setRainStr(initialManifest != null ? String(initialManifest.raincoatsQty) : "");
    setNoShowsHidden(true);
  }, [tourId, initialManifest, initialAbsences, bookingSig, bookings]);

  const absentTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (Number(l.absentAdults) || 0) + (Number(l.absentChildren) || 0) + (Number(l.absentInfants) || 0),
        0,
      ),
    [lines],
  );

  /** Сколько поехало: по брони минус неявки (если неявок нет - все записанные). */
  const computedActualPax = useMemo(
    () => Math.max(0, expectedPax - absentTotal),
    [expectedPax, absentTotal],
  );

  const absentTotalSaved = useMemo(
    () =>
      initialAbsences.reduce(
        (s, a) => s + a.absentAdults + a.absentChildren + a.absentInfants,
        0,
      ),
    [initialAbsences],
  );

  /** Снимок неявок с сервера - чтобы шапка совпадала с SSR и не ломала гидрацию, пока гид не менял карточки. */
  const baselineAbsenceLines = useMemo(
    () => buildLinesFromBookings(bookings, initialAbsences),
    [bookingSig, initialAbsences, bookings],
  );

  const linesDirtyVsServer = useMemo(
    () => absenceLinesSignature(lines) !== absenceLinesSignature(baselineAbsenceLines),
    [lines, baselineAbsenceLines],
  );

  const headerAbsentTotal = editMode === "full" ? absentTotal : absentTotalSaved;

  function showNoShowsForm() {
    setNoShowsHidden(false);
  }

  function addVisibleBooking(bookingId: string) {
    if (!bookingId) return;
    setVisibleBookingIds((ids) => normalizeVisibleBookingIds(ids.includes(bookingId) ? ids : [...ids, bookingId], bookings));
  }

  function removeVisibleBooking(bookingId: string) {
    setVisibleBookingIds((ids) =>
      normalizeVisibleBookingIds(
        ids.filter((id) => id !== bookingId),
        bookings,
      ),
    );
    setLines((prev) =>
      prev.map((l) =>
        l.bookingId === bookingId ? { ...l, absentAdults: 0, absentChildren: 0, absentInfants: 0, note: "" } : l,
      ),
    );
  }

  const addableBookings = useMemo(
    () => bookingsUnique.filter((b) => !visibleBookingIds.includes(b.id)),
    [bookingsUnique, visibleBookingIds],
  );
  const canAddAnotherBooking = addableBookings.length > 0;

  const visibleResolvedIds = useMemo(() => {
    const deduped = normalizeVisibleBookingIds(visibleBookingIds, bookings);
    return deduped.filter((id) => lines.some((row) => row.bookingId === id));
  }, [visibleBookingIds, lines, bookings]);

  async function save() {
    const actualPax = Math.max(0, expectedPax - absentTotal);
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/manifest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualPax,
          rumBottles: parseQty(rumStr),
          colaBottles: parseQty(colaStr),
          waterBottles: parseQty(waterStr),
          raincoatsQty: parseQty(rainStr),
          comment: null,
          absences: lines
            .filter(
              (l) =>
                (Number(l.absentAdults) || 0) + (Number(l.absentChildren) || 0) + (Number(l.absentInfants) || 0) > 0,
            )
            .map((l) => ({
              bookingId: l.bookingId,
              absentAdults: Math.max(0, Number(l.absentAdults) || 0),
              absentChildren: Math.max(0, Number(l.absentChildren) || 0),
              absentInfants: Math.max(0, Number(l.absentInfants) || 0),
              note: l.note.trim() || null,
            })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : j.error && typeof j.error === "object" && "formErrors" in j.error
              ? "Проверьте поля формы"
              : "Не удалось сохранить";
        alert(msg);
        return;
      }
      setNoShowsHidden(true);
      router.refresh();
    } catch {
      alert("Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  const hasReport = initialManifest != null;
  /**
   * Шапка: при первом показе с уже сохранённым учётом - число из БД (как на сервере), чтобы не было hydration mismatch.
   * После изменения неявок - живой расчёт (бронь − неявки).
   */
  const displayActualPaxInHeader = (() => {
    if (editMode !== "full") {
      return hasReport ? initialManifest!.actualPax : null;
    }
    if (hasReport && !linesDirtyVsServer) {
      return initialManifest!.actualPax;
    }
    return computedActualPax;
  })();

  async function ackReview() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/manifest/ack-review`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Не удалось отметить");
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
    <div
      className="mt-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
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
      <div
        className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted2)]">Учёт на туре</p>
      </div>

      {!collapsed ? <div className="p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">По брони</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text)]">
              {expectedPax}
            </div>
            <div className="text-[11px] text-[var(--muted)]">чел. записано</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">Поехало с вами</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
              {displayActualPaxInHeader != null ? displayActualPaxInHeader : "-"}
            </div>
                <div className="text-[11px] text-[var(--muted)]">по учёту гида</div>
          </div>
        </div>
        {hasReport && headerAbsentTotal > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-amber-50">
            <span>Не вышли: </span>
            <span className="font-semibold">{headerAbsentTotal}</span>{" "}
            <span>чел.</span>
          </div>
        ) : null}

      {hasReport ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]">Склад: </span>
          ром {initialManifest!.rumBottles} · кола {initialManifest!.colaBottles} · вода {initialManifest!.waterBottles}{" "}
          бут. · дождевики {initialManifest!.raincoatsQty} шт.
        </div>
      ) : null}

      {hasReport && initialManifest!.submittedAt ? (
        <p className="mt-1 text-xs text-[var(--muted2)]">
          Обновлено: {formatIsoLocalWithWeekdayRu(initialManifest!.submittedAt)}
          {initialManifest!.submittedByName ? ` · ${initialManifest!.submittedByName}` : null}
        </p>
      ) : null}

      {initialManifest?.needsAccountantReview ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-amber-50 px-2 py-2 text-[11px] leading-snug text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-950/25 dark:text-amber-50 dark:ring-amber-800/50">
          <span>{canAckReview ? "Проверьте учёт и нажмите «Проверено»." : "Учёт на проверке."}</span>
          {canAckReview ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void ackReview()}
              className="self-start rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Проверено
            </button>
          ) : null}
        </div>
      ) : null}

      {editMode === "full" ? (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <p className="mb-2 text-xs font-medium text-[var(--muted2)]">Со склада (бут. / шт.)</p>
            <div className="grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">Ром (бут.)</span>
                <input
                  className="field-surface rounded-xl px-2 py-2 text-sm"
                  inputMode="numeric"
                  value={rumStr}
                  onChange={(e) => setRumStr(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">Кола (бут.)</span>
                <input
                  className="field-surface rounded-xl px-2 py-2 text-sm"
                  inputMode="numeric"
                  value={colaStr}
                  onChange={(e) => setColaStr(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">Вода (бут.)</span>
                <input
                  className="field-surface rounded-xl px-2 py-2 text-sm"
                  inputMode="numeric"
                  value={waterStr}
                  onChange={(e) => setWaterStr(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--muted)]">Дождевики</span>
                <input
                  className="field-surface rounded-xl px-2 py-2 text-sm"
                  inputMode="numeric"
                  value={rainStr}
                  onChange={(e) => setRainStr(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  disabled={busy}
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--muted2)]">Кто не поехал</p>
              {bookingsUnique.length === 0 ? null : (
                noShowsHidden ? (
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => showNoShowsForm()}
                  >
                    Добавить неявку
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-soft)] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => setNoShowsHidden(true)}
                  >
                    Свернуть
                  </button>
                )
              )}
            </div>
            {bookingsUnique.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Нет броней.</p>
            ) : noShowsHidden ? null : (
              <div className="space-y-3">
                {bookingsUnique.length > 0 && canAddAnotherBooking ? (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-[var(--muted2)]">
                      Выберите отель / бронь - затем откроется карточка
                    </span>
                    <select
                      key={visibleBookingIds.join(",")}
                      className="field-surface w-full rounded-xl px-3 py-2.5 text-sm"
                      disabled={busy}
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) addVisibleBooking(id);
                      }}
                    >
                      <option value="">Выберите…</option>
                      {addableBookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.hotel?.trim() || "Отель не указан"} · {b.customerName} ({b.adults}/{b.children}/{b.infants})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <ul className="space-y-3">
                {visibleResolvedIds.map((bookingId) => {
                  const l = lines.find((row) => row.bookingId === bookingId)!;
                  const b = bookingById.get(l.bookingId);
                  const pax = b ? `${b.adults}/${b.children}/${b.infants}` : "?";
                  const maxA = b?.adults ?? 0;
                  const maxC = b?.children ?? 0;
                  const maxI = b?.infants ?? 0;
                  return (
                    <li
                      key={l.bookingId}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Отель</p>
                          <p className="mt-0.5 font-medium text-[var(--text)]">{b?.hotel ?? "-"}</p>
                          <p className="text-[var(--muted)]">{b?.customerName ?? "-"}</p>
                          <p className="mt-0.5 text-[var(--muted2)]">В брони взр./дет./мл.: {pax}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
                          disabled={busy}
                          onClick={() => removeVisibleBooking(l.bookingId)}
                        >
                          Убрать
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <label className="flex items-center gap-2">
                          <span className="w-8 text-[var(--text)]">Взр.</span>
                          <input
                            inputMode="numeric"
                            placeholder="0"
                            className="field-surface w-16 rounded-lg px-2 py-1.5 text-sm tabular-nums placeholder:text-[var(--muted2)]"
                            value={String(l.absentAdults)}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(maxA, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0));
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.bookingId === l.bookingId ? { ...row, absentAdults: n } : row,
                                ),
                              );
                            }}
                            disabled={busy}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="w-8 text-[var(--text)]">Дет.</span>
                          <input
                            inputMode="numeric"
                            placeholder="0"
                            className="field-surface w-16 rounded-lg px-2 py-1.5 text-sm tabular-nums placeholder:text-[var(--muted2)]"
                            value={String(l.absentChildren)}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(maxC, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0));
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.bookingId === l.bookingId ? { ...row, absentChildren: n } : row,
                                ),
                              );
                            }}
                            disabled={busy}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="w-8 text-[var(--text)]">Мл.</span>
                          <input
                            inputMode="numeric"
                            placeholder="0"
                            className="field-surface w-16 rounded-lg px-2 py-1.5 text-sm tabular-nums placeholder:text-[var(--muted2)]"
                            value={String(l.absentInfants)}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(maxI, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0));
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.bookingId === l.bookingId ? { ...row, absentInfants: n } : row,
                                ),
                              );
                            }}
                            disabled={busy}
                          />
                        </label>
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-[11px] font-medium text-[var(--text)]">Комментарий</span>
                        <textarea
                          className="field-surface min-h-[2.75rem] w-full rounded-xl px-3 py-2 text-sm placeholder:text-[var(--muted2)]"
                          placeholder="Почему не вышли?"
                          value={l.note}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.bookingId === l.bookingId ? { ...row, note: e.target.value } : row,
                              ),
                            )
                          }
                          disabled={busy}
                          rows={2}
                        />
                      </label>
                    </li>
                  );
                })}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="btn-primary w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {busy ? "…" : "Сохранить учёт"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
          {initialAbsences.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Невыходы не отмечены.</p>
          ) : (
            <ul className="space-y-2">
              {initialAbsences.map((a) => {
                const b = bookingById.get(a.bookingId);
                const t = a.absentAdults + a.absentChildren + a.absentInfants;
                if (t <= 0) return null;
                return (
                  <li
                    key={a.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-sm"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">{b?.hotel || "-"}</div>
                    <div className="font-semibold text-[var(--text)]">{b?.customerName}</div>
                    <div className="mt-1 text-[var(--text)]">
                      Не вышли:{" "}
                      {a.absentAdults ? `${a.absentAdults} взр.` : ""}
                      {a.absentChildren ? ` ${a.absentChildren} дет.` : ""}
                      {a.absentInfants ? ` ${a.absentInfants} мл.` : ""}
                    </div>
                    {a.note ? (
                      <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
                        <span className="font-medium text-[var(--text)]">Комментарий гида: </span>
                        {a.note}
                      </p>
                    ) : null}
                    {a.refundExecutionNote ? (
                      <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs">
                        <span className="font-medium text-[var(--text)]">Возврат (бухгалтерия): </span>
                        {a.refundExecutionNote}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      </div> : null}
    </div>
  );
}
