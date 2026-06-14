"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapsUrlField } from "@/components/google-maps-url-field";

export type HotelOption = {
  id: string;
  name: string;
  address: string;
  mapsUrl: string;
};

type Props = {
  value: string;
  onChange: (name: string) => void;
  address: string;
  onAddressChange: (address: string) => void;
  mapsUrl: string;
  onMapsUrlChange: (mapsUrl: string) => void;
  canAddHotel?: boolean;
};

function isStandaloneIosPwa(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (typeof navigator !== "undefined" && "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return isIos && standalone;
}

function openExternal(url: string) {
  if (isStandaloneIosPwa()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const fieldCls = "field-surface w-full rounded-xl px-3 py-2.5 text-[15px] leading-snug";

/**
 * Поле «Отель»: выпадающий список всех отелей справочника (открывается по клику/фокусу,
 * фильтруется по вводу), выбор подставляет адрес и ссылку Google Maps.
 * Кнопка «Открыть на карте» позволяет сразу проверить выбранную точку.
 */
export function HotelPickerField({
  value, onChange, address, onAddressChange, mapsUrl, onMapsUrlChange, canAddHotel = false,
}: Props) {
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newMapsUrl, setNewMapsUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/hotels")
      .then((r) => r.json())
      .then((j: { hotels?: HotelOption[] }) => {
        if (Array.isArray(j.hotels)) setHotels(j.hotels);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const suggestions = useMemo(() => {
    const t = value.trim().toLowerCase();
    const list = t ? hotels.filter((h) => h.name.toLowerCase().includes(t)) : hotels;
    return list.slice(0, 30);
  }, [value, hotels]);

  const pickHotel = useCallback((hotel: HotelOption) => {
    onChange(hotel.name);
    onAddressChange(hotel.address);
    onMapsUrlChange(hotel.mapsUrl);
    setOpen(false);
  }, [onChange, onAddressChange, onMapsUrlChange]);

  function openOnMap() {
    if (mapsUrl.trim()) {
      openExternal(mapsUrl.trim());
      return;
    }
    const q = encodeURIComponent(`${value.trim() || "hotel"} Nha Trang`);
    openExternal(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }

  async function submitNewHotel() {
    if (!newName.trim()) {
      setAddError("Укажите название отеля.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), address: newAddress.trim(), mapsUrl: newMapsUrl.trim() }),
      });
      const json = (await res.json()) as { hotel?: HotelOption; error?: unknown };
      if (!res.ok) {
        const msg = typeof json.error === "string" ? json.error : "Не удалось добавить отель";
        throw new Error(msg);
      }
      if (json.hotel) {
        const hotel = json.hotel;
        setHotels((prev) => [...prev, hotel].sort((a, b) => a.name.localeCompare(b.name, "ru")));
        pickHotel(hotel);
      }
      setShowAdd(false);
      setNewName("");
      setNewAddress("");
      setNewMapsUrl("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-[var(--muted)]">Отель</label>
      <div ref={wrapRef} className="relative min-w-0">
        <input
          type="search"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onAddressChange("");
            onMapsUrlChange("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Название отеля"
          className={fieldCls + " mt-0.5"}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {open ? (
          <ul
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-[var(--shadow-lg)] ring-1 ring-black/5"
            role="listbox"
          >
            {suggestions.length > 0 ? (
              suggestions.map((hotel) => (
                <li key={hotel.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={hotel.name === value}
                    className="block w-full px-3 py-2.5 text-left hover:bg-[var(--surface-soft)]"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onTouchStart={(ev) => ev.preventDefault()}
                    onClick={() => pickHotel(hotel)}
                  >
                    <div className="truncate font-medium text-[var(--text)]">{hotel.name}</div>
                    {hotel.address ? (
                      <div className="truncate text-[11px] text-[var(--muted)]">{hotel.address}</div>
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2.5 text-[12px] text-[var(--muted)]">Ничего не найдено</li>
            )}
            {canAddHotel ? (
              <li className="border-t border-[var(--border)]">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-soft)]"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onTouchStart={(ev) => ev.preventDefault()}
                  onClick={() => {
                    setNewName(value.trim());
                    setShowAdd(true);
                    setOpen(false);
                  }}
                >
                  + Добавить отель в справочник
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {address ? <div className="text-[11px] leading-snug text-[var(--muted)]">{address}</div> : null}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <button
          type="button"
          onClick={openOnMap}
          className="btn-secondary min-h-[36px] rounded-lg px-3 py-1.5 text-[12px] font-medium"
        >
          Открыть на карте
        </button>
        {canAddHotel && !showAdd ? (
          <button
            type="button"
            onClick={() => {
              setNewName(value.trim());
              setShowAdd(true);
            }}
            className="btn-secondary min-h-[36px] rounded-lg px-3 py-1.5 text-[12px] font-medium"
          >
            + Добавить отель
          </button>
        ) : null}
      </div>

      {showAdd ? (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="text-[12px] font-semibold text-[var(--text)]">Новый отель в справочнике</div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название отеля"
            className={fieldCls}
          />
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="Адрес"
            className={fieldCls}
          />
          <GoogleMapsUrlField
            label="Ссылка Google Maps"
            value={newMapsUrl}
            onChange={setNewMapsUrl}
            setValue={setNewMapsUrl}
          />
          {addError ? <div className="text-[12px] font-medium text-[var(--danger)]">{addError}</div> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submitNewHotel()}
              disabled={addBusy}
              className="btn-primary min-h-[40px] flex-1 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            >
              {addBusy ? "Сохраняем…" : "Сохранить отель"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setAddError(null);
              }}
              className="btn-secondary min-h-[40px] rounded-xl px-4 text-[13px] font-medium"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
