/** Старые БД без колонки needs_accountant_review в tour_manifests. */
export function isMissingNeedsAccountantReviewColumnError(message: string): boolean {
  return /needs_accountant_review/i.test(message) && /(column|schema cache)/i.test(message);
}
