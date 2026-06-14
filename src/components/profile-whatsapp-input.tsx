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

export function ProfileWhatsAppInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (full: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>("VN");
  const [manualDialCode, setManualDialCode] = useState("+84");
  const [phoneLocal, setPhoneLocal] = useState("");

  useEffect(() => {
    const v = String(value || "").trim();
    const rebuilt = buildFullPhoneE164(phoneCountry, phoneLocal, manualDialCode);
    if (v === rebuilt) return;
    if (!v) {
      setPhoneCountry("VN");
      setPhoneLocal("");
      setManualDialCode("+84");
      return;
    }
    const parsed = parsePhoneValue(value);
    setPhoneCountry(parsed.country);
    setPhoneLocal(parsed.local);
    if (parsed.country === "MANUAL") {
      const match = v.match(/^\+\d{1,4}/);
      setManualDialCode(match?.[0] ?? "+84");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(nextCountry: PhoneCountryCode, nextLocal: string, nextManual: string) {
    onChange(buildFullPhoneE164(nextCountry, nextLocal, nextManual));
  }

  function absorbPaste(raw: string) {
    const d = digitsOnly(raw);
    const hasPlus = raw.includes("+");
    if (hasPlus || d.length > 10) {
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
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[var(--muted)]">
        Номер WhatsApp — вьетнамский (+84) или российский (+7)
      </span>
      <div
        className="flex min-h-[44px] w-full flex-row flex-wrap items-stretch gap-2 sm:flex-nowrap"
        role="group"
        aria-labelledby={`${id}-wa-label`}
      >
        <select
          value={phoneCountry}
          disabled={disabled}
          onChange={(e) => {
            const c = e.target.value as PhoneCountryCode;
            const nextLocal = formatPhoneLocalInput(c, digitsOnly(phoneLocal), manualDialCode);
            setPhoneCountry(c);
            setPhoneLocal(nextLocal);
            emit(c, nextLocal, manualDialCode);
          }}
          className="field-surface w-[5.75rem] shrink-0 rounded-xl px-2 py-2 text-sm text-[var(--text)] disabled:opacity-70"
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
            placeholder="+84"
            className="field-surface w-[4.5rem] shrink-0 rounded-xl px-2 py-2 text-sm disabled:opacity-70"
            aria-label="Код страны вручную"
          />
        ) : null}
        <input
          className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={phoneCountry === "RU" || phoneCountry === "KZ" ? "950 204-75-00" : "Номер"}
          disabled={disabled}
          value={phoneLocal}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            if (text && absorbPaste(text)) e.preventDefault();
          }}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.includes("+") && absorbPaste(raw)) return;
            const next = formatPhoneLocalInput(phoneCountry, raw, manualDialCode);
            setPhoneLocal(next);
            emit(phoneCountry, next, manualDialCode);
          }}
        />
      </div>
    </div>
  );
}
