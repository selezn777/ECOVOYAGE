import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { getSalesPointRatingReport } from "@/lib/data";
import { canViewSalesPointAnalytics } from "@/lib/role-policy";

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canViewSalesPointAnalytics(session.role)) {
    return apiDenied();
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Укажите from и to в формате YYYY-MM-DD" }, { status: 400 });
  }

  const rows = await getSalesPointRatingReport(from, to);
  return NextResponse.json({ from, to, rows });
}
