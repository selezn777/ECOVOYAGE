/** Страна + код для ввода телефона как в карточке брони (VN, RU, …). */

export const PHONE_COUNTRIES = [
  { code: "RU", label: "Россия", dial: "+7" },
  { code: "VN", label: "Вьетнам", dial: "+84" },
  { code: "KZ", label: "Казахстан", dial: "+7" },
  { code: "UA", label: "Украина", dial: "+380" },
  { code: "BY", label: "Беларусь", dial: "+375" },
  { code: "AM", label: "Армения", dial: "+374" },
  { code: "AZ", label: "Азербайджан", dial: "+994" },
  { code: "GE", label: "Грузия", dial: "+995" },
  { code: "KG", label: "Кыргызстан", dial: "+996" },
  { code: "TJ", label: "Таджикистан", dial: "+992" },
  { code: "UZ", label: "Узбекистан", dial: "+998" },
  { code: "TR", label: "Турция", dial: "+90" },
  { code: "TH", label: "Таиланд", dial: "+66" },
  { code: "ID", label: "Индонезия", dial: "+62" },
  { code: "MY", label: "Малайзия", dial: "+60" },
  { code: "PH", label: "Филиппины", dial: "+63" },
  { code: "CN", label: "Китай", dial: "+86" },
  { code: "IN", label: "Индия", dial: "+91" },
  { code: "AE", label: "ОАЭ", dial: "+971" },
  { code: "SA", label: "Саудовская Аравия", dial: "+966" },
  { code: "DE", label: "Германия", dial: "+49" },
  { code: "FR", label: "Франция", dial: "+33" },
  { code: "IT", label: "Италия", dial: "+39" },
  { code: "ES", label: "Испания", dial: "+34" },
  { code: "GB", label: "Великобритания", dial: "+44" },
  { code: "US", label: "США", dial: "+1" },
  { code: "CA", label: "Канада", dial: "+1" },
  { code: "AU", label: "Австралия", dial: "+61" },
  { code: "JP", label: "Япония", dial: "+81" },
  { code: "KR", label: "Южная Корея", dial: "+82" },
  { code: "MANUAL", label: "Ввести вручную", dial: "" },
] as const;

export type PhoneCountryCode = (typeof PHONE_COUNTRIES)[number]["code"];

/**
 * Максимум национальных значащих цифр (без кода страны) по типовым правилам набора.
 * MANUAL не входит - для него см. maxManualNationalDigits.
 */
export const PHONE_NATIONAL_MAX_DIGITS: Record<Exclude<PhoneCountryCode, "MANUAL">, number> = {
  RU: 10,
  KZ: 10,
  VN: 9,
  UA: 9,
  BY: 9,
  AM: 8,
  AZ: 9,
  GE: 9,
  KG: 9,
  TJ: 9,
  UZ: 9,
  TR: 10,
  TH: 9,
  ID: 12,
  MY: 10,
  PH: 10,
  CN: 11,
  IN: 10,
  AE: 9,
  SA: 9,
  DE: 11,
  FR: 9,
  IT: 10,
  ES: 9,
  GB: 10,
  US: 10,
  CA: 10,
  AU: 9,
  JP: 10,
  KR: 10,
};

export function maxNationalDigitsForCountry(country: PhoneCountryCode): number {
  if (country === "MANUAL") return 12;
  return PHONE_NATIONAL_MAX_DIGITS[country];
}

