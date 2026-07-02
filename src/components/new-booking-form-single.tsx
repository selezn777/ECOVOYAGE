"use client";

import { useEffect, useRef, useState } from "react";
import { normalizePhone, formatVnd } from "@/lib/format";
import { HotelPickerField } from "@/components/hotel-picker-field";

type ManagerOption = { id: string; fullName: string };

type Props = {
  tourId: string;
  tourName: string;
  tourDate: string;
  availableSeats: number;
  templatePriceVnd: number;
  managerPreset?: ManagerOption | null;
  allowManagerPicker?: boolean;
  canAddHotel?: boolean;
  prefill?: {
    customerName?: string; phone?: string; hotelName?: string; hotelAddress?: string; hotelMapsUrl?: string; room?: string;
    telegramUsername?: string; note?: string; adults?: number; children?: number;
    infants?: number; managerName?: string; managerId?: string; offerVnd?: number;
  } | null;
  editBookingId?: string | null;
  backHref: string;
};

const DRAFT_KEY = (tourId: string) => `nb1-draft-${tourId}`;
const CHILD_DISCOUNT = 0.3;

function fmt(n: number) {
  return n > 0 ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}
function parseVnd(s: string) {
  const n = Number(s.replace(/\./g, "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function NewBookingFormSingle({
  tourId, tourName, tourDate, availableSeats,
  templatePriceVnd, managerPreset, allowManagerPicker = false,
  canAddHotel = false,
  prefill, editBookingId, backHref,
}: Props) {
  const isEdit = Boolean(editBookingId);

  const [adults, setAdults] = useState(prefill?.adults ?? 1);
  const [children, setChildren] = useState(prefill?.children ?? 0);
  const [infants, setInfants] = useState(prefill?.infants ?? 0);
  const [customerName, setCustomerName] = useState(prefill?.customerName ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [phoneAlt, setPhoneAlt] = useState("");
  const [hotel, setHotel] = useState(prefill?.hotelName ?? "");
  const [hotelAddress, setHotelAddress] = useState(prefill?.hotelAddress ?? "");
  const [hotelMapsUrl, setHotelMapsUrl] = useState(prefill?.hotelMapsUrl ?? "");
  const [room, setRoom] = useState(prefill?.room ?? "");
  const [telegram, setTelegram] = useState(prefill?.telegramUsername ?? "");
  const [note, setNote] = useState(prefill?.note ?? "");
  const [managerId, setManagerId] = useState(prefill?.managerId ?? managerPreset?.id ?? "");
  const [managerName, setManagerName] = useState(prefill?.managerName ?? managerPreset?.fullName ?? "");
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [priceText, setPriceText] = useState(
    prefill?.offerVnd && prefill.offerVnd > 0 ? fmt(prefill.offerVnd) : templatePriceVnd > 0 ? fmt(templatePriceVnd) : ""
  );
  const [depositText, setDepositText] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const draftRestored = useRef(false);

  const adultVnd = parseVnd(priceText);
  const childVnd = Math.round(adultVnd * (1 - CHILD_DISCOUNT));
  const totalVnd = adults * adultVnd + children * childVnd;
  const depositVnd = parseVnd(depositText);
  const debtVnd = Math.max(0, totalVnd - depositVnd);
  const overCapacity = (adults + children) > availableSeats && availableSeats >= 0;

  // Restore draft from sessionStorage on first mount
  useEffect(() => {
    if (draftRestored.current || isEdit || prefill) return;
    draftRestored.current = true;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY(tourId));
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (d.customerName) setCustomerName(String(d.customerName));
      if (d.phone) setPhone(String(d.phone));
      if (d.phoneAlt) setPhoneAlt(String(d.phoneAlt));
      if (d.hotel) setHotel(String(d.hotel));
      if (d.hotelAddress) setHotelAddress(String(d.hotelAddress));
      if (d.hotelMapsUrl) setHotelMapsUrl(String(d.hotelMapsUrl));
      if (d.room) setRoom(String(d.room));
      if (d.telegram) setTelegram(String(d.telegram));
      if (d.note) setNote(String(d.note));
      if (typeof d.adults === "number") setAdults(d.adults);
      if (typeof d.children === "number") setChildren(d.children);
      if (typeof d.infants === "number") setInfants(d.infants);
      if (d.priceText) setPriceText(String(d.priceText));
      if (d.depositText) setDepositText(String(d.depositText));
      if (d.managerId) setManagerId(String(d.managerId));
      if (d.managerName) setManagerName(String(d.managerName));
    } catch { /* ignore */ }
  }, [tourId, isEdit, prefill]);

  // Auto-save draft
  useEffect(() => {
    if (isEdit) return;
    try {
      sessionStorage.setItem(DRAFT_KEY(tourId), JSON.stringify({
        customerName, phone, phoneAlt, hotel, hotelAddress, hotelMapsUrl, room, telegram, note,
        adults, children, infants, priceText, depositText, managerId, managerName,
      }));
    } catch { /* ignore */ }
  }, [tourId, isEdit, customerName, phone, phoneAlt, hotel, hotelAddress, hotelMapsUrl, room, telegram, note,
      adults, children, infants, priceText, depositText, managerId, managerName]);

  // Load managers if allowed
  useEffect(() => {
    if (!allowManagerPicker || managerPreset) return;
    fetch("/api/users/sales-managers")
      .then((r) => r.json())
      .then((j: { managers?: ManagerOption[] }) => {
        if (Array.isArray(j.managers)) setManagers(j.managers);
      })
      .catch(() => {});
  }, [allowManagerPicker, managerPreset]);

  async function onSubmit() {
    const normPhone = normalizePhone(phone.trim());
    if (!customerName.trim()) { setErrorMsg("Укажите имя туриста."); return; }
    if (normPhone.replace(/\D/g, "").length < 8) { setErrorMsg("Укажите телефон с кодом страны."); return; }
    if (adults + children + infants === 0) { setErrorMsg("Укажите состав группы."); return; }
    setErrorMsg(null);
    setBusy(true);
    try {
      const childVndForEdit = Math.round(adultVnd * (1 - CHILD_DISCOUNT));
      const editPriceLines = adultVnd > 0 ? [
        ...(adults > 0 ? [{ label: "adults", amountVnd: adults * adultVnd }] : []),
        ...(children > 0 ? [{ label: "children", amountVnd: children * childVndForEdit }] : []),
      ] : undefined;
      const payload = {
        customerName: customerName.trim(),
        phone: normPhone,
        phoneAlt: phoneAlt.trim() ? normalizePhone(phoneAlt.trim()) : undefined,
        hotelName: hotel.trim() || undefined,
        hotelAddress: hotelAddress.trim() || undefined,
        hotelMapsUrl: hotelMapsUrl.trim() || undefined,
        room: room.trim() || undefined,
        telegramUsername: telegram.trim().replace(/^@/, "") || undefined,
        note: note.trim() || undefined,
        adults, children, infants,
        offerVnd: totalVnd,
        amountVnd: depositVnd,
        ...(managerId ? { managerId } : {}),
        ...(managerName.trim() ? { managerName: managerName.trim() } : {}),
      };
      const url = isEdit
        ? `/api/bookings/${editBookingId}`
        : `/api/tours/${tourId}/bookings`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? { ...payload, offerVnd: undefined, amountVnd: undefined, priceLines: editPriceLines }
          : payload),
      });
      const json = await res.json() as { bookingId?: string; onlineCode?: string; error?: string };
      if (!res.ok) { throw new Error(json.error || "Не удалось сохранить"); }
      try { sessionStorage.removeItem(DRAFT_KEY(tourId)); } catch { /* ignore */ }
      const on = json.onlineCode?.trim();
      setDoneMsg(isEdit ? "Данные обновлены ✓" : on ? `Добавлен! ON: ${on}` : "Турист добавлен ✓");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  // After success — show confirmation with actions
  if (doneMsg) {
    return (
      <section className="card space-y-4">
        <div className="rounded-xl bg-[var(--success-soft)] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--success)]">{doneMsg}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{tourName} · {tourDate}</div>
        </div>
        <div className="flex flex-col gap-2">
          <a href={backHref} className="btn-primary w-full text-center">← К туру</a>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              setDoneMsg(null); setCustomerName(""); setPhone(""); setPhoneAlt("");
              setHotel(""); setHotelAddress(""); setHotelMapsUrl(""); setRoom(""); setTelegram(""); setNote("");
              setAdults(1); setChildren(0); setInfants(0); setDepositText("");
            }}
          >
            + Ещё один турист
          </button>
        </div>
      </section>
    );
  }

  const selOpts = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
  const fieldCls = "field-surface w-full rounded-xl px-3 py-2.5 text-[15px] leading-snug";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)] mb-1";

  return (
    <section className="card space-y-4">
      {/* Tour info */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3">
        <div className="text-[13px] font-semibold text-[var(--text)]">{tourName}</div>
        <div className="text-[12px] text-[var(--muted)]">{tourDate}</div>
        {overCapacity ? (
          <div className="mt-2 text-[11px] font-medium text-[var(--warn)]">
            ⚠ Свободно {availableSeats} мест, запрошено {adults + children} — оверран разрешён
          </div>
        ) : null}
      </div>

      {/* Группа */}
      <div>
        <div className={labelCls}>Состав группы</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["Взрослые", adults, setAdults],
            ["Дети", children, setChildren],
            ["Младенцы", infants, setInfants],
          ] as [string, number, (n: number) => void][]).map(([lbl, val, set]) => (
            <label key={lbl} className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--muted)]">{lbl}</span>
              <select value={val} onChange={(e) => set(Number(e.target.value))} className={fieldCls}>
                {selOpts(20).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      {/* Менеджер */}
      {allowManagerPicker && !managerPreset ? (
        <div>
          <label className={labelCls}>Менеджер продаж</label>
          {managers.length > 0 ? (
            <select
              value={managerId}
              onChange={(e) => {
                const id = e.target.value;
                const m = managers.find((x) => x.id === id);
                setManagerId(id); setManagerName(m?.fullName ?? "");
              }}
              className={fieldCls}
            >
              <option value="">Выберите…</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          ) : (
            <input value={managerName} onChange={(e) => setManagerName(e.target.value)}
              placeholder="Имя менеджера" className={fieldCls} />
          )}
        </div>
      ) : null}

      {/* Контакты */}
      <div className="space-y-3">
        <div className={labelCls}>Контакты</div>

        <div>
          <label className="text-[12px] text-[var(--muted)]">Имя туриста *</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Иванов Иван" className={fieldCls + " mt-0.5"} />
        </div>

        <div>
          <label className="text-[12px] text-[var(--muted)]">Телефон *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel"
            placeholder="+84 ..." className={fieldCls + " mt-0.5"} />
        </div>

        <HotelPickerField
          value={hotel}
          onChange={setHotel}
          address={hotelAddress}
          onAddressChange={setHotelAddress}
          mapsUrl={hotelMapsUrl}
          onMapsUrlChange={setHotelMapsUrl}
          canAddHotel={canAddHotel}
        />

        <div>
          <label className="text-[12px] text-[var(--muted)]">Комната</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)}
            placeholder="101" className={fieldCls + " mt-0.5"} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[12px] text-[var(--muted)]">Telegram</label>
            <input value={telegram} onChange={(e) => setTelegram(e.target.value)}
              placeholder="@username" className={fieldCls + " mt-0.5"} />
          </div>
          <div>
            <label className="text-[12px] text-[var(--muted)]">Запасной тел.</label>
            <input value={phoneAlt} onChange={(e) => setPhoneAlt(e.target.value)} type="tel"
              placeholder="+84 ..." className={fieldCls + " mt-0.5"} />
          </div>
        </div>

        <div>
          <label className="text-[12px] text-[var(--muted)]">Заметка</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Особые пожелания, аллергии…" className={fieldCls + " mt-0.5"} />
        </div>
      </div>

      {/* Оплата */}
      {!isEdit ? (
        <div className="space-y-3">
          <div className={labelCls}>Оплата</div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[12px] text-[var(--muted)]">Цена взрослый, đ</label>
              <input
                value={priceText}
                onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ""))}
                onFocus={(e) => e.target.select()}
                placeholder="1.050.000"
                className={fieldCls + " mt-0.5 tabular-nums"}
              />
            </div>
            {children > 0 ? (
              <div>
                <label className="text-[12px] text-[var(--muted)]">Цена ребёнок (−30%)</label>
                <div className={fieldCls + " mt-0.5 tabular-nums bg-[var(--surface-soft)] text-[var(--muted)]"}>
                  {childVnd > 0 ? formatVnd(childVnd) : "—"}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-[12px] text-[var(--muted)]">Внесено депозит, đ</label>
            <input
              value={depositText}
              onChange={(e) => setDepositText(e.target.value.replace(/[^\d.]/g, ""))}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              className={fieldCls + " mt-0.5 tabular-nums"}
            />
          </div>

          {totalVnd > 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 space-y-1">
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--muted)]">Итого</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{formatVnd(totalVnd)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--muted)]">Внесено</span>
                <span className="tabular-nums text-[var(--success)]">{formatVnd(depositVnd)}</span>
              </div>
              {debtVnd > 0 ? (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[var(--muted)]">К доплате</span>
                  <span className="font-semibold tabular-nums text-[var(--warn)]">{formatVnd(debtVnd)}</span>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--success)]">Оплачено полностью ✓</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Error */}
      {errorMsg ? (
        <div className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
          {errorMsg}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={busy}
          className="btn-primary w-full min-h-[48px] text-base font-semibold disabled:opacity-50"
        >
          {busy ? "Оформляем…" : isEdit ? "Сохранить изменения" : "Оформить бронь"}
        </button>
        <a href={backHref} className="btn-secondary w-full text-center">
          ← Назад к туру
        </a>
      </div>
    </section>
  );
}
