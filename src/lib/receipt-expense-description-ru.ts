import { extractReceiptShortLabel } from "@/lib/receipt-ocr-parse";

const MAX = 48;

/** Сравнение без вьетнамских диакритик (OCR пляшет). */
function viFolded(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/**
 * Известные объекты по всему тексту OCR (не только первая строка).
 * Порядок: специфичные шаблоны раньше общих.
 */
function matchKnownAttractionRu(raw: string): string | null {
  const f = viFolded(raw);
  const compact = f.replace(/[\s@._\-:/\\]+/g, "");

  if (compact.includes("duonghamdieukhac")) return "Глиняная деревня";
  if (
    compact.includes("dieukhac") &&
    (compact.includes("duong") || f.includes("sao viet") || f.includes("da lat"))
  ) {
    return "Глиняная деревня";
  }
  if (f.includes("duong ham dieu khac") || f.includes("ham dieu khac")) return "Глиняная деревня";
  if (/dieu.{0,24}khac|khac.{0,16}dieu/i.test(f)) return "Глиняная деревня";
  if (compact.includes("duongham")) return "Глиняная деревня";

  if (/sao\s*viet|sao\s*vi[eệ]t/i.test(raw) && (f.includes("dieu khac") || f.includes("duong ham"))) {
    return "Глиняная деревня";
  }
  if (f.includes("sao viet") && f.includes("da lat") && !/datanla|dat\s*anla/i.test(f)) {
    const g = raw.replace(/\s/g, "");
    if (
      /96[,.]?0{3}|1056[,.]?0{3}|1[,.]?056[,.]?008|1[,.]?056[,.]?0{3}|1056000|1056008|96000/i.test(g) ||
      /\b11\b/.test(raw)
    ) {
      return "Глиняная деревня";
    }
  }

  if (/CRAZY\s+HOUSE|Hang\s+Nga|Hằng\s+Nga/i.test(raw)) return "Дом безумия";

  if (/DATANLA|ĐATANLA|Datanla/i.test(raw)) {
    if (/trượt|máng|TRƯỢT|xe\s*trượt/i.test(raw)) return "Датанла, электросани";
    return "Датанла";
  }

  if (/BA\s*NA|BANA\s*HIL|Sun\s*World\s*Ba/i.test(raw)) return "Ba Na Hills";

  if (/\bVinpearl\b/i.test(raw)) return "Vinpearl";

  return null;
}

export function looksLikeOcrGarbageLine(s: string): boolean {
  const t = s.trim();
  if (t.length < 3) return true;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return true;
  if (letters.length / t.length < 0.35) return true;
  if (/[=|_]{2,}/.test(t) || /^[=+\-|_\s]+[\p{L}]/u.test(t)) return true;
  const compact = t.replace(/\s/g, "");
  if (/([\p{L}])\1{2,}/u.test(compact)) return true;
  if (/(.)\1{3,}/u.test(compact)) return true;
  if (/[а-яёА-ЯЁіІїЇєЄ]/.test(t) && /[a-zA-Z]{2,}/.test(t)) return true;
  return false;
}

/** Типичная сумма группы в Đường Hầm Điêu Khắc при плохом OCR текста. */
function isLikelyClayTunnelByAmountAndOcr(guessedVnd: number | null | undefined, raw: string): boolean {
  if (guessedVnd == null || guessedVnd < 1) return false;
  const nearClay = Math.abs(guessedVnd - 1_056_000) <= 24 || guessedVnd === 1_056_008;
  if (!nearClay) return false;
  const f = viFolded(raw);
  if (/crazy\s*house|hang\s*nga|datanla|ba\s*na|vinpearl/i.test(f)) return false;
  if (f.replace(/[\s@._\-:/\\]+/g, "").includes("datanla")) return false;
  return (
    f.length >= 18 ||
    /\d{2,3}[,.]\d{3}/.test(raw) ||
    /sao|lat|duong|ham|khac|dieukhac|viet|vnd|dong/i.test(f)
  );
}

/**
 * Одна короткая строка «за что» (как гид вводит без чека: пара слов).
 * Второй аргумент не используется (совместимость вызовов).
 */
export function buildExpenseDescriptionRuFromOcr(ocrText: string, guessedTotalVnd?: number | null): string {
  const raw = ocrText.trim();
  if (!raw) return "";

  const known = matchKnownAttractionRu(raw);
  if (known) return known;

  if (isLikelyClayTunnelByAmountAndOcr(guessedTotalVnd, raw)) return "Глиняная деревня";

  const short = extractReceiptShortLabel(raw);
  if (short && !looksLikeOcrGarbageLine(short)) return short.slice(0, MAX);

  const lines = raw.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(1, 6)) {
    const fromLine = matchKnownAttractionRu(line);
    if (fromLine) return fromLine;
    const sl = extractReceiptShortLabel(line);
    if (sl && !looksLikeOcrGarbageLine(sl)) return sl.slice(0, MAX);
  }

  const line = (lines[0] ?? "").replace(/\s+/g, " ");
  if (line && !looksLikeOcrGarbageLine(line)) return line.slice(0, MAX);

  return "Чек (объект по фото)";
}

