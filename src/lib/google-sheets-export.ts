import { getCashDashboardData, getEmployeeFinanceCardData, listAccountingTours, listAdvanceEmployeeOptions } from "@/lib/data";
import { localDateString } from "@/lib/scheduling";
import type { FinancePeriod } from "@/lib/types";

export type GoogleSheetsExportPayload = {
  generatedAt: string;
  period: "all";
  sheets: {
    tours: Array<Record<string, string | number | null>>;
    employees: Array<Record<string, string | number | null>>;
    operations: Array<Record<string, string | number | null>>;
    cash: Array<Record<string, string | number | null>>;
  };
};

export async function buildGoogleSheetsExportPayload(): Promise<GoogleSheetsExportPayload> {
  const period: FinancePeriod = { kind: "all" };
  const [tours, employeeOptions, cash] = await Promise.all([
    listAccountingTours(period, 400),
    listAdvanceEmployeeOptions(),
    getCashDashboardData(localDateString(), null),
  ]);

  const employeesRaw = await Promise.all(employeeOptions.slice(0, 200).map((e) => getEmployeeFinanceCardData(e.id)));
  const employees = employeesRaw.filter((e): e is NonNullable<typeof e> => Boolean(e));

  return {
    generatedAt: new Date().toISOString(),
    period: "all",
    sheets: {
      tours: tours.map((t) => ({
        tour_id: t.tourId,
        date: t.tourDate,
        tour: t.tourName,
        manager: t.managerName,
        pax: t.pax,
        income_vnd: t.incomeVnd,
        expense_vnd: t.expenseVnd,
        profit_vnd: t.profitVnd,
        status: t.accountingStatus,
      })),
      employees: employees.map((e) => ({
        employee_id: e.employeeId,
        name: e.employeeName,
        role: e.employeeRole,
        received_vnd: e.receivedVnd,
        spent_vnd: e.spentVnd,
        should_return_vnd: e.shouldReturnVnd,
        accrued_vnd: e.accruedVnd,
        paid_vnd: e.paidVnd,
        should_receive_vnd: e.shouldReceiveVnd,
      })),
      operations: cash.rows.map((r) => ({
        at: r.at,
        direction: r.direction,
        kind: r.kind,
        amount_vnd: r.amountVnd,
        summary: r.summary,
        note: r.note,
        attachment_url: r.attachmentUrl ?? null,
      })),
      cash: [],
    },
  };
}

