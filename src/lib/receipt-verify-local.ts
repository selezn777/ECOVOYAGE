import { formatVnd } from "@/lib/format";
import { parseYmdLocal } from "@/lib/scheduling";
import {
  extractReceiptDatesYmd,
  guessVndAmountFromOcrText,
  listReceiptVndAmountCandidates,
} from "@/lib/receipt-ocr-parse";
import type { ReceiptVerifyExtracted, ReceiptVerifyIssue } from "@/lib/receipt-verify-types";

export type LocalReceiptVerifyInput = {
  description: string;
  amountVnd: number;
  tourDateYmd: string;
  expectedPax: number;
  hasAttachment?: boolean;
};

function stripExpensePrefix(text: string): string {
  return text
    .trim()
    .replace(/^\s*Бухгалтер · (?:водитель|диспетчер\/букинг):\s*/iu, "")
    .trim();
}

function minAbsDayDistance(tourYmd: string, receiptDates: string[]): number | null {
  const t = parseYmdLocal(tourYmd);
  if (!t || receiptDates.length === 0) return null;
  let min = Infinity;
  for (const d of receiptDates) {
    const dt = parseYmdLocal(d);
    if (!dt) continue;
    const diff = Math.round(Math.abs(dt.getTime() - t.getTime()) / 86_400_000);
    min = Math.min(min, diff);
  }
  return min === Infinity ? null : min;
}

function amountSeverity(diff: number, base: number): "danger" | "warn" | null {
  const dangerTh = Math.max(50_000, Math.round(base * 0.03));
  const warnTh = Math.max(8_000, Math.round(base * 0.012));
  if (diff > dangerTh) return "danger";
  if (diff > warnTh) return "warn";
  return null;
}

/**
 * Сверка текста чека (как сохранено в описании расхода) с днём тура, pax и суммой строки.
 */
