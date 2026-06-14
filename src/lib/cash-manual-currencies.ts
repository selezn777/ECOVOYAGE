/** Коды ISO 4217 для ручных операций кассы: VND → USD → СНГ → EUR → остальные. */
export const CASH_MANUAL_CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: "VND", label: "VND - вьетнамский донг" },
  { code: "USD", label: "USD - доллар США" },
  { code: "RUB", label: "RUB - российский рубль" },
  { code: "KZT", label: "KZT - тенге (Казахстан)" },
  { code: "BYN", label: "BYN - белорусский рубль" },
  { code: "UAH", label: "UAH - украинская гривна" },
  { code: "AMD", label: "AMD - армянский драм" },
  { code: "AZN", label: "AZN - азербайджанский манат" },
  { code: "KGS", label: "KGS - сом (Кыргызстан)" },
  { code: "TJS", label: "TJS - сомони (Таджикистан)" },
  { code: "UZS", label: "UZS - сум (Узбекистан)" },
  { code: "TMT", label: "TMT - манат (Туркменистан)" },
  { code: "MDL", label: "MDL - молдавский лей" },
  { code: "EUR", label: "EUR - евро" },
  { code: "CNY", label: "CNY - юань" },
  { code: "GBP", label: "GBP - фунт стерлингов" },
  { code: "JPY", label: "JPY - иена" },
  { code: "KRW", label: "KRW - вона" },
  { code: "THB", label: "THB - бат" },
  { code: "SGD", label: "SGD - сингапурский доллар" },
  { code: "AUD", label: "AUD - австралийский доллар" },
  { code: "CHF", label: "CHF - швейцарский франк" },
  { code: "PLN", label: "PLN - злотый" },
  { code: "TRY", label: "TRY - турецкая лира" },
  { code: "GEL", label: "GEL - лари (Грузия)" },
  { code: "AED", label: "AED - дирхам ОАЭ" },
  { code: "IDR", label: "IDR - индонезийская рупия" },
  { code: "MYR", label: "MYR - ринггит" },
  { code: "PHP", label: "PHP - филиппинское песо" },
];

export function normalizeCurrencyCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .slice(0, 3)
    .replace(/[^A-Z]/g, "");
}

export function isValidIso4217Code(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}
