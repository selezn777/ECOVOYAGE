import { NextResponse } from "next/server";
import { buildRedReportWorkbook, buildWhiteReportWorkbook } from "@/lib/accounting-xlsx-export";
import { getSessionUser } from "@/lib/auth-session";
import {
  getCashDashboardData,
  getCashReconciliationReport,
  listAccountingTaxEmployees,
  listRedFileManualBankVnd,
} from "@/lib/data";
import { ACCOUNTING_REPORTS_ACCESS_ROLES } from "@/lib/role-policy";
import { tourBusinessTodayYmd } from "@/lib/scheduling";

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_REPORTS_ACCESS_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();
  const file = (url.searchParams.get("file") || "json").trim().toLowerCase();

  const today = tourBusinessTodayYmd();
  const fromYmd = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
  const toYmd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
  if (fromYmd > toYmd) {
    return NextResponse.json({ error: "Неверный период: «с даты» позже «по дату»" }, { status: 400 });
  }

  const viewer = { role: session.role, id: session.id };
  const period = { fromYmd, toYmd, fullGuideDisclosure: true as const };

  if (file === "json") {
    const [cash, recon, taxEmployees, bankVndRows] = await Promise.all([
      getCashDashboardData(today, viewer, period),
      getCashReconciliationReport(fromYmd, toYmd),
      listAccountingTaxEmployees(),
      listRedFileManualBankVnd(fromYmd, toYmd),
    ]);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: { fromYmd, toYmd },
      cash: {
        periodNetVnd: cash.currentBalanceVnd,
        rowCount: cash.totalRowCount,
        rows: cash.rows.map((r) => ({
          at: r.at,
          direction: r.direction,
          kind: r.kind,
          amountVnd: r.amountVnd,
          summary: r.summary,
          note: r.note,
          linkedTourId: r.linkedTourId ?? null,
        })),
      },
      reconciliation: recon,
      taxEmployees,
      redFileBankVndManual: bankVndRows,
    });
  }

  if (file === "white" || file === "belyy") {
    const [cash, recon, taxEmployees] = await Promise.all([
      getCashDashboardData(today, viewer, period),
      getCashReconciliationReport(fromYmd, toYmd),
      listAccountingTaxEmployees(),
    ]);
    const buf = await buildWhiteReportWorkbook({
      fromYmd,
      toYmd,
      generatedAtIso: new Date().toISOString(),
      cash,
      recon,
      taxEmployees,
    });
    const name = `belyy-${fromYmd}_${toYmd}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  }

  if (file === "red" || file === "krasnyy") {
    const [taxEmployees, bankVndRows] = await Promise.all([
      listAccountingTaxEmployees(),
      listRedFileManualBankVnd(fromYmd, toYmd),
    ]);
    const buf = await buildRedReportWorkbook({
      fromYmd,
      toYmd,
      generatedAtIso: new Date().toISOString(),
      taxEmployees,
      bankVndRows,
    });
    const name = `krasnyy-${fromYmd}_${toYmd}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  }

  return NextResponse.json({ error: "Параметр file: json | white | red" }, { status: 400 });
}
