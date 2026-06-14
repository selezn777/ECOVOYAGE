import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { CASH_MOVEMENTS_PAGE_MAX, CASH_MOVEMENTS_PAGE_SIZE } from "@/lib/cash-movements-constants";
import { getCashDashboardData } from "@/lib/data";
import { CASH_VIEW_ROLES } from "@/lib/role-policy";
import { localDateString } from "@/lib/scheduling";

/**
 * Подгрузка следующих операций журнала кассы (без дублирования полного списка в HTML первой отдачи).
 */
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!CASH_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") || String(CASH_MOVEMENTS_PAGE_SIZE), 10);
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : CASH_MOVEMENTS_PAGE_SIZE), CASH_MOVEMENTS_PAGE_MAX);

  const day = localDateString();
  const data = await getCashDashboardData(
    day,
    { role: session.role, id: session.id },
    null,
    { offset, limit },
  );

  return NextResponse.json({
    rows: data.rows,
    totalRowCount: data.totalRowCount,
    currentBalanceVnd: data.currentBalanceVnd,
  });
}
