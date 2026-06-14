import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { getTourCashHandoverManagersSummary } from "@/lib/data";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: tourId } = await ctx.params;
  const data = await getTourCashHandoverManagersSummary(tourId);
  if (!data) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  return NextResponse.json(data);
}
