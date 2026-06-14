import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";

/** Бухгалтерия: доплата от гида принята в кассу → учитывается в оплате и доходе. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: paymentId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  const nowIso = new Date().toISOString();

  const { data: row, error: selErr } = await supabase
    .from("payments")
    .select("id,kind,remitted_to_cash_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (selErr) {
    if (/remitted_to_cash_at/i.test(String(selErr.message))) {
      return NextResponse.json(
        { error: "Выполните миграцию: колонки remitted_to_cash_at в payments." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });

  const kind = String((row as { kind: string }).kind);
  if (kind !== "topup") {
    return NextResponse.json({ error: "Подтверждать можно только доплаты (topup)." }, { status: 400 });
  }
  if ((row as { remitted_to_cash_at: string | null }).remitted_to_cash_at) {
    return NextResponse.json({ error: "Уже отмечено как принято в кассу." }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("payments")
    .update({ remitted_to_cash_at: nowIso, remitted_to_cash_by: actorId })
    .eq("id", paymentId);

  if (upErr) {
    if (/remitted_to_cash_at/i.test(String(upErr.message))) {
      return NextResponse.json({ error: "Миграция payments.remitted_to_cash_* не применена." }, { status: 500 });
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "payment",
    entityId: paymentId,
    action: "confirm_remittance",
    after: { remitted_to_cash_at: nowIso },
  });

  return NextResponse.json({ ok: true });
}
