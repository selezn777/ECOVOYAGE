/** Для будущего OCR: нужна ли отложенная автоматическая проверка записи. */
export function receiptChecksNeedAccountantReview(checks: {
  looksGood: boolean;
  dateProblem?: boolean;
  dateVsTour: "match" | "mismatch" | "unknown";
}): boolean {
  if (checks.dateVsTour === "mismatch") return true;
  if (checks.dateProblem) return true;
  if (!checks.looksGood) return true;
  return false;
}