/** E.164 до 15 цифр всего; для ручного кода (до 4 цифр) ограничиваем «местную» часть. */
export function maxManualNationalDigits(manualDialCode: string): number {
  const cc = digitsOnly(manualDialCode);
  const ccLen = cc.length > 0 ? cc.length : 1;
  return Math.min(14, Math.max(4, 15 - ccLen));
}

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatRuPhoneLocal(raw: string): string {
  const d = digitsOnly(raw).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export function formatGenericPhoneLocal(raw: string, maxDigits = 15): string {
  const d = digitsOnly(raw).slice(0, maxDigits);
  return d.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

/** Ввод «местной» части с учётом лимита страны (и форматирования RU/KZ). */
export function formatPhoneLocalInput(
  country: PhoneCountryCode,
  raw: string,
  manualDialCode: string,
): string {
  if (country === "MANUAL") {
    const max = maxManualNationalDigits(manualDialCode);
    const d = digitsOnly(raw).slice(0, max);
    return formatGenericPhoneLocal(d, max);
  }
  const max = PHONE_NATIONAL_MAX_DIGITS[country];
  const d = digitsOnly(raw).slice(0, max);
  if (country === "RU" || country === "KZ") return formatRuPhoneLocal(d);
  return formatGenericPhoneLocal(d, max);
}

/** Человекочитаемый номер для экрана (профиль, подписи). */
export function formatDisplayPhone(stored: string): string {
  const t = String(stored || "").trim();
  if (!t) return "";
  const parsed = parsePhoneValue(t);
  const country = PHONE_COUNTRIES.find((c) => c.code === parsed.country);
  let dial: string = country?.dial ?? "";
  let localDigits = digitsOnly(parsed.local);
  if (parsed.country === "MANUAL") {
    const m = t.match(/^\+\d{1,4}/);
    dial = m?.[0] ?? "+";
    localDigits = digitsOnly(t.slice(dial.length));
    const max = maxManualNationalDigits(dial);
    localDigits = localDigits.slice(0, max);
    return `${dial} ${formatGenericPhoneLocal(localDigits, max)}`.trim();
  }
  const max = PHONE_NATIONAL_MAX_DIGITS[parsed.country as Exclude<PhoneCountryCode, "MANUAL">];
  localDigits = localDigits.slice(0, max);
  if (parsed.country === "RU" || parsed.country === "KZ") {
    return `${dial} ${formatRuPhoneLocal(localDigits)}`.trim();
  }
  return `${dial} ${formatGenericPhoneLocal(localDigits, max)}`.trim();
}

export function parsePhoneValue(phone: string): { country: PhoneCountryCode; local: string } {
  const normalized = String(phone || "").trim();
  if (!normalized) {
    return { country: "RU", local: "" };
  }
  const matched = PHONE_COUNTRIES.filter((c) => c.code !== "MANUAL")
    .slice()
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => normalized.startsWith(c.dial));
  if (!matched) {
    return { country: "MANUAL", local: formatGenericPhoneLocal(normalized) };
  }
  const localRaw = normalized.slice(matched.dial.length);
  const max = PHONE_NATIONAL_MAX_DIGITS[matched.code as Exclude<PhoneCountryCode, "MANUAL">];
  const local =
    matched.code === "RU" || matched.code === "KZ"
      ? formatRuPhoneLocal(localRaw)
      : formatGenericPhoneLocal(localRaw, max);
  return { country: matched.code, local };
}

/**
 * Полный номер из буфера (например +79502047500): страна, местная часть, код для MANUAL.
 * Если строка без «+», но длинная — пробуем как E.164 с ведущими цифрами кода страны.
 */
export function parsePastedPhoneToFormState(raw: string): {
  country: PhoneCountryCode;
  local: string;
  manualDial: string;
} | null {
  let t = String(raw ?? "").trim();
  if (!t) return null;
  if (!t.startsWith("+")) {
    const d = digitsOnly(t);
    if (d.length < 10) return null;
    t = `+${d}`;
  }
  const parsed = parsePhoneValue(t);
  if (parsed.country === "MANUAL") {
    const m = t.match(/^\+\d{1,4}/);
    const manualDial = m?.[0] && m[0].length > 1 ? m[0] : "+";
    const localDigits = digitsOnly(t.slice(manualDial.length)).slice(0, maxManualNationalDigits(manualDial));
    return {
      country: "MANUAL",
      local: formatGenericPhoneLocal(localDigits, localDigits.length),
      manualDial,
    };
  }
  return { country: parsed.country, local: parsed.local, manualDial: "+7" };
}

export function buildFullPhoneE164(
  phoneCountry: PhoneCountryCode,
  phoneLocal: string,
  manualDialCode: string,
): string {
  const country = PHONE_COUNTRIES.find((c) => c.code === phoneCountry) ?? PHONE_COUNTRIES[0];
  const manualDial = `+${digitsOnly(manualDialCode).slice(0, 4)}`;
  const dial = country.code === "MANUAL" ? (manualDial.length > 1 ? manualDial : "") : country.dial;
  if (!dial) return "";
  const maxNat =
    country.code === "MANUAL"
      ? maxManualNationalDigits(manualDialCode)
      : PHONE_NATIONAL_MAX_DIGITS[country.code as Exclude<PhoneCountryCode, "MANUAL">];
  const normalizedLocal = formatPhoneLocalInput(phoneCountry, phoneLocal, manualDialCode);
  const natDigits = digitsOnly(normalizedLocal).slice(0, maxNat);
  return natDigits ? `${dial}${natDigits}` : "";
}
