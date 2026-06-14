/** Подписи видов платежа из enum payment_kind */
export function paymentKindRu(kind: string): string {
  switch (kind) {
    case "deposit":
      return "Депозит";
    case "topup":
      return "Доплата";
    case "refund":
      return "Возврат";
    default:
      return kind;
  }
}
