/**
 * Финальный баланс «гид ↔ офис» для бухгалтера.
 *
 * Сначала считается кассовый итог **без** зарплаты (`cashNetVnd`):
 * доплаты у гида + долг туристов по броням (после выезда) + остаток депозита + доля офиса с магазина − расходы гида сверх депозита.
 * Положительный cashNet → гид должен офису; отрицательный → офис должен гиду.
 *
 * Зарплата - уже выплаченные/начисленные офисом гиду деньги: **уменьшает** соответствующую сторону
 * (если офис должен гиду 3,3 млн и зарплата 1,3 млн → остаток к выплате 2 млн).
 */
export type TourGuideSettlementBreakdown = {
  pendingTopupsVnd: number;
  /** Неоплаченный остаток по броням всех туристов тура - после выезда считается долгом гида перед офисом. */
  touristDebtVnd: number;
  depositVnd: number;
  guideExpensesTotalVnd: number;
  returnUnusedDepositVnd: number;
  pocketExpenseVnd: number;
  /** Доля офиса с магазина, которую гид должен сдать в офис (только подтверждённые записи, где деньги у гида). */
  shopOfficeShareVnd: number;
  /** Доля гида с магазина, которую офис должен выдать гиду (подтверждённые записи, деньги в офисе, ещё не выплачено). */
  shopGuideDueFromOfficeVnd: number;
  salaryVnd: number;
  /** Итог до учёта зарплаты: + гид должен офису, − офис должен гиду */
  cashNetVnd: number;
  /** Сколько гид ещё должен сдать офису после зарплаты */
  guideOwesAfterSalaryVnd: number;
  /** Сколько офис ещё должен гиду после зарплаты */
  officeOwesAfterSalaryVnd: number;
  /** @deprecated для совместимости: = cashNetVnd − salary (старая ошибочная логика не используется) */
  netSignedVnd: number;
};

export function computeTourGuideSettlementBreakdown(params: {
  pendingTopupsSumVnd: number;
  /** Сумма `dueVnd` по всем броням тура, если тур уже выехал (иначе передавать 0). */
  touristDebtSumVnd?: number;
  guideCashDepositVnd: number | null;
  guideExpensesTotalVnd: number;
  shopOfficeTotalVnd: number;
  shopGuideDueFromOfficeVnd: number;
  accountantGuideSalaryVnd: number | null;
}): TourGuideSettlementBreakdown {
  const dep = params.guideCashDepositVnd && params.guideCashDepositVnd > 0 ? params.guideCashDepositVnd : 0;
  const exp = Math.max(0, params.guideExpensesTotalVnd);
  const returnUnusedDepositVnd = Math.max(0, dep - exp);
  const pocketExpenseVnd = Math.max(0, exp - dep);
  const salary = params.accountantGuideSalaryVnd && params.accountantGuideSalaryVnd > 0 ? params.accountantGuideSalaryVnd : 0;
  const pending = Math.max(0, params.pendingTopupsSumVnd);
  const touristDebt = Math.max(0, params.touristDebtSumVnd ?? 0);
  const shop = Math.max(0, params.shopOfficeTotalVnd);
  const shopGuideDue = Math.max(0, params.shopGuideDueFromOfficeVnd);

  // Кассовый нетто без обязательств офиса перед гидом (зарплата/доля магазина).
  const cashNetVnd = pending + touristDebt + returnUnusedDepositVnd + shop - pocketExpenseVnd;
  // Все обязательства офиса перед гидом вычитают из кассового нетто.
  const officeLiabilityVnd = salary + shopGuideDue;
  const guideOwesAfterSalaryVnd = Math.max(0, cashNetVnd - officeLiabilityVnd);
  const officeOwesAfterSalaryVnd = Math.max(0, -cashNetVnd + officeLiabilityVnd);

  return {
    pendingTopupsVnd: pending,
    touristDebtVnd: touristDebt,
    depositVnd: dep,
    guideExpensesTotalVnd: exp,
    returnUnusedDepositVnd,
    pocketExpenseVnd,
    shopOfficeShareVnd: shop,
    shopGuideDueFromOfficeVnd: shopGuideDue,
    salaryVnd: salary,
    cashNetVnd,
    guideOwesAfterSalaryVnd,
    officeOwesAfterSalaryVnd,
    netSignedVnd: cashNetVnd - officeLiabilityVnd,
  };
}

export function guideOwesOfficeVnd(b: TourGuideSettlementBreakdown): number {
  return b.guideOwesAfterSalaryVnd;
}

export function officeOwesGuideVnd(b: TourGuideSettlementBreakdown): number {
  return b.officeOwesAfterSalaryVnd;
}
