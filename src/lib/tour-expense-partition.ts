import type { Role, TourExpense } from "@/lib/types";

const ACCT_BOOKING_PREFIX = "Бухгалтер · диспетчер/букинг:";

function isDispatcherRole(r: Role | null | undefined): boolean {
  return r === "dispatcher" || r === "booking_dispatcher";
}

function isAccountantBookingDispatchLine(e: TourExpense): boolean {
  return e.createdByRole === "accountant" && e.description.trimStart().startsWith(ACCT_BOOKING_PREFIX);
}

/** Расходы по туру: водитель, букинг/диспетчер, гид (остальное). */
export function partitionDispatcherExpenses(expenses: TourExpense[]) {
  const driver: TourExpense[] = [];
  const booking: TourExpense[] = [];
  const guide: TourExpense[] = [];
  for (const e of expenses) {
    if (e.category === "bus") {
      driver.push(e);
      continue;
    }
    if (isDispatcherRole(e.createdByRole) || isAccountantBookingDispatchLine(e)) {
      booking.push(e);
      continue;
    }
    guide.push(e);
  }
  return { driver, booking, guide };
}

export { ACCT_BOOKING_PREFIX };
