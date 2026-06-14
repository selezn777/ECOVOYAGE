import { getSheetsClient, isGoogleServiceAccountConfigured } from "@/lib/google-auth";

export function isGoogleSheetsConfigured(): boolean {
  return isGoogleServiceAccountConfigured() && Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("Не настроен GOOGLE_SHEETS_SPREADSHEET_ID");
  return id;
}

/** Читает диапазон (например "Tours!A1:Z"). Первая строка считается заголовком. */
export async function readSheetRange(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId(), range });
  return (res.data.values as string[][]) ?? [];
}

/** Полностью заменяет содержимое диапазона (например "Tours!A1"). */
export async function writeSheetRange(range: string, rows: Array<Array<string | number | null>>): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

/** Очищает диапазон перед записью — для полной перезаписи листа. */
export async function clearSheetRange(range: string): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetId(), range });
}

export async function appendSheetRows(range: string, rows: Array<Array<string | number | null>>): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

export async function getSpreadsheetTitle(): Promise<string> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId(), fields: "properties.title,sheets.properties.title" });
  return res.data.properties?.title ?? "";
}

/** Создаёт вкладку с данным названием, если её ещё нет в таблице. */
export async function ensureSheetTab(title: string): Promise<void> {
  const sheets = getSheetsClient();
  const id = spreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties.title" });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === title);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
}
