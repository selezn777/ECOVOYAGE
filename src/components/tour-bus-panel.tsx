"use client";

import { rangeOptions } from "@/components/numeric-roll-select";
import { FormEvent, useState } from "react";

export function TourBusPanel({ tourId }: { tourId: string }) {
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const busNumber = (form.elements.namedItem("busNumber") as HTMLInputElement).value.trim();
    const seatsRaw = (form.elements.namedItem("seats") as HTMLSelectElement).value.trim();
    const comment = (form.elements.namedItem("comment") as HTMLInputElement).value.trim();
    const langNoteEn = (form.elements.namedItem("langNoteEn") as HTMLInputElement).value.trim();
    const langNoteVn = (form.elements.namedItem("langNoteVn") as HTMLInputElement).value.trim();
    const driverPaidRaw = (form.elements.namedItem("driverPaidVnd") as HTMLInputElement)?.value ?? "";

    if (!busNumber) {
      alert("Укажите номер автобуса");
      return;
    }

    const seats = seatsRaw === "" ? null : Number(seatsRaw);
    if (seats !== null && (!Number.isFinite(seats) || seats < 0)) {
      alert("Количество мест - неотрицательное число");
      return;
    }
    const driverPaidVnd = driverPaidRaw === "" ? null : Number(driverPaidRaw.replace(/\D/g, ""));
    if (driverPaidVnd !== null && (!Number.isFinite(driverPaidVnd) || driverPaidVnd < 0)) {
      alert("Оплата водителю должна быть неотрицательным числом.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/buses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busNumber,
          seats,
          comment: comment || null,
          langNoteEn: langNoteEn || null,
          langNoteVn: langNoteVn || null,
          driverPaidVnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Не удалось сохранить автобус");
      form.reset();
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
    >
      <div className="font-medium text-[var(--text)]">Добавить автобус</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Номер автобуса</span>
          <input name="busNumber" className="field-surface rounded-lg px-2 py-1.5" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Мест</span>
          <select name="seats" className="field-surface rounded-lg px-2 py-1.5" defaultValue="">
            <option value="">Не указано</option>
            {rangeOptions(1, 80).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Оплата водителю автобуса, VND</span>
        <input
          name="driverPaidVnd"
          inputMode="numeric"
          className="field-surface rounded-lg px-2 py-1.5"
          placeholder="Необязательно"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--muted)]">Комментарий</span>
        <input name="comment" className="field-surface rounded-lg px-2 py-1.5" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Языковая заметка (EN)</span>
          <input name="langNoteEn" className="field-surface rounded-lg px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Языковая заметка (VN)</span>
          <input name="langNoteVn" className="field-surface rounded-lg px-2 py-1.5" />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="btn-primary w-fit rounded-lg px-3 py-2 text-xs disabled:opacity-50"
      >
        {busy ? "Сохранение…" : "Сохранить автобус"}
      </button>
    </form>
  );
}
