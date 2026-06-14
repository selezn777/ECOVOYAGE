"use client";

import { useEffect, useId, useState } from "react";
import {
  PHONE_COUNTRIES,
  buildFullPhoneE164,
  digitsOnly,
  formatPhoneLocalInput,
  parsePhoneValue,
  parsePastedPhoneToFormState,
  type PhoneCountryCode,
} from "@/lib/phone-e164";

type Props = {
  value: string;
  onChange: (e164: string) => void;
  disabled?: boolean;
  /** Подпись над строкой */
  label?: string;
};

/** Одна строка: выбор кода (узкий) + номер; вставка полного +79… корректно разбирается. */
export function BookingIntlPhoneRow({ value, onChange, disabled, label = "Телефон" }: Props) {
  const id = useId();
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>("RU");
  const [manualDialCode, setManualDialCode] = useState("+7");
  const [phoneLocal, setPhoneLocal] = useState("");

  /** Только если value пришло «извне» (prefill, восстановление черновика), не после нашего emit — иначе лишний setState на каждый символ гасит фокус и клавиатуру на Android. */
  useEffect(() => {
    const v = String(value || "").trim();
    const rebuilt = buildFullPhoneE164(phoneCountry, phoneLocal, manualDialCode);
    if (v === rebuilt) return;

    if (!v) {
      setPhoneCountry("RU");
      setManualDialCode("+7");
      setPhoneLocal("");
      return;
    }
    const parsed = parsePhoneValue(v);
    setPhoneCountry(parsed.country);
    setPhoneLocal(parsed.local);
    if (parsed.country === "MANUAL") {
      const m = v.match(/^\+\d{1,4}/);
      setManualDialCode(m?.[0] ?? "+7");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сверяем с актуальным локальным состоянием только когда меняется value снаружи
  }, [value]);

  function emit(nextCountry: PhoneCountryCode, nextLocal: string, nextManual: string) {
    onChange(buildFullPhoneE164(nextCountry, nextLocal, nextManual));
  }

  function absorbInternationalPastedLocal(raw: string) {
    const d = digitsOnly(raw);
    const hasPlus = raw.includes("+");
    if (phoneCountry === "RU" || phoneCountry === "KZ") {
      if (hasPlus || d.length > 10 || (d.length === 11 && d.startsWith("7"))) {
        const candidate = hasPlus ? raw.trim() : `+${d}`;
        const st = parsePastedPhoneToFormState(candidate);
        if (st) {
          setPhoneCountry(st.country);
          setManualDialCode(st.manualDial);
          setPhoneLocal(st.local);
          emit(st.country, st.local, st.manualDial);
          return true;
        }
      }
    }
    if (hasPlus || d.length > 12) {
      const st = parsePastedPhoneToFormState(hasPlus ? raw.trim() : `+${d}`);
      if (st) {
        setPhoneCountry(st.country);
        setManualDialCode(st.manualDial);
        setPhoneLocal(st.local);
        emit(st.country, st.local, st.manualDial);
        return true;
      }
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--muted)]">
      {label ? (
        <span id={`${id}-phone-label`} className="text-[var(--muted)]">
          {label}
        </span>
      ) : null}
      <div
        className="flex min-h-[44px] w-full flex-row flex-wrap items-stretch gap-2 sm:flex-nowrap"
        role="group"
        {...(label ? { "aria-labelledby": `${id}-phone-label` } : {})}
      >
        <select
          id={`${id}-cc`}
          value={phoneCountry}
          disabled={disabled}
          onChange={(e) => {
            const c = e.target.value as PhoneCountryCode;
            const nextLocal = formatPhoneLocalInput(c, digitsOnly(phoneLocal), manualDialCode);
            setPhoneCountry(c);
            setPhoneLocal(nextLocal);
            emit(c, nextLocal, manualDialCode);
          }}
          className="field-surface w-[5.75rem] shrink-0 rounded-xl px-2 py-2 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-[6.25rem]"
          aria-label="Код страны"
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.dial ? country.dial : country.label}
            </option>
          ))}
        </select>
        {phoneCountry === "MANUAL" ? (
          <input
            value={manualDialCode}
            disabled={disabled}
            onChange={(e) => {
              const next = `+${digitsOnly(e.target.value).slice(0, 4)}`;
              const dial = next.length > 1 ? next : "+";
              setManualDialCode(dial);
              const loc = formatPhoneLocalInput("MANUAL", phoneLocal, dial);
              setPhoneLocal(loc);
              emit("MANUAL", loc, dial);
            }}
            inputMode="numeric"
            placeholder="+380"
            className="field-surface w-[4.5rem] shrink-0 rounded-xl px-2 py-2 text-sm disabled:opacity-70"
            aria-label="Код страны вручную"
          />
        ) : null}
        <input
          className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-70"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={phoneCountry === "RU" || phoneCountry === "KZ" ? "950 204-75-00" : "Номер"}
          disabled={disabled}
          value={phoneLocal}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            if (text && absorbInternationalPastedLocal(text)) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // В обычном наборе не пытаемся "угадывать" международный формат:
            // иначе при лишней цифре поле может перескочить в MANUAL и "раздуть" номер.
            // Автопарс оставляем для paste и явного ввода с "+".
            if (raw.includes("+") && absorbInternationalPastedLocal(raw)) return;
            const next = formatPhoneLocalInput(phoneCountry, raw, manualDialCode);
            setPhoneLocal(next);
            emit(phoneCountry, next, manualDialCode);
          }}
        />
      </div>
    </div>
  );
}
