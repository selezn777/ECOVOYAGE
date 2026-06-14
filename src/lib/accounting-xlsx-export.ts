import ExcelJS from "exceljs";
import type {
  AccountingTaxEmployeeRow,
  CashDashboardData,
  RedFileManualLedgerRow,
} from "@/lib/data";
import type { CashReconciliationReport, CashLedgerRow } from "@/lib/types";
import { VIETNAM_MROT_VND_BY_ZONE } from "@/lib/vietnam-payroll-hints";

const HEADER_FILL = "FF1F4E79";
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } as ExcelJS.Color };

function roleRu(r: string): string {
  const m: Record<string, string> = {
    manager: "Менеджер",
    chief_manager: "Главный менеджер",
    guide: "Гид",
    chief_guide: "Главный гид",
    dispatcher: "Диспетчер",
    booking_dispatcher: "Диспетчер броней",
  };
  return m[r] || r;
}

function taxStatusGroup(e: AccountingTaxEmployeeRow): { label: string; sort: number; fill: string } {
  if (e.payrollTaxDeclarationFiledAt) {
    return { label: "Декларация подана", sort: 1, fill: "FFC6EFCE" };
  }
  if (e.payrollIncomeTaxWithheldAt) {
    return { label: "НДФЛ удержан, декларация не отмечена", sort: 2, fill: "FFFFFFCC" };
  }
  if (e.payrollPersonalIncomeTaxPercent != null && e.payrollPersonalIncomeTaxPercent > 0) {
    return { label: "Ставка указана, удержание не зафиксировано", sort: 3, fill: "FFFFCC99" };
  }
  return { label: "Нет ставки НДФЛ в карточке", sort: 4, fill: "FFE7E6E6" };
}

function kindRu(k: CashLedgerRow["kind"]): string {
  const m: Record<string, string> = {
    tour_income: "Оплата туриста",
    refund: "Возврат",
    advance_issue: "Подотчёт выдан",
    advance_return: "Подотчёт возврат",
    payout: "Выплата (гид/зарплата)",
    manual_in: "Вручную приход",
    manual_out: "Вручную расход",
    office_cash_handover: "Сдача с тура",
  };
  return m[k] || k;
}

