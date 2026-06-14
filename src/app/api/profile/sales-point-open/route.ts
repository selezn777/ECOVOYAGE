import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { confirmManagerSalesPointOpenToday } from "@/lib/data";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "manager") {
    return NextResponse.json({ error: "Только менеджер может подтвердить открытие точки." }, { status: 403 });
  }
  const res = await confirmManagerSalesPointOpenToday(session.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