export function buildLocalReceiptVerification(input: LocalReceiptVerifyInput): {
  issues: ReceiptVerifyIssue[];
  extracted: ReceiptVerifyExtracted;
} {
  const issues: ReceiptVerifyIssue[] = [];
  const text = stripExpensePrefix(input.description || "");
  const headMatch = text.match(/^[^\n]+/);
  const head = (headMatch?.[0] ?? "").trim();
  const prefix = head.length >= 2 ? `${head.slice(0, 40)}${head.length > 40 ? "…" : ""}: ` : "";

  if (!text) {
    return {
      issues: [
        {
          code: "no_text",
          severity: "warn",
          title: "Нет текста чека в записи",
          detail:
            "В описании расхода нет распознанного текста. Сверка возможна только по сумме строки и фото (если настроен разбор изображения).",
        },
      ],
      extracted: { totalVnd: null, datesYmd: [], paxInText: null },
    };
  }

  const dates = extractReceiptDatesYmd(text);
  const ocrGuess = guessVndAmountFromOcrText(text);
  const candidates = listReceiptVndAmountCandidates(text, 12);

  const paxInText = (() => {
    const m = text.match(/\b(?:So|SL|Số|số)\s*[:#]?\s*(\d{1,3})\b/i);
    if (m) return Number.parseInt(m[1], 10);
    const m2 = text.match(/\b(\d{1,2})\s*(?:взр|người lớn|adults?)\b/i);
    if (m2) return Number.parseInt(m2[1], 10);
    return null;
  })();

  const extracted: ReceiptVerifyExtracted = {
    totalVnd: ocrGuess,
    datesYmd: dates,
    paxInText: paxInText != null && paxInText > 0 ? paxInText : null,
  };

  if (input.tourDateYmd && dates.length > 0) {
    const dist = minAbsDayDistance(input.tourDateYmd, dates);
    const shown = dates.slice(0, 3).join(", ");
    if (dist != null) {
      if (dist === 0) {
        /* ок */
      } else if (dist === 1) {
        issues.push({
          code: "date_off_one",
          severity: "warn",
          title: "Дата чека на день отличается от дня тура",
          detail: `${prefix}в тексте: ${shown}. День тура в системе: ${input.tourDateYmd}. Возможен переход через полночь или часовой пояс - сверьте с оригиналом.`,
        });
      } else {
        issues.push({
          code: "date_mismatch",
          severity: "danger",
          title: "Дата в тексте чека не совпадает с днём тура",
          detail: `${prefix}найдены даты: ${shown}. День тура: ${input.tourDateYmd}.`,
        });
      }
    }
  } else if (input.tourDateYmd && dates.length === 0) {
    const looksLikeFullOcr =
      text.length > 220 ||
      /tổng|cộng|thanh\s*toán|vnd|đồng|фрагмент|ocr|сверка|tong\s+cong|đơn\s*giá/i.test(text);
    const mightHavePartialDate = /\d{1,2}\s*[./\\-]\s*\d{1,2}\b/.test(text);
    if (looksLikeFullOcr || mightHavePartialDate) {
      issues.push({
        code: "date_not_found",
        severity: "info",
        title: "Дата чека в тексте не распознана",
        detail: `${prefix}не удалось надёжно выделить дату (нестандартный формат или шум OCR). Проверьте по фото.`,
      });
    } else if (text.length > 28) {
      issues.push({
        code: "date_not_in_saved_desc",
        severity: "info",
        title: "В описании, скорее всего, нет даты с чека",
        detail:
          "В CRM часто сохранялось только короткое название объекта. Сейчас при сохранении расхода дата из OCR добавляется как «· чек ДД.ММ.ГГГГ». Сверьте дату по фото или включите разбор изображения (Gemini).",
      });
    }
  }

  if (ocrGuess != null && input.amountVnd > 0) {
    const diff = Math.abs(ocrGuess - input.amountVnd);
    const sev = amountSeverity(diff, input.amountVnd);
    if (sev === "danger") {
      issues.push({
        code: "amount_text_vs_line",
        severity: "danger",
        title: "Сумма в тексте сильно расходится со строкой расхода",
        detail: `${prefix}по тексту записи похожий итог: ${formatVnd(ocrGuess)}; в системе по строке: ${formatVnd(input.amountVnd)} (разница ${formatVnd(diff)}).`,
      });
    } else if (sev === "warn") {
      issues.push({
        code: "amount_text_vs_line_soft",
        severity: "warn",
        title: "Сумма в тексте и строка расхода заметно отличаются",
        detail: `${prefix}в тексте: ${formatVnd(ocrGuess)}, в строке: ${formatVnd(input.amountVnd)}.`,
      });
    }
  } else if (input.amountVnd > 0 && candidates.length >= 2) {
    const top = candidates[0]!;
    const second = candidates[1]!;
    const diff12 = Math.abs(top - second);
    const rel = top > 0 ? diff12 / top : 0;
    const matchesTop = Math.abs(top - input.amountVnd) <= Math.max(5000, input.amountVnd * 0.02);
    const matchesSecond = Math.abs(second - input.amountVnd) <= Math.max(5000, input.amountVnd * 0.02);
    if (rel < 0.12 && rel > 0.02 && !matchesTop && !matchesSecond) {
      issues.push({
        code: "amount_ambiguous",
        severity: "warn",
        title: "В тексте несколько близких крупных сумм",
        detail: `${prefix}например ${formatVnd(top)} и ${formatVnd(second)} - убедитесь, что в строке расхода выбран именно итог к оплате, а не подытог или цена за единицу.`,
      });
    }
  }

  const perPersonPatterns = [
    /(?:đơn\s*giá|đơn giá|за\s*человека)[^\d]{0,40}(\d{1,3}(?:\.\d{3})+)/giu,
    /(\d{1,3}(?:\.\d{3})+)\s*đ[^\n]{0,60}(?:за\s*человека|đơn|người)/giu,
  ];
  let perPersonVnd: number | null = null;
  for (const re of perPersonPatterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m?.[1]) {
      const n = Number.parseInt(m[1].replace(/\./g, ""), 10);
      if (n >= 1_000 && n < 100_000_000) {
        perPersonVnd = n;
        break;
      }
    }
  }

  if (perPersonVnd != null && input.expectedPax > 0 && input.amountVnd > 0 && perPersonVnd < input.amountVnd) {
    const implied = perPersonVnd * input.expectedPax;
    if (implied <= input.amountVnd * 2) {
      const diff = Math.abs(implied - input.amountVnd);
      const slack = Math.max(15_000, Math.round(input.amountVnd * 0.05));
      if (diff > slack) {
        issues.push({
          code: "per_person_pax",
          severity: "warn",
          title: "«Цена за человека» × туристы не сходится со строкой",
          detail: `${prefix}${formatVnd(perPersonVnd)} × ${input.expectedPax} ≈ ${formatVnd(implied)}, в строке ${formatVnd(input.amountVnd)} - проверьте скидки, детей или строку итога.`,
        });
      }
    }
  }

  if (paxInText != null && paxInText > 0 && input.expectedPax > 0 && paxInText !== input.expectedPax) {
    issues.push({
      code: "pax_mismatch",
      severity: "danger",
      title: "Число людей в тексте не совпадает с бронями тура",
      detail: `${prefix}в тексте: ${paxInText}, по броням в системе: ${input.expectedPax}.`,
    });
  }

  if (input.hasAttachment === false && input.amountVnd >= 300_000) {
    issues.push({
      code: "no_attachment",
      severity: "warn",
      title: "Нет прикреплённого фото чека",
      detail: `${prefix}сверка только по введённому тексту; откройте оригинал у гида или запросите фото.`,
    });
  }

  if (text.length < 50 && input.amountVnd >= 500_000) {
    issues.push({
      code: "short_ocr",
      severity: "warn",
      title: "Мало текста для автосверки",
      detail: `${prefix}короткое описание - возможны ошибки распознавания или ручное сокращение.`,
    });
  }

  const roundMillion = input.amountVnd > 0 && input.amountVnd % 1_000_000 === 0 && input.amountVnd >= 1_000_000;
  if (roundMillion && ocrGuess == null) {
    issues.push({
      code: "round_no_total",
      severity: "info",
      title: "Круглая сумма без явного итога в тексте",
      detail: `${prefix}сумма ${formatVnd(input.amountVnd)}; маркеров вроде «Tổng cộng» в тексте не найдено - проверьте итог на фото.`,
    });
  }

  return { issues, extracted };
}

export function dedupeVerifyIssues(a: ReceiptVerifyIssue[], b: ReceiptVerifyIssue[]): ReceiptVerifyIssue[] {
  const out = [...a];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  for (const x of b) {
    const nx = norm(x.title);
    if (!out.some((y) => norm(y.title) === nx || (nx.length > 12 && norm(y.title).includes(nx.slice(0, 12))))) {
      out.push(x);
    }
  }
  return out;
}
