"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNewBookingDraft } from "@/context/new-booking-draft-context";
import { addPassportPhotoToBooking } from "@/lib/passport-booking-client-upload";
import type { ManagerPreset, PrefillBookingFields } from "@/components/new-booking-step-contact";

function parseVndInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatVndInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseDecimalInput(raw: string): number {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const [intPart = "", fracPart = ""] = normalized.split(".");
  const safe = fracPart ? `${intPart}.${fracPart.slice(0, 2)}` : intPart;
  const n = Number(safe);
  return Number.isFinite(n) ? n : 0;
}

function formatUsdAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0.00";
  return n.toFixed(2);
}

function extractApiErrorMessage(json: unknown): string {
  if (json && typeof json === "object") {
    const data = json as { error?: unknown };
    if (typeof data.error === "string") return data.error;
    if (data.error && typeof data.error === "object") {
      const shaped = data.error as { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
      const firstField = Object.values(shaped.fieldErrors ?? {}).find((arr) => Array.isArray(arr) && arr.length > 0);
      if (firstField && firstField[0]) return firstField[0];
      if (Array.isArray(shaped.formErrors) && shaped.formErrors[0]) return shaped.formErrors[0];
    }
  }
  return "Не удалось сохранить";
}

export function NewBookingStepPayment({
  managerPreset,
  allowManagerPicker = false,
  templatePricing = null,
  usdToVndRateFallback = 26000,
  prefillBooking = null,
  editBookingId,
  existingPaidVnd = 0,
  pickupTimeHhMm = "00:00",
}: {
  managerPreset?: ManagerPreset | null;
  allowManagerPicker?: boolean;
  templatePricing?: { adultUsd: number; adultVnd: number } | null;
  usdToVndRateFallback?: number;
  prefillBooking?: PrefillBookingFields | null;
  editBookingId?: string | null;
  existingPaidVnd?: number;
  pickupTimeHhMm?: string;
}) {
  const router = useRouter();
  const { tourId, draftHydrated, intentPax, contact, passportFiles, setPassportFiles, resetContact } =
    useNewBookingDraft();
  const [busy, setBusy] = useState(false);
  const [adultPriceUsdText, setAdultPriceUsdText] = useState("");
  const [childDiscountText, setChildDiscountText] = useState("30");
  const [usdToVndRateText, setUsdToVndRateText] = useState("26000");
  const [extraServices, setExtraServices] = useState<{ id: string; label: string; usd: string }[]>([]);
  const [depositCurrency, setDepositCurrency] = useState<"VND" | "USD">("VND");
  const [depositText, setDepositText] = useState("");
  const [depositEdited, setDepositEdited] = useState(false);

  const search = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    if (!templatePricing) return;
    const adultUsd = Number(templatePricing.adultUsd) || 0;
    const adultVnd = Number(templatePricing.adultVnd) || 0;
    if (adultUsd <= 0 || adultVnd <= 0) return;
    const rate = adultVnd / adultUsd;
    setAdultPriceUsdText(String(Math.round(adultUsd * 100) / 100));
    setUsdToVndRateText(String(rate > 0 ? Math.round(rate * 100) / 100 : usdToVndRateFallback));
    setChildDiscountText("30");
  }, [templatePricing, usdToVndRateFallback]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (!intentPax || !contact.customerName.trim()) {
      router.replace(`/tours/${tourId}/new-booking/details${search}`);
    }
  }, [draftHydrated, intentPax, contact.customerName, router, tourId, search]);

  const adultsCount = intentPax ? Math.max(0, intentPax.adults) : 0;
  const childrenCount = intentPax ? Math.max(0, intentPax.children) : 0;
  const infantsCount = intentPax ? Math.max(0, intentPax.infants) : 0;

  const pricePayload = useMemo(() => {
    const rate = Math.max(0, parseDecimalInput(usdToVndRateText));
    const adultPriceUsd = Math.max(0, parseDecimalInput(adultPriceUsdText));
    const childDiscount = Math.min(100, Math.max(0, parseDecimalInput(childDiscountText)));
    const childPriceUsd = adultPriceUsd * (1 - childDiscount / 100);
    const baseUsd = adultsCount * adultPriceUsd + childrenCount * childPriceUsd;
    const extrasUsd = extraServices.reduce((s, e) => s + Math.max(0, parseDecimalInput(e.usd)), 0);
    const totalUsd = baseUsd + extrasUsd;
    const totalVnd = Math.round(totalUsd * rate);
    const baseVnd = Math.round(baseUsd * rate);
    const lines: { label: string; amountVnd: number }[] = [{ label: "Участники (тариф)", amountVnd: baseVnd }];
    for (const e of extraServices) {
      const u = Math.max(0, parseDecimalInput(e.usd));
      if (u <= 0) continue;
      lines.push({ label: e.label.trim() || "Доп. услуга", amountVnd: Math.round(u * rate) });
    }
    let sum = lines.reduce((s, l) => s + l.amountVnd, 0);
    if (sum !== totalVnd && lines.length) {
      lines[lines.length - 1].amountVnd += totalVnd - sum;
    }
    return { totalUsd, totalVnd, priceLines: lines, rate };
  }, [adultsCount, childrenCount, adultPriceUsdText, childDiscountText, usdToVndRateText, extraServices]);

  const totalUsd = pricePayload.totalUsd;
  const totalVnd = pricePayload.totalVnd;
  const rate = pricePayload.rate;
  const payingPeople = adultsCount + childrenCount;

  // Заполнить поле оплаты полной суммой, пока менеджер не изменил его вручную
  useEffect(() => {
    if (depositEdited || depositCurrency !== "VND") return;
    if (totalVnd > 0) setDepositText(formatVndInput(totalVnd));
  }, [totalVnd, depositEdited, depositCurrency]);
  const usdPerPerson = payingPeople > 0 ? totalUsd / payingPeople : 0;
  const vndPerPerson = payingPeople > 0 ? totalVnd / payingPeople : 0;

  const depositVnd = useMemo(() => {
    if (depositCurrency === "USD") {
      const u = parseDecimalInput(depositText);
      return u > 0 && rate > 0 ? Math.round(u * rate) : 0;
    }
    return parseVndInput(depositText);
  }, [depositCurrency, depositText, rate]);

  const remainderVnd = Math.max(0, totalVnd - existingPaidVnd - depositVnd);
  const remainderUsd = rate > 0 ? remainderVnd / rate : 0;

  async function onSubmit() {
    if (allowManagerPicker && !managerPreset && !prefillBooking && !contact.pickedManagerId) {
      alert("Вернитесь к шагу 2 и выберите менеджера.");
      return;
    }
    const managerId = managerPreset?.id ?? contact.pickedManagerId ?? undefined;
    const phones = contact.phones.map((p) => p.trim()).filter(Boolean);
    const primary = phones[0];
    const alt = phones[1]?.trim() || "";
    if (!primary) {
      alert("Нет основного телефона. Вернитесь к шагу 2.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        managerName: contact.managerName,
        hotelName: contact.hotelName,
        hotelMapsUrl: contact.hotelMapsUrl,
        room: contact.room,
        customerName: contact.customerName,
        phone: primary,
        phoneAlt: alt || undefined,
        telegramUsername: contact.telegramUsername || undefined,
        adults: adultsCount,
        children: childrenCount,
        infants: infantsCount,
        note: contact.note || undefined,
        offerVnd: totalVnd,
        priceLines: pricePayload.priceLines,
        amountVnd: depositVnd,
        passportPhotoUrls: contact.prefilledPassportUrls || undefined,
        ...(managerId ? { managerId } : {}),
      };
      const res = editBookingId
        ? await fetch(`/api/bookings/${editBookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              adults: adultsCount,
              children: childrenCount,
              infants: infantsCount,
              note: contact.note || "",
              customerName: contact.customerName,
              hotelName: contact.hotelName,
              hotelMapsUrl: contact.hotelMapsUrl || "",
              room: contact.room || "",
              phone: primary,
              phoneAlt: alt || "",
              pickupTime: pickupTimeHhMm,
              telegramUsername: contact.telegramUsername || "",
              offerVnd: totalVnd,
              priceLines: pricePayload.priceLines,
            }),
          })
        : await fetch(`/api/tours/${tourId}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = (await res.json()) as { bookingId?: string; onlineCode?: string; error?: unknown };
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(json));
      }
      const bookingId =
        editBookingId || (typeof json.bookingId === "string" ? json.bookingId : null);
      const uploadErrors: string[] = [];
      if (bookingId && passportFiles.length > 0) {
        for (const f of passportFiles) {
          const up = await addPassportPhotoToBooking(bookingId, tourId, f);
          if (!up.ok) uploadErrors.push(up.error);
        }
      }
      if (editBookingId && depositVnd > 0) {
        const pay = await fetch(`/api/bookings/${editBookingId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "topup", amountVnd: depositVnd }),
        });
        if (!pay.ok) {
          const j = await pay.json().catch(() => ({}));
          throw new Error(extractApiErrorMessage(j));
        }
      }
      const on = typeof json.onlineCode === "string" && json.onlineCode.trim() ? json.onlineCode.trim() : null;
      let doneMsg = editBookingId
        ? "Данные туриста обновлены"
        : on
          ? `Турист добавлен. ON: ${on}`
          : "Турист добавлен";
      if (uploadErrors.length > 0) {
        doneMsg += `\n\nНе все фото паспорта загрузились:\n${uploadErrors.slice(0, 4).join("\n")}`;
      }
      alert(doneMsg);
      try {
        await fetch(`/api/tours/${tourId}/booking-intent`, { method: "DELETE", credentials: "same-origin" });
      } catch {
        /* ignore */
      }
      resetContact();
      setPassportFiles([]);
      setExtraServices([]);
      setDepositText("");
      // Небольшая пауза — даём Supabase зафиксировать запись перед серверным рендером страницы
      await new Promise((r) => setTimeout(r, 400));
      // router.push вместо window.location.href — клиентская навигация Next.js,
      // не вызывает cold-start Vercel и не показывает "page couldn't load" при задержке
      if (bookingId) {
        router.push(`/bookings/${bookingId}`);
      } else {
        router.push(`/tours/${tourId}`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const saleOwnerName =
    managerPreset?.fullName ||
    contact.managerName ||
    (allowManagerPicker ? "не выбран" : "текущий пользователь");

  if (!draftHydrated || !intentPax) {
    return (
      <p className="card text-sm text-[var(--muted)]">
        Загрузка… Если вы открыли эту страницу напрямую, начните с шага 1.
      </p>
    );
  }

  return (
    <section className="card space-y-3">
      <div className="text-xs text-[var(--muted)]">Продажа от: {saleOwnerName}</div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm">
        <span className="text-[11px] font-semibold uppercase text-[var(--muted2)]">Турист и состав</span>
        <p className="mt-1 font-medium text-[var(--text)]">{contact.customerName || "—"}</p>
        <p className="mt-1 tabular-nums text-[var(--muted)]">
          {adultsCount} взр. · {childrenCount} дет. · {infantsCount} мл.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        <div className="mb-2 text-xs font-medium text-[var(--muted)]">Расчёт в USD</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            USD за взрослого
            <input
              value={adultPriceUsdText}
              onChange={(e) => setAdultPriceUsdText(e.target.value)}
              inputMode="decimal"
              placeholder="80"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            Скидка ребёнку, %
            <input
              value={childDiscountText}
              onChange={(e) => setChildDiscountText(e.target.value)}
              inputMode="decimal"
              placeholder="30"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            Курс USD → VND
            <input
              value={usdToVndRateText}
              onChange={(e) => setUsdToVndRateText(e.target.value)}
              inputMode="decimal"
              placeholder="26000"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <div className="text-xs text-[var(--muted)]">Доп. услуги</div>
          {extraServices.map((row) => (
            <div key={row.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_minmax(0,7rem)_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                Услуга
                <input
                  value={row.label}
                  onChange={(e) =>
                    setExtraServices((prev) => prev.map((x) => (x.id === row.id ? { ...x, label: e.target.value } : x)))
                  }
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                USD
                <input
                  value={row.usd}
                  onChange={(e) =>
                    setExtraServices((prev) => prev.map((x) => (x.id === row.id ? { ...x, usd: e.target.value } : x)))
                  }
                  inputMode="decimal"
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]"
                onClick={() => setExtraServices((prev) => prev.filter((x) => x.id !== row.id))}
              >
                Удалить
              </button>
            </div>
          ))}
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] sm:w-auto"
            onClick={() =>
              setExtraServices((prev) => [
                ...prev,
                {
                  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ex-${Date.now()}`,
                  label: "",
                  usd: "",
                },
              ])
            }
          >
            + Добавить услугу
          </button>
        </div>
        <div className="mt-3 text-sm text-[var(--text)]">
          <div>
            <span className="text-[var(--muted)]">Итого USD:</span> {formatUsdAmount(totalUsd)}
            <span className="ml-2 text-[var(--muted)]">· на 1 чел. (взр.+дет.):</span> {formatUsdAmount(usdPerPerson)}
          </div>
          <div className="mt-1">
            <span className="text-[var(--muted)]">Итого VND:</span> {formatVndInput(totalVnd)}
            <span className="ml-2 text-[var(--muted)]">· на 1 чел.:</span> {formatVndInput(Math.round(vndPerPerson))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 dark:bg-amber-900/20">
        <div className="text-xs font-semibold text-amber-950 dark:text-amber-100">Оплата</div>
        {editBookingId ? (
          <div className="mt-1 text-xs text-[var(--muted)]">
            Уже оплачено: <span className="tabular-nums">{formatVndInput(existingPaidVnd)} ₫</span>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-[var(--muted)]">
            Сумма
            <input
              value={depositText}
              onChange={(e) => {
                setDepositEdited(true);
                if (depositCurrency === "VND") {
                  setDepositText(formatVndInput(parseVndInput(e.target.value)));
                } else {
                  setDepositText(e.target.value.replace(",", "."));
                }
              }}
              inputMode="decimal"
              placeholder={depositCurrency === "USD" ? "0" : "1.000.000"}
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            Валюта
            <select
              value={depositCurrency}
              onChange={(e) => {
                setDepositCurrency(e.target.value as "USD" | "VND");
                setDepositText("");
                setDepositEdited(false);
              }}
              className="field-surface rounded-xl px-3 py-2 text-sm"
            >
              <option value="USD">USD</option>
              <option value="VND">VND</option>
            </select>
          </label>
        </div>
        <div className="mt-3 text-sm">
          <div className="text-[var(--muted)]">
            Зачтено как оплата:{" "}
            <span className="font-semibold tabular-nums text-[var(--text)]">{formatVndInput(depositVnd)} ₫</span>
            {depositCurrency === "USD" && depositVnd > 0 && rate > 0 ? (
              <span className="ml-2 text-xs">(≈ {formatUsdAmount(depositVnd / rate)} $)</span>
            ) : null}
          </div>
          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <span className="text-[var(--muted)]">Доплата гиду (остаток):</span>{" "}
            <span className="font-semibold tabular-nums text-[var(--text)]">{formatVndInput(remainderVnd)} ₫</span>
            <span className="ml-2 text-xs text-[var(--muted)]">≈ {formatUsdAmount(remainderUsd)} $</span>
          </div>
          {depositVnd > totalVnd ? (
            <div className="mt-2 text-[11.5px] font-medium leading-snug text-amber-700 dark:text-amber-400">
              Внимание: введена сумма оплаты больше итоговой стоимости тура. Будет зафиксирована переплата (потребуется возврат туристу).
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-medium"
          onClick={() => router.push(`/tours/${tourId}/new-booking/details${search}`)}
        >
          Назад
        </button>
        <button
          type="button"
          disabled={busy}
          className="btn-primary rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          onClick={() => void onSubmit()}
        >
          {busy ? "Сохранение…" : "Сохранить"}
        </button>
        {editBookingId ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-xl border border-red-400/50 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-300"
            onClick={async () => {
              if (!confirm("Удалить туриста из этого тура?")) return;
              setBusy(true);
              try {
                const res = await fetch(`/api/bookings/${editBookingId}/delete`, { method: "POST" });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(extractApiErrorMessage(j));
                resetContact();
                window.location.href = `/tours/${tourId}`;
              } catch (e) {
                alert(e instanceof Error ? e.message : "Ошибка");
              } finally {
                setBusy(false);
              }
            }}
          >
            Удалить туриста
          </button>
        ) : null}
      </div>
    </section>
  );
}
