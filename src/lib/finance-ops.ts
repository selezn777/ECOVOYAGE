import type { FinanceOperation, FinanceOperationKind, FinanceStatus, MoneyCurrency, TourExpense, PaymentRowBrief, GuideSalaryRecord } from "@/lib/types";

function normalizeMoney(parts: {
  currency?: MoneyCurrency;
  amount?: number;
  fxRateToVnd?: number;
  amountVnd?: number;
}): { currency: MoneyCurrency; amount: number; fxRateToVnd: number; amountVnd: number } {
  const currency: MoneyCurrency = parts.currency ?? "VND";
  const fxRateToVnd = currency === "VND" ? 1 : Math.max(0, Number(parts.fxRateToVnd ?? 0));
  const amount = Math.max(0, Number(parts.amount ?? 0));
  const amountVnd =
    parts.amountVnd != null
      ? Math.max(0, Math.round(Number(parts.amountVnd)))
      : currency === "VND"
        ? Math.max(0, Math.round(amount))
        : Math.max(0, Math.round(amount * fxRateToVnd));
  return { currency, amount, fxRateToVnd: currency === "VND" ? 1 : fxRateToVnd, amountVnd };
}

export function makeFinanceOp(input: {
  id: string;
  kind: FinanceOperationKind;
  status: FinanceStatus;
  createdAt: string;
  tourId?: string | null;
  bookingId?: string | null;
  employeeId?: string | null;
  createdById?: string | null;
  createdByRole?: FinanceOperation["createdByRole"];
  currency?: MoneyCurrency;
  amount?: number;
  fxRateToVnd?: number;
  amountVnd?: number;
  title?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
}): FinanceOperation {
  const m = normalizeMoney(input);
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    createdAt: input.createdAt,
    tourId: input.tourId ?? null,
    bookingId: input.bookingId ?? null,
    employeeId: input.employeeId ?? null,
    createdById: input.createdById ?? null,
    createdByRole: input.createdByRole ?? null,
    currency: m.currency,
    amount: m.amount,
    fxRateToVnd: m.fxRateToVnd,
    amountVnd: m.amountVnd,
    title: input.title ?? null,
    note: input.note ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
  };
}

/** Маппинг текущих расходов тура в единые операции. */
export function opsFromTourExpenses(rows: TourExpense[]): FinanceOperation[] {
  return rows.map((r) =>
    makeFinanceOp({
      id: `expense:${r.id}`,
      kind: "tour_expense",
      status: r.accountantReviewedAt ? "approved" : r.pendingAccountantReview ? "pending" : "created",
      createdAt: r.createdAt,
      tourId: r.tourId,
      employeeId: r.createdById ?? null,
      createdById: r.createdById ?? null,
      currency: "VND",
      amount: r.amountVnd,
      amountVnd: r.amountVnd,
      title: r.category,
      note: r.description,
      attachmentUrl: r.attachmentUrl ?? null,
    }),
  );
}

/**
 * Маппинг текущих платежей туристов в единые операции.
 * Пока платежи привязаны к bookingId; tourId подтянем позже (через booking → tour).
 */
export function opsFromPayments(rows: PaymentRowBrief[]): FinanceOperation[] {
  return rows.map((p) =>
    makeFinanceOp({
      id: `payment:${p.id}`,
      kind: "tour_income",
      status: "approved",
      createdAt: p.createdAt,
      bookingId: p.bookingId,
      currency: "VND",
      amount: p.amountVnd,
      amountVnd: p.amountVnd,
      title: p.kind,
    }),
  );
}

/** Платежи туристов с привязкой к туру (через bookingId → tourId). */
export function opsFromPaymentsWithTourId(
  rows: PaymentRowBrief[],
  bookingIdToTourId: Map<string, string>,
): FinanceOperation[] {
  return rows.map((p) =>
    makeFinanceOp({
      id: `payment:${p.id}`,
      kind: "tour_income",
      status: "approved",
      createdAt: p.createdAt,
      bookingId: p.bookingId,
      tourId: bookingIdToTourId.get(p.bookingId) ?? null,
      currency: "VND",
      amount: p.amountVnd,
      amountVnd: p.amountVnd,
      title: p.kind,
    }),
  );
}