/**
 * Короткий текст для карточки расхода: убирает старый автотекст, при известных местах - 2-3 слова.
 */
export function formatExpenseDescriptionForDisplay(description: string): string {
  if (!description) return description;

  const src = description;
  const fromKnown = matchKnownAttractionRu(src);
  if (fromKnown && (src.length > 28 || /[=_|]{2,}/.test(src) || looksLikeOcrGarbageLine(src))) {
    return fromKnown;
  }

  const hadVerbose =
    /вариант\s+трассы|Ориентир\s+тарифа|Итого\s+по\s+чеку|туристзона\s+у\s+водопада|Сверка\s+с\s+прошлыми/i.test(
      src,
    );

  let s = src.replace(/\s*Сверка\s+с\s+прошлыми\s+турами[\s\S]*$/iu, "").trimEnd();

  s = s.replace(
    /\s+вариант\s+трассы:\s*[\s\S]*?(?=\s+Ориентир\s+тарифа|\s+Итого\s+по\s+чеку|\s+Количество\s+мест|$)/gi,
    "",
  );
  s = s.replace(/\s+Ориентир\s+тарифа\s+с\s+чека[^.]*\.?/gi, "");
  s = s.replace(/\s+Итого\s+по\s+чеку[^.]*\.?/gi, "");
  s = s.replace(/\s+Количество\s+мест\s+по\s+строкам\s+SL[^.]*\.?/gi, "");
  s = s.replace(/\s+Услуга(\s*\([^)]*\))?:\s*[^.]*\.?/gi, "");
  s = s.replace(/\s+На\s+Датанле\s+у\s+водопада[^.]*\.?/gi, "");

  s = s.replace(/\s{2,}/g, " ").replace(/,\s*$/g, "").trim();

  const low = s.toLowerCase();
  const longish = hadVerbose || s.length > 36;

  if (longish && /crazy\s*house|дом безумия|hang\s+nga|hằng\s+nga/i.test(low)) {
    return "Дом безумия";
  }
  if (longish && /датанла|\bdatanla\b/i.test(src) && !/crazy/i.test(low)) {
    if (/trượt|máng|xe\s*trượt|электросани/i.test(src)) return "Датанла, электросани";
    return "Датанла";
  }
  if (longish && (/глинян|глина|duongham|dieu\s*khac|điêu\s*khắc/i.test(low) || /duonghamdieukhac/i.test(src))) {
    return "Глиняная деревня";
  }
  if (longish && /ba\s*na|bana\s*hil|sun\s*world\s*ba/i.test(low)) return "Ba Na Hills";
  if (longish && /\bvinpearl\b/i.test(low)) return "Vinpearl";

  if (looksLikeOcrGarbageLine(s) && s.length < 80) return "Чек (уточнить по фото)";

  if (s.length > 42) return `${s.slice(0, 40).replace(/\s+\S*$/, "")}…`;
  return s;
}
