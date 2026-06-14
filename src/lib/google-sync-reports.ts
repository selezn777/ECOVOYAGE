import { buildGoogleSheetsExportPayload } from "@/lib/google-sheets-export";
import { clearSheetRange, ensureSheetTab, writeSheetRange } from "@/lib/google-sheets-client";

/** Категория «Отчёты» — финансовые срезы, только CRM → Таблица (отдельная вкладка на каждый раздел). */
export const TOURS_SHEET_TITLE = "Туры";
export const EMPLOYEES_SHEET_TITLE = "Сотрудники";
export const CASH_SHEET_TITLE = "Касса";

const TOURS_HEADERS = ["ID тура", "Дата", "Тур", "Менеджер", "Pax", "Доход ₫", "Расход ₫", "Прибыль ₫", "Статус"];
const EMPLOYEES_HEADERS = ["ID сотрудника", "Имя", "Роль", "Получено ₫", "Потрачено ₫", "Должен вернуть ₫", "Начислено ₫", "Выплачено ₫", "К выплате ₫"];
const CASH_HEADERS = ["Дата/время", "Направление", "Тип", "Сумма ₫", "Описание", "Примечание", "Вложение"];

export async function pushReportsToSheet(): Promise<{ tours: number; employees: number; cash: number }> {
  const payload = await buildGoogleSheetsExportPayload();

  await Promise.all([
    ensureSheetTab(TOURS_SHEET_TITLE),
    ensureSheetTab(EMPLOYEES_SHEET_TITLE),
    ensureSheetTab(CASH_SHEET_TITLE),
  ]);

  await clearSheetRange(`${TOURS_SHEET_TITLE}!A1:Z`);
  await writeSheetRange(`${TOURS_SHEET_TITLE}!A1`, [
    TOURS_HEADERS,
    ...payload.sheets.tours.map((t) => [t.tour_id, t.date, t.tour, t.manager, t.pax, t.income_vnd, t.expense_vnd, t.profit_vnd, t.status]),
  ]);

  await clearSheetRange(`${EMPLOYEES_SHEET_TITLE}!A1:Z`);
  await writeSheetRange(`${EMPLOYEES_SHEET_TITLE}!A1`, [
    EMPLOYEES_HEADERS,
    ...payload.sheets.employees.map((e) => [
      e.employee_id,
      e.name,
      e.role,
      e.received_vnd,
      e.spent_vnd,
      e.should_return_vnd,
      e.accrued_vnd,
      e.paid_vnd,
      e.should_receive_vnd,
    ]),
  ]);

  await clearSheetRange(`${CASH_SHEET_TITLE}!A1:Z`);
  await writeSheetRange(`${CASH_SHEET_TITLE}!A1`, [
    CASH_HEADERS,
    ...payload.sheets.operations.map((r) => [r.at, r.direction, r.kind, r.amount_vnd, r.summary, r.note, r.attachment_url]),
  ]);

  return {
    tours: payload.sheets.tours.length,
    employees: payload.sheets.employees.length,
    cash: payload.sheets.operations.length,
  };
}
