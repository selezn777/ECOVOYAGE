"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FullscreenImageLightbox } from "@/components/fullscreen-image-lightbox";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import type { RentalPointDetail } from "@/lib/types";
import { formatYmdWithWeekdayRu, tourDateHeaderPartsRu } from "@/lib/scheduling";
import { showConfirm } from "@/lib/ui-dialog";

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addOneMonthSameDayOrLast(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const nextMonthDate = new Date(y, month + 1, 0);
  const lastDay = nextMonthDate.getDate();
  const safeDay = Math.min(day, lastDay);
  return localYmd(new Date(y, month - 1 + 1, safeDay));
}

export function RentalPointDetailClient({ initial }: { initial: RentalPointDetail }) {
  const router = useRouter();
  const pointPhotoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pointPhotoLightboxOpen, setPointPhotoLightboxOpen] = useState(false);
  const [expensePhotoLightboxOpen, setExpensePhotoLightboxOpen] = useState(false);
  const [pointName, setPointName] = useState("");
  const [monthlyStr, setMonthlyStr] = useState("");
  const [nextRentDate, setNextRentDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [rentPaymentAmountStr, setRentPaymentAmountStr] = useState("");
  const [rentPaidOn, setRentPaidOn] = useState(() => localYmd(new Date()));
  const [rentPaymentNote, setRentPaymentNote] = useState("");
  const [expTitle, setExpTitle] = useState("");
  const [expAmountStr, setExpAmountStr] = useState("");
  const [expComment, setExpComment] = useState("");
  const [expPhotoFile, setExpPhotoFile] = useState<File | null>(null);
  const [expPhotoPreviewUrl, setExpPhotoPreviewUrl] = useState<string | null>(null);
  const [expDate, setExpDate] = useState(() => localYmd(new Date()));
  const [closedDate, setClosedDate] = useState(() => localYmd(new Date()));
  const [closedNote, setClosedNote] = useState("");

  useEffect(() => {
    if (!expPhotoFile) {
      setExpPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(expPhotoFile);
    setExpPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [expPhotoFile]);

  useEffect(() => {
    if (!expPhotoFile) setExpensePhotoLightboxOpen(false);
  }, [expPhotoFile]);

  useEffect(() => {
    setPointPhotoLightboxOpen(false);
  }, [initial.photoUrl]);

  useEffect(() => {
    setPointName(initial.name);
    setMonthlyStr(formatVndInput(initial.monthlyRentVnd));
    setNextRentDate(initial.nextRentPaymentDate ?? "");
    setAddress(initial.addressNote ?? "");
    setNotes(initial.notes ?? "");
  }, [
    initial.id,
    initial.name,
    initial.monthlyRentVnd,
    initial.nextRentPaymentDate,
    initial.addressNote,
    initial.notes,
    initial.updatedAt,
  ]);

  function onMonthlyStrChange(raw: string) {
    const s = formatVndInput(parseVndInput(raw));
    setMonthlyStr(s);
  }

  async function saveMeta() {
    setErr(null);
    const nameTrim = pointName.trim();
    if (!nameTrim) {
      setErr("Введите название точки.");
      return;
    }
    const rentVnd = parseVndInput(monthlyStr);
    setBusy(true);
    try {
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameTrim,
          monthlyRentVnd: rentVnd,
          nextRentPaymentDate: nextRentDate.trim() || null,
          addressNote: address.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deletePoint() {
    const ok = await showConfirm("Удалить точку продаж? Это действие необратимо.");
    if (!ok) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
        return;
      }
      router.push("/rentals");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "rental_point_photo");
      const up = await fetch("/api/uploads", { method: "POST", body: fd });
      const uj = (await up.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!up.ok || typeof uj.url !== "string") {
        setErr(typeof uj.error === "string" ? uj.error : "Загрузка не удалась");
        return;
      }
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: uj.url }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadExpenseAttachment(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", "rental_point_expense");
    fd.set("pointId", initial.id);
    const up = await fetch("/api/uploads", { method: "POST", body: fd });
    const uj = (await up.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!up.ok || typeof uj.url !== "string") {
      setErr(typeof uj.error === "string" ? uj.error : "Не удалось загрузить фото");
      return null;
    }
    return uj.url;
  }

  async function addExpense() {
    const amt = parseVndInput(expAmountStr);
    if (!expTitle.trim()) {
      setErr("Введите название расхода.");
      return;
    }
    if (amt < 1) {
      setErr("Введите сумму расхода больше 0.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
      setErr("Укажите корректную дату расхода.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      let attachmentUrl: string | null = null;
      if (expPhotoFile) {
        attachmentUrl = await uploadExpenseAttachment(expPhotoFile);
        if (!attachmentUrl) return;
      }
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd: amt,
          title: expTitle.trim(),
          expenseDate: expDate,
          note: expComment.trim() || undefined,
          attachmentUrl: attachmentUrl ?? undefined,
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const j = ct.includes("application/json")
        ? ((await res.json().catch(() => ({}))) as { error?: string })
        : ({} as { error?: string });
      if (!res.ok) {
        const textFallback = !ct.includes("application/json") ? await res.text().catch(() => "") : "";
        setErr(
          typeof j.error === "string" && j.error.trim()
            ? j.error
            : textFallback.trim()
              ? textFallback.trim().slice(0, 240)
              : `Ошибка ${res.status}`,
        );
      }
      else {
        setExpTitle("");
        setExpAmountStr("");
        setExpComment("");
        setExpPhotoFile(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addClosed() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}/closed-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closedDate,
          note: closedNote.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      else {
        setClosedNote("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addRentPayment() {
    const amountVnd = parseVndInput(rentPaymentAmountStr);
    if (amountVnd < 1) {
      setErr("Укажите сумму оплаты аренды больше 0.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rentPaidOn)) {
      setErr("Выберите дату оплаты аренды.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const nextByRule = addOneMonthSameDayOrLast(rentPaidOn);
      const res = await fetch(`/api/rental-points/${encodeURIComponent(initial.id)}/rent-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd,
          paidOn: rentPaidOn,
          note: rentPaymentNote.trim() || undefined,
          nextPaymentDate: nextByRule,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
      } else {
        setRentPaymentAmountStr("");
        setRentPaymentNote("");
        if (nextByRule) setNextRentDate(nextByRule);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      <section className="card">
        <h2 className="mb-2 text-base font-semibold">Карточка точки</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Название точки</span>
            <input
              className="field-surface rounded-xl px-3 py-2 text-sm"
              value={pointName}
              onChange={(e) => setPointName(e.target.value)}
              disabled={busy}
              placeholder="Например: Citadines"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Аренда в месяц, ₫ (точная сумма)</span>
            <input
              className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
              value={monthlyStr}
              onChange={(e) => onMonthlyStrChange(e.target.value)}
              disabled={busy}
              inputMode="numeric"
              placeholder="например 15.000.000"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Следующая дата оплаты аренды</span>
            <input
              type="date"
              className="field-surface rounded-xl px-3 py-2 text-sm"
              value={nextRentDate}
              onChange={(e) => setNextRentDate(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Адрес / ориентир</span>
            <input
              className="field-surface rounded-xl px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Заметки</span>
            <textarea
              className="field-surface min-h-[72px] rounded-xl px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            className="btn-primary min-h-[44px] w-full flex-1 disabled:opacity-50"
            disabled={busy}
            onClick={() => void saveMeta()}
          >
            Сохранить реквизиты
          </button>
          <button
            type="button"
            className="btn-secondary min-h-[44px] w-full flex-1 border-rose-500/40 bg-rose-500/[0.07] text-rose-800 hover:bg-rose-500/15 dark:border-rose-700/55 dark:bg-rose-950/35 dark:text-rose-200 disabled:opacity-50"
            disabled={busy}
            onClick={() => void deletePoint()}
          >
            Удалить точку
          </button>
        </div>

        <input
          ref={pointPhotoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadPhoto(f);
          }}
        />

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 p-3 ring-1 ring-[var(--border)]/60">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Фото точки</div>
          <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
            Снимок для диспетчера и шеф-менеджера. Загрузить или заменить — одной кнопкой; открыть — во весь экран или в новой
            вкладке.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="btn-secondary min-h-[44px] w-full shrink-0 px-4 disabled:opacity-50 sm:w-auto sm:min-w-[11rem]"
              disabled={busy}
              onClick={() => pointPhotoInputRef.current?.click()}
            >
              {initial.photoUrl ? "Заменить фото" : "Загрузить фото"}
            </button>
            {initial.photoUrl ? (
              <>
                <button
                  type="button"
                  className="btn-secondary min-h-[44px] w-full shrink-0 px-4 disabled:opacity-50 sm:w-auto sm:min-w-[9rem]"
                  disabled={busy}
                  onClick={() => setPointPhotoLightboxOpen(true)}
                >
                  Открыть
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-[44px] w-full shrink-0 px-4 disabled:opacity-50 sm:w-auto sm:min-w-[9rem]"
                  disabled={busy}
                  onClick={() => window.open(initial.photoUrl!, "_blank", "noopener,noreferrer")}
                >
                  В новой вкладке
                </button>
              </>
            ) : null}
          </div>
          {initial.photoUrl ? (
            <button
              type="button"
              className="mt-3 block w-full max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left ring-1 ring-black/5 transition hover:ring-[var(--accent)]/35 disabled:opacity-50"
              disabled={busy}
              onClick={() => setPointPhotoLightboxOpen(true)}
              aria-label="Открыть фото точки"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={initial.photoUrl}
                alt="Фото точки продаж"
                className="max-h-52 w-full object-cover"
              />
            </button>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted2)]">Фото ещё не загружено.</p>
          )}
        </div>

        <FullscreenImageLightbox
          src={initial.photoUrl}
          alt="Фото точки продаж"
          open={pointPhotoLightboxOpen && Boolean(initial.photoUrl)}
          onClose={() => setPointPhotoLightboxOpen(false)}
        />
      </section>

      <section className="card">
        <h2 className="mb-1 text-base font-semibold">Оплата аренды</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Фиксируйте факт оплаты и дату через календарь. Следующая дата автоматически сдвигается на этот же день следующего
          месяца.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Сумма оплаты, ₫</span>
            <input
              className="field-surface min-h-[44px] rounded-xl px-3 py-2 text-sm tabular-nums"
              value={rentPaymentAmountStr}
              onChange={(e) => setRentPaymentAmountStr(formatVndInput(parseVndInput(e.target.value)))}
              disabled={busy}
              inputMode="numeric"
              placeholder="например 15.000.000"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Дата оплаты</span>
            <input
              type="date"
              className="field-surface min-h-[44px] rounded-xl px-3 py-2 text-sm"
              value={rentPaidOn}
              onChange={(e) => setRentPaidOn(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Комментарий (необязательно)</span>
            <textarea
              className="field-surface min-h-[72px] rounded-xl px-3 py-2 text-sm"
              placeholder="Например: оплата за май, наличные"
              value={rentPaymentNote}
              onChange={(e) => setRentPaymentNote(e.target.value)}
              disabled={busy}
              maxLength={2000}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary mt-4 min-h-[44px] disabled:opacity-50"
          disabled={busy}
          onClick={() => void addRentPayment()}
        >
          Оплатить аренду
        </button>
        <ul className="mt-4 space-y-2">
          {initial.rentPayments.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
              Пока нет оплат аренды.
            </li>
          ) : (
            initial.rentPayments.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{formatYmdWithWeekdayRu(p.paidOn)}</div>
                  {p.note ? <p className="mt-1 text-sm text-[var(--muted)]">{p.note}</p> : null}
                </div>
                <div className="text-base font-semibold tabular-nums text-[var(--text)]">{formatVnd(p.amountVnd)}</div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="card border-l-4 border-l-amber-500/70">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Закрытые дни</h2>
          <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold tabular-nums text-[var(--text)] ring-1 ring-[var(--border)]">
            {initial.closedDaysCount} дн.
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Дата закрытого дня</span>
            <input
              type="date"
              className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
              value={closedDate}
              onChange={(e) => setClosedDate(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-50"
            disabled={busy}
            onClick={() => void addClosed()}
          >
            + Добавить закрытый день
          </button>
        </div>
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Причина (необязательно)</span>
          <input
            className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
            placeholder="Например: праздник, ремонт"
            value={closedNote}
            onChange={(e) => setClosedNote(e.target.value)}
            disabled={busy}
            maxLength={2000}
          />
        </label>

        <ul className="mt-4 space-y-2">
          {initial.closedDays.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
              Пока нет отмеченных дней.
            </li>
          ) : (
            initial.closedDays.map((d) => {
              const parts = tourDateHeaderPartsRu(d.closedDate);
              return (
                <li
                  key={d.id}
                  className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">
                      {parts ? (
                        <>
                          {capitalizeFirst(parts.weekdayLong)}, {parts.dmy}
                        </>
                      ) : (
                        d.closedDate
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(d.closedDate)}</div>
                    {d.note ? <p className="mt-1 text-sm text-[var(--muted)]">{d.note}</p> : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-1 text-base font-semibold">Расходы по точке</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">Итого зафиксировано: {formatVnd(initial.expensesTotalVnd)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Новый расход</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Название</span>
            <input
              className="field-surface min-h-[44px] rounded-xl px-3 py-2 text-sm"
              placeholder="Например: вода, уборка, мелкий ремонт"
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Сумма, ₫</span>
            <input
              className="field-surface min-h-[44px] rounded-xl px-3 py-2 text-sm tabular-nums"
              placeholder="0"
              value={expAmountStr}
              onChange={(e) => setExpAmountStr(formatVndInput(parseVndInput(e.target.value)))}
              disabled={busy}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted2)]">Дата расхода</span>
            <input
              type="date"
              className="field-surface min-h-[44px] rounded-xl px-3 py-2 text-sm"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              disabled={busy}
            />
          </label>
          {(() => {
            const parts = tourDateHeaderPartsRu(expDate);
            return parts ? (
              <p className="text-xs text-[var(--muted)] sm:col-span-2">
                В списке: <span className="font-medium text-[var(--text)]">{formatYmdWithWeekdayRu(expDate)}</span>
              </p>
            ) : null;
          })()}
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-[var(--muted2)]">Комментарий (необязательно)</span>
            <textarea
              className="field-surface min-h-[88px] rounded-xl px-3 py-2 text-sm"
              placeholder="Детали для бухгалтерии или себя"
              value={expComment}
              onChange={(e) => setExpComment(e.target.value)}
              disabled={busy}
              maxLength={2000}
            />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs text-[var(--muted2)]">Фото чека / накладной (необязательно)</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <label className="btn-secondary min-h-[44px] w-full cursor-pointer px-4 disabled:opacity-50 sm:w-auto">
                Выбрать файл
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    setExpPhotoFile(f);
                  }}
                />
              </label>
              {expPhotoFile ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary min-h-[44px] w-full px-4 disabled:opacity-50 sm:w-auto"
                    disabled={busy}
                    onClick={() => setExpensePhotoLightboxOpen(true)}
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    className="btn-secondary min-h-[44px] w-full border-rose-500/35 bg-rose-500/[0.06] px-4 text-rose-800 hover:bg-rose-500/12 dark:border-rose-700/45 dark:bg-rose-950/30 dark:text-rose-200 disabled:opacity-50 sm:w-auto"
                    disabled={busy}
                    onClick={() => setExpPhotoFile(null)}
                  >
                    Убрать
                  </button>
                </>
              ) : null}
            </div>
            {expPhotoPreviewUrl ? (
              <button
                type="button"
                className="mt-1 block max-w-xs overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left ring-1 ring-black/5 transition hover:ring-[var(--accent)]/30 disabled:opacity-50"
                disabled={busy}
                onClick={() => setExpensePhotoLightboxOpen(true)}
                aria-label="Открыть предпросмотр вложения"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={expPhotoPreviewUrl}
                  alt="Предпросмотр вложения"
                  className="max-h-40 w-full object-contain"
                />
              </button>
            ) : null}
          </div>
        </div>

        <FullscreenImageLightbox
          src={expPhotoPreviewUrl}
          alt="Предпросмотр вложения к расходу"
          open={expensePhotoLightboxOpen && Boolean(expPhotoPreviewUrl)}
          onClose={() => setExpensePhotoLightboxOpen(false)}
        />

        <button
          type="button"
          className="btn-primary mt-4 min-h-[44px] disabled:opacity-50"
          disabled={busy}
          onClick={() => void addExpense()}
        >
          Добавить расход
        </button>

        <ul className="mt-4 space-y-2">
          {initial.expenses.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
              Пока нет расходов.
            </li>
          ) : (
            initial.expenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--text)]">
                    {formatYmdWithWeekdayRu(e.expenseDate)} · {e.title}
                  </div>
                  {e.note ? <p className="mt-1 text-sm text-[var(--muted)]">{e.note}</p> : null}
                  {e.attachmentUrl ? (
                    <a
                      href={e.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <img
                        src={e.attachmentUrl}
                        alt=""
                        className="h-12 w-12 rounded-md border border-[var(--border)] object-cover"
                      />
                      Открыть фото
                    </a>
                  ) : null}
                </div>
                <div className="shrink-0 text-base font-semibold tabular-nums text-[var(--text)]">{formatVnd(e.amountVnd)}</div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