/** Маппинг начислений/выплат гиду (текущая таблица guide_salary_records). */
export function opsFromGuideSalaryRecords(rows: GuideSalaryRecord[]): FinanceOperation[] {
  return rows.flatMap((r) => {
    const base = {
      tourId: r.tourId,
      employeeId: r.guideId,
      createdAt: r.createdAt,
      currency: "VND" as const,
      amount: r.amountVnd,
      amountVnd: r.amountVnd,
      title: r.kind ?? "guide_salary",
      note: r.note ?? null,
      attachmentUrl: r.attachmentUrl ?? null,
    };
    const accrual = makeFinanceOp({
      id: `guide_salary_accrual:${r.id}`,
      kind: "accrual",
      status: r.status === "paid" ? "paid" : "approved",
      ...base,
    });
    const payout =
      r.status === "paid"
        ? makeFinanceOp({
            id: `guide_salary_payout:${r.id}`,
            kind: "payout",
            status: "paid",
            ...base,
            createdAt: r.paidAt ?? r.createdAt,
          })
        : null;
    return payout ? [accrual, payout] : [accrual];
  });
}

export type EmployeeBalance = {
  receivedVnd: number;
  spentVnd: number;
  netCashVnd: number;
  accruedVnd: number;
  paidVnd: number;
  shouldReturnVnd: number;
  shouldReceiveVnd: number;
};

/**
 * Баланс сотрудника по единому списку операций.
 * Сейчас без подотчёта (advance_issue/advance_return) - появится, когда добавим эти операции.
 */
export function calcEmployeeBalance(ops: FinanceOperation[], employeeId: string): EmployeeBalance {
  let receivedVnd = 0;
  let spentVnd = 0;
  let accruedVnd = 0;
  let paidVnd = 0;

  for (const op of ops) {
    if (op.employeeId !== employeeId) continue;
    if (op.status === "rejected") continue;

    if (op.kind === "advance_issue" && (op.status === "approved" || op.status === "paid")) receivedVnd += op.amountVnd;
    if (op.kind === "advance_return" && (op.status === "approved" || op.status === "paid")) spentVnd += op.amountVnd;
    if (op.kind === "tour_expense" && (op.status === "approved" || op.status === "paid")) spentVnd += op.amountVnd;

    if (op.kind === "accrual" && (op.status === "approved" || op.status === "paid")) accruedVnd += op.amountVnd;
    if (op.kind === "payout" && op.status === "paid") paidVnd += op.amountVnd;
  }

  const netCashVnd = receivedVnd - spentVnd;
  const shouldReturnVnd = Math.max(0, netCashVnd);
  const shouldReceiveVnd = Math.max(0, accruedVnd - paidVnd);

  return { receivedVnd, spentVnd, netCashVnd, accruedVnd, paidVnd, shouldReturnVnd, shouldReceiveVnd };
}

export type TourFinanceSummary = { incomeVnd: number; expenseVnd: number; profitVnd: number };

export function calcTourSummary(ops: FinanceOperation[], tourId: string): TourFinanceSummary {
  let incomeVnd = 0;
  let expenseVnd = 0;
  for (const op of ops) {
    if (op.tourId !== tourId) continue;
    if (op.status === "rejected") continue;
    if (op.kind === "tour_income" && (op.status === "approved" || op.status === "paid")) incomeVnd += op.amountVnd;
    if (op.kind === "tour_expense" && (op.status === "approved" || op.status === "paid")) expenseVnd += op.amountVnd;
  }
  return { incomeVnd, expenseVnd, profitVnd: incomeVnd - expenseVnd };
}

export type CashSummary = { cashInVnd: number; cashOutVnd: number; cashNetVnd: number };

/**
 * Касса по операциям. Пока учитывает:
 * - tour_income (приход)
 * - advance_issue / payout (расход)
 * - advance_return (приход)
 * Расширим по мере добавления операций и статусов.
 */
export function calcCashSummary(ops: FinanceOperation[]): CashSummary {
  let cashInVnd = 0;
  let cashOutVnd = 0;
  for (const op of ops) {
    if (op.status === "rejected") continue;
    const ok = op.status === "approved" || op.status === "paid";
    if (!ok) continue;
    if (op.kind === "tour_income") cashInVnd += op.amountVnd;
    if (op.kind === "advance_return") cashInVnd += op.amountVnd;
    if (op.kind === "advance_issue") cashOutVnd += op.amountVnd;
    if (op.kind === "payout") cashOutVnd += op.amountVnd;
  }
  return { cashInVnd, cashOutVnd, cashNetVnd: cashInVnd - cashOutVnd };
}

