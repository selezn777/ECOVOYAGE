const MAX_MERCHANT_WORDS = 6;

/**
 * Короткое название заведения с первой строки OCR: слова до «мусора» (короткий mixed-case, цифры, не-буквы).
 * Пример: "CRAZY HOUSE aR Mii 56 thud: …" → "Crazy House"
 */
export function extractReceiptShortLabel(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let head = (t.split(/\r?\n/, 1)[0] ?? "").trim();
  const colonIdx = head.indexOf(":");
  if (colonIdx > 0 && colonIdx < 100) {
    const left = head.slice(0, colonIdx).trim();
    const leftParts = left.split(/\s+/).filter(Boolean);
    if (leftParts.length >= 2) head = left;
  }
  const tokens = head.split(/\s+/).filter(Boolean);
  const kept: string[] = [];

  for (const rawTok of tokens) {
    if (kept.length >= MAX_MERCHANT_WORDS) break;
    const w = rawTok.match(/^[\p{L}]+/u)?.[0] ?? "";
    if (!w) break;
    if (/\d/.test(rawTok)) break;
    if (w.length === 2) {
      if (w === w.toUpperCase()) {
        kept.push(w);
        continue;
      }
      break;
    }
    if (w.length < 3) break;
    const isAllUpper = w === w.toUpperCase() && /[\p{Lu}]/u.test(w);
    const isAllLower = w === w.toLowerCase();
    const isTitle = /^[\p{Lu}][\p{Ll}]+$/u.test(w);
    if (isAllUpper || isAllLower || isTitle) {
      kept.push(w);
      continue;
    }
    break;
  }

  if (kept.length === 0) return null;

  const titleCaseWord = (word: string) => {
    if (word.length <= 2 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };
  return kept.map(titleCaseWord).join(" ");
}

function parseDottedVndToken(raw: string): number | null {
  if (!/^\d{1,3}(?:\.\d{3})+(?:\.\d{3})*$/.test(raw)) return null;
  const n = Number.parseInt(raw.replace(/\./g, ""), 10);
  return n >= 1_000 && n < 10_000_000_000 ? n : null;
}

function parseCommaVndToken(raw: string): number | null {
  if (!/^\d{1,3}(?:,\d{3})+(?:,\d{3})*$/.test(raw)) return null;
  const n = Number.parseInt(raw.replace(/,/g, ""), 10);
  return n >= 1_000 && n < 10_000_000_000 ? n : null;
}

/**
 * Сумма к оплате на вьетнамском чеке.
 * Нельзя брать max по всему тексту: подытог «Cộng» часто больше итога «TỔNG CỘNG» после скидки (11-й турист и т.д.).
 */
export function guessVndAmountFromOcrText(text: string): number | null {
  const normalized = text.replace(/\uFF0E/g, ".");

  const tryKeywordPatterns = (): number | null => {
    const patterns: RegExp[] = [
      /(?:t[ổo]ng\s*c[ộo]ng|tong\s+cong|tổng\s*cộng)\s*[:\s-]*\s*(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/giu,
      /(?:t[ổo]ng\s*c[ộo]ng|tong\s+cong)\D{0,80}(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/giu,
      /\bTOTAL\b\s*[:\s-]*\s*(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/gi,
      /(?:thanh\s*to[áa]n|thanh\s*toan)\D{0,50}(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/giu,
      /(?:ti[ềe]n\s*m[ặa]t|tien\s*mat)\D{0,50}(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/giu,
      /(?:ph[ảa]i\s*tr[ảa]|phai\s*tra)\D{0,40}(\d{1,3}(?:\.\d{3})+(?:\.\d{3})*)/giu,
    ];
    for (const re of patterns) {
      const r = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = r.exec(normalized)) !== null) {
        const n = parseDottedVndToken(m[1]);
        if (n != null) return n;
      }
    }
    return null;
  };

  const collectFromLineSkippingSubtotal = (): number[] => {
    const out: number[] = [];
    const lines = normalized.split(/\r?\n+/);
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      const hasCong = /\bc[ộo]ng\b/ui.test(l);
      const hasTongCong = /t[ổo]ng\s*c[ộo]ng/ui.test(l) || /tong\s+cong/i.test(l);
      if (hasCong && !hasTongCong) continue;
      if (/^\s*gi[ảa]m\b/ui.test(l) || /^\s*giam\b/i.test(l)) continue;

      for (const m of l.matchAll(/\d{1,3}(?:\.\d{3})+(?:\.\d{3})*/g)) {
        const n = parseDottedVndToken(m[0]);
        if (n != null) out.push(n);
      }
      for (const m of l.matchAll(/\d{1,3}(?:,\d{3})+(?:,\d{3})*/g)) {
        const n = parseCommaVndToken(m[0]);
        if (n != null) out.push(n);
      }
      for (const m of l.matchAll(/\b(\d{5,9})\b/g)) {
        const n = Number.parseInt(m[1], 10);
        if (n >= 10_000 && n < 10_000_000_000) out.push(n);
      }
    }
    return out;
  };

  const fromKeywords = tryKeywordPatterns();
  if (fromKeywords != null) return fromKeywords;

  const filtered = collectFromLineSkippingSubtotal();
  if (filtered.length > 0) return Math.max(...filtered);

  const candidates: number[] = [];
  for (const m of normalized.matchAll(/\d{1,3}(?:\.\d{3})+(?:\.\d{3})*/g)) {
    const n = parseDottedVndToken(m[0]);
    if (n != null) candidates.push(n);
  }
  for (const m of normalized.matchAll(/\d{1,3}(?:,\d{3})+(?:,\d{3})*/g)) {
    const n = parseCommaVndToken(m[0]);
    if (n != null) candidates.push(n);
  }
  for (const m of normalized.matchAll(/\b(\d{5,9})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 10_000 && n < 10_000_000_000) candidates.push(n);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/** Крупные суммы из текста чека (для поиска двусмысленных итогов). По убыванию, без дублей. */
export function listReceiptVndAmountCandidates(text: string, maxCount = 10): number[] {
  const normalized = text
    .replace(/\uFF0E/g, ".")
    .replace(/\u3002/g, ".")
    .replace(/[\u00A0\u202F]/g, " ");
  const candidates = new Set<number>();
  for (const m of normalized.matchAll(/\d{1,3}(?:\.\d{3})+(?:\.\d{3})*/g)) {
    const n = parseDottedVndToken(m[0]);
    if (n != null) candidates.add(n);
  }
  for (const m of normalized.matchAll(/\d{1,3}(?:,\d{3})+(?:,\d{3})*/g)) {
    const n = parseCommaVndToken(m[0]);
    if (n != null) candidates.add(n);
  }
  for (const m of normalized.matchAll(/\b(\d{5,9})\b/g)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 10_000 && n < 10_000_000_000) candidates.add(n);
  }
  return [...candidates].sort((a, b) => b - a).slice(0, maxCount);
}

/**
 * Даты в тексте чека → YYYY-MM-DD.
 * Учитываем D.M.YYYY / DD.MM.YYYY / DD,MM,YYYY (запятая), полноширинную точку, пробелы, время после даты.
 * Для D.M.Y интерпретация: день-месяц-год (Вьетнам/Европа).
 */
export function extractReceiptDatesYmd(text: string): string[] {
  const seen = new Set<string>();
  const add = (yyyy: string, mm: string, dd: string) => {
    const y = Number(yyyy);
    const mo = Number(mm);
    const d = Number(dd);
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const mm2 = mo.toString().padStart(2, "0");
    const dd2 = d.toString().padStart(2, "0");
    seen.add(`${y}-${mm2}-${dd2}`);
  };

  const normalized = text
    .replace(/\uFF0E/g, ".")
    .replace(/\u3002/g, ".")
    .replace(/[\u00A0\u202F]/g, " ");

  const reDmy = /(?<![\d/])(\d{1,2})\s*[./\\-]\s*(\d{1,2})\s*[./\\-]\s*(20\d{2})(?!\d)/gu;
  let m: RegExpExecArray | null;
  while ((m = reDmy.exec(normalized)) !== null) {
    add(m[3], m[2], m[1]);
  }

  const reDmyComma = /(?<![\d/])(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(20\d{2})(?!\d)/gu;
  while ((m = reDmyComma.exec(normalized)) !== null) {
    add(m[3], m[2], m[1]);
  }

  const reIso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = reIso.exec(normalized)) !== null) {
    add(m[1], m[2], m[3]);
  }

  const reYmdSlash = /\b(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/g;
  while ((m = reYmdSlash.exec(normalized)) !== null) {
    add(m[1], m[2], m[3]);
  }

  const reDmy2 = /(?<![\d/])(\d{1,2})\s*[./\\-]\s*(\d{1,2})\s*[./\\-]\s*(\d{2})(?!\d)/gu;
  while ((m = reDmy2.exec(normalized)) !== null) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    add(String(y), m[2], m[1]);
  }

  const reCompact = /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
  while ((m = reCompact.exec(normalized)) !== null) {
    add(m[1], m[2], m[3]);
  }

  return [...seen];
}

/** Короткий заголовок строки расхода для бухгалтера (без простыни OCR). */
export function expenseDisplayHeading(description: string): string {
  let full = (description || "").trim();
  if (!full) return "-";
  full = full.replace(/^\s*Бухгалтер · (?:водитель|диспетчер\/букинг):\s*/iu, "").trim();
  if (!full) return "-";
  let head = full;
  const cutMarkers = [/Сверка\s+с\s+прошлыми/i, /фрагмент\s+OCR/i, /\n[─\-_=]{3,}/];
  for (const re of cutMarkers) {
    const i = full.search(re);
    if (i > 8) {
      head = full.slice(0, i).trim();
      break;
    }
  }
  let firstLine = (head.split(/\r?\n/, 1)[0] ?? head).trim();
  firstLine = firstLine.replace(/^\d{1,2}\s*[--.)]\s*/u, "").trim();
  const short = extractReceiptShortLabel(firstLine) || extractReceiptShortLabel(head);
  if (short && short.length >= 2) return short;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

/** Первая дата YYYY-MM-DD в имени файла (например `photo_2024-03-28_13-44-17.jpg`). */
export function extractYmdFromFilename(name: string): string | null {
  const m = String(name).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function receiptDateMismatchAgainstTour(tourDateYmd: string, ocrText: string | null): boolean {
  if (!ocrText?.trim()) return false;
  const dates = extractReceiptDatesYmd(ocrText);
  if (dates.length === 0) return false;
  return dates.some((d) => d !== tourDateYmd);
}
