import { buildLocalReceiptVerification } from "@/lib/receipt-verify-local";

export type ExpenseReceiptHintInput = {
  description: string;
  amountVnd: number;
  tourDateYmd: string;
  expectedPax: number;
  /** false = в системе нет фото чека */
  hasAttachment?: boolean;
};

/** @deprecated Используйте API `/api/expenses/[id]/receipt-verify` - там же Gemini по фото. */
export function buildExpenseReceiptHints(input: ExpenseReceiptHintInput): string[] {
  const { issues } = buildLocalReceiptVerification({
    description: input.description,
    amountVnd: input.amountVnd,
    tourDateYmd: input.tourDateYmd,
    expectedPax: input.expectedPax,
    hasAttachment: input.hasAttachment,
  });
  return issues.map((i) => (i.detail.trim().startsWith(i.title) ? i.detail : `${i.title}: ${i.detail}`));
}

export function buildExpenseComplianceIntro(input: ExpenseReceiptHintInput): string {
  const text = (input.description || "")
    .trim()
    .replace(/^\s*Бухгалтер · (?:водитель|диспетчер\/букинг):\s*/iu, "")
    .trim();
  if (!text) {
    return "Нет текста чека - загрузите фото или попросите гида дополнить запись.";
  }
  return "Сверка с днём тура, числом туристов по броням и суммой строки. При наличии фото и ключа Gemini выполняется дополнительный разбор изображения.";
}

export function buildExpenseComplianceSummary(input: ExpenseReceiptHintInput): string {
  const hints = buildExpenseReceiptHints(input);
  const text = (input.description || "")
    .trim()
    .replace(/^\s*Бухгалтер · (?:водитель|диспетчер\/букинг):\s*/iu, "")
    .trim();
  if (!text) return "";
  if (hints.length === 0) {
    return "По тексту записи заметных расхождений с датой тура, людьми и суммами не найдено. Откройте фото и при необходимости обновите страницу - подгрузится проверка по изображению.";
  }
  return `Замечания: ${hints.map((h) => h.replace(/\.$/, "")).join("; ")}.`;
}
