import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { getManagerTourHandoverContext } from "@/lib/data";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: tourId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get("managerId")?.trim();
  if (!managerId) {
    return NextResponse.json({ error: "Укажите managerId" }, { status: 400 });
  }

  const data = await getManagerTourHandoverContext(tourId, managerId);
  if (!data) return NextResponse.json({ error: "Тур или менеджер не найдены" }, { status: 404 });
  return NextResponse.json(data);
}