export async function buildWhiteReportWorkbook(args: {
  fromYmd: string;
  toYmd: string;
  generatedAtIso: string;
  cash: CashDashboardData;
  recon: CashReconciliationReport | null;
  taxEmployees: AccountingTaxEmployeeRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Asia Mix CRM";
  wb.created = new Date();

  const meta = wb.addWorksheet("О_отчёте", { views: [{ state: "frozen", ySplit: 1 }] });
  meta.addRow(["Белый файл - полная выгрузка за период (касса, сотрудники, налоговые метки)"]);
  meta.addRow(["Период с", args.fromYmd, "по", args.toYmd]);
  meta.addRow(["Сформировано (UTC)", args.generatedAtIso]);
  meta.addRow([]);
  meta.addRow([
    "Пояснение: «Ставка НДФЛ в карточке» ≠ удержание и ≠ поданная декларация. Группы в листе «Налоги_сотрудники» выделены цветом.",
  ]);
  meta.getColumn(1).width = 100;

  const cashWs = wb.addWorksheet("Касса_построчно", { views: [{ state: "frozen", ySplit: 1 }] });
  cashWs.columns = [
    { header: "Дата/время (как в БД)", key: "at", width: 22 },
    { header: "Вид", key: "kind", width: 22 },
    { header: "Направление", key: "dir", width: 12 },
    { header: "Сумма ₫", key: "amt", width: 16 },
    { header: "Описание", key: "sum", width: 70 },
    { header: "Примечание", key: "note", width: 36 },
  ];
  cashWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });
  for (const r of args.cash.rows) {
    cashWs.addRow({
      at: r.at,
      kind: kindRu(r.kind),
      dir: r.direction === "in" ? "приход" : "расход",
      amt: r.amountVnd,
      sum: r.summary,
      note: r.note ?? "",
    });
  }

  const taxWs = wb.addWorksheet("Налоги_сотрудники", { views: [{ state: "frozen", ySplit: 1 }] });
  taxWs.columns = [
    { header: "Группа (статус)", key: "grp", width: 40 },
    { header: "ФИО", key: "name", width: 28 },
    { header: "Роль", key: "role", width: 22 },
    { header: "База взносов ₫", key: "base", width: 16 },
    { header: "НДФЛ %", key: "pit", width: 10 },
    { header: "Зона МРОТ", key: "zone", width: 12 },
    { header: "МРОТ ₫ (ориентир)", key: "mrot", width: 16 },
    { header: "Удержание зафиксировано", key: "wh", width: 22 },
    { header: "Декларация подана", key: "dec", width: 22 },
  ];
  taxWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });

  const sorted = [...args.taxEmployees].sort((a, b) => {
    const sa = taxStatusGroup(a).sort;
    const sb = taxStatusGroup(b).sort;
    if (sa !== sb) return sa - sb;
    return a.fullName.localeCompare(b.fullName, "ru");
  });

  for (const e of sorted) {
    const g = taxStatusGroup(e);
    const mrot =
      e.vietnamMrotZone && e.vietnamMrotZone in VIETNAM_MROT_VND_BY_ZONE
        ? VIETNAM_MROT_VND_BY_ZONE[e.vietnamMrotZone]
        : "";
    const row = taxWs.addRow({
      grp: g.label,
      name: e.fullName,
      role: roleRu(e.role),
      base: e.payrollContributionBaseVnd ?? "",
      pit: e.payrollPersonalIncomeTaxPercent ?? "",
      zone: e.vietnamMrotZone ?? "",
      mrot,
      wh: e.payrollIncomeTaxWithheldAt ? String(e.payrollIncomeTaxWithheldAt).slice(0, 19) : "",
      dec: e.payrollTaxDeclarationFiledAt ? String(e.payrollTaxDeclarationFiledAt).slice(0, 19) : "",
    });
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: g.fill } };
    });
  }

  const sumWs = wb.addWorksheet("Сводка_касса", { views: [{ state: "frozen", ySplit: 1 }] });
  sumWs.columns = [
    { header: "Показатель", key: "k", width: 44 },
    { header: "₫", key: "v", width: 18 },
  ];
  sumWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });
  if (args.recon) {
    sumWs.addRow({ k: "Оплаты туристов по броням (за период)", v: args.recon.paymentsIncomeVnd });
    sumWs.addRow({ k: "У менеджера за период", v: args.recon.paymentsDepositVnd });
    sumWs.addRow({ k: "Office_cash за период", v: args.recon.paymentsOfficeCashVnd });
    sumWs.addRow({ k: "Доплаты гида созданы за период", v: args.recon.paymentsTopupCreatedVnd });
    sumWs.addRow({ k: "Доплаты приняты в кассу (дата в периоде)", v: args.recon.paymentsTopupRemittedInPeriodVnd });
    sumWs.addRow({ k: "Возвраты туристам", v: -args.recon.paymentsRefundVnd });
    sumWs.addRow({ k: "В кассу за период (ручные проводки)", v: args.recon.manualInVnd });
    sumWs.addRow({ k: "Из кассы за период (ручные проводки)", v: -args.recon.manualOutVnd });
    for (const row of args.recon.manualLedgerCurrencyTotals) {
      sumWs.addRow({ k: `Ручные проводки, ${row.currencyCode}: в кассу (экв. ₫)`, v: row.sumInVnd });
      sumWs.addRow({ k: `Ручные проводки, ${row.currencyCode}: из кассы (экв. ₫)`, v: -row.sumOutVnd });
    }
    sumWs.addRow({ k: "Долг по броням (снимок)", v: args.recon.snapshotTotalBookingDueVnd });
    sumWs.addRow({ k: "Доплаты у гида без кассы (снимок)", v: args.recon.snapshotPendingGuideTopupVnd });
    sumWs.addRow({ k: "Выдача подотчёта", v: -args.recon.advanceIssueVnd });
    sumWs.addRow({ k: "Возврат подотчёта", v: args.recon.advanceReturnVnd });
  } else {
    sumWs.addRow({ k: "Сводка за период недоступна", v: "" });
  }

  const hoWs = wb.addWorksheet("Сдачи_каналы", { views: [{ state: "frozen", ySplit: 1 }] });
  hoWs.columns = [
    { header: "Канал", key: "ch", width: 28 },
    { header: "Операций", key: "c", width: 12 },
    { header: "Сумма ₫", key: "vnd", width: 16 },
    { header: "Сумма USD", key: "usd", width: 14 },
  ];
  hoWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });
  if (args.recon) {
    for (const row of args.recon.handoverTotalsRows) {
      hoWs.addRow({ ch: row.label, c: row.count, vnd: row.sumVnd, usd: row.sumUsd });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildRedReportWorkbook(args: {
  fromYmd: string;
  toYmd: string;
  generatedAtIso: string;
  taxEmployees: AccountingTaxEmployeeRow[];
  bankVndRows: RedFileManualLedgerRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Asia Mix CRM";
  wb.created = new Date();

  const meta = wb.addWorksheet("О_красном_файле", { views: [{ state: "frozen", ySplit: 1 }] });
  meta.addRow(["Красный файл - для налоговой: ориентир МРОТ по зоне + только банковские переводы в ₫ из ручного журнала кассы."]);
  meta.addRow(["Не включает наличные, USD и прочие скрытые обороты. Уточняйте с вашим бухгалтером по Вьетнаму."]);
  meta.addRow(["Период с", args.fromYmd, "по", args.toYmd]);
  meta.addRow(["Сформировано (UTC)", args.generatedAtIso]);
  meta.getColumn(1).width = 95;

  const mrotWs = wb.addWorksheet("МРОТ_база", { views: [{ state: "frozen", ySplit: 1 }] });
  mrotWs.columns = [
    { header: "ФИО", key: "name", width: 30 },
    { header: "Роль", key: "role", width: 20 },
    { header: "Зона", key: "zone", width: 10 },
    { header: "МРОТ по зоне ₫", key: "mrot", width: 18 },
    { header: "База в карточке ₫", key: "base", width: 18 },
    { header: "НДФЛ %", key: "pit", width: 10 },
  ];
  mrotWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9E2A2A" } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });
  for (const e of args.taxEmployees) {
    const mrot =
      e.vietnamMrotZone && e.vietnamMrotZone in VIETNAM_MROT_VND_BY_ZONE
        ? VIETNAM_MROT_VND_BY_ZONE[e.vietnamMrotZone]
        : "";
    mrotWs.addRow({
      name: e.fullName,
      role: roleRu(e.role),
      zone: e.vietnamMrotZone ?? "",
      mrot,
      base: e.payrollContributionBaseVnd ?? "",
      pit: e.payrollPersonalIncomeTaxPercent ?? "",
    });
  }

  const bankWs = wb.addWorksheet("Переводы_VND", { views: [{ state: "frozen", ySplit: 1 }] });
  bankWs.columns = [
    { header: "Дата/время", key: "at", width: 22 },
    { header: "Направление", key: "d", width: 12 },
    { header: "Сумма ₫", key: "amt", width: 16 },
    { header: "Название", key: "title", width: 36 },
    { header: "Примечание", key: "note", width: 40 },
  ];
  bankWs.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9E2A2A" } };
    c.font = HEADER_FONT as ExcelJS.Font;
  });
  for (const r of args.bankVndRows) {
    bankWs.addRow({
      at: r.createdAt,
      d: r.direction === "in" ? "приход" : "расход",
      amt: r.amountVnd,
      title: r.title,
      note: r.note ?? "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
