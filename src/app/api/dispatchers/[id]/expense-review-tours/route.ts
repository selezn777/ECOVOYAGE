import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";
import { getDispatcherExpenseReviewSummary } from "@/lib/data";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: dispatcherId } = await ctx.params;
  const data = await getDispatcherExpenseReviewSummary(dispatcherId);
  if (!data) return NextResponse.json({ error: "Не удалось загрузить" }, { status: 404 });
  return NextResponse.json(data);
}
