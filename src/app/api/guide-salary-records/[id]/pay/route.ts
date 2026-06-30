import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { triggerGoogleSheetsAutoSync } from "@/lib/google-sheets-sync";
import { ACCOUNTANT_TOUR_SALARY_KIND } from "@/lib/sync-accountant-tour-salary-record";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const { id } = await ctx.params;
  const actorId = actorUuidOrNull(session.id);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: before } = await supabase
    .from("guide_salary_records")
    .select("id,status,tour_id,guide_id,amount_vnd,kind,note,attachment_url")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Начисление не найдено" }, { status: 404 });
  const beforeRow = before as {
    id: string;
    status: string;
    tour_id: string | null;
    guide_id: string | null;
    amount_vnd: number | string;
    kind: string | null;
    note: string | null;
    attachment_url: string | null;
  };
  if (String(beforeRow.status).toLowerCase() === "paid") {
    return NextResponse.json({ ok: true });
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("guide_salary_records")
    .update({ status: "paid", paid_at: nowIso, paid_by: actorId })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (beforeRow.kind === ACCOUNTANT_TOUR_SALARY_KIND) {
    const amount = Math.round(Number(beforeRow.amount_vnd || 0));
    if (amount > 0) {
      const { error: ledgerErr } = await supabase.from("cash_manual_ledger_entries").insert({
        direction: "out",
        amount_vnd: amount,
        title: "Зарплата гиду по туру",
        note: "Фактическая выплата начисления гиду",
        tour_id: beforeRow.tour_id,
        created_by: actorId,
        currency_code: "VND",
        payment_kind: "cash",
        attachment_url: beforeRow.attachment_url || null,
      });
      if (ledgerErr && !/cash_manual_ledger|does not exist/i.test(String(ledgerErr.message))) {
        return NextResponse.json({ error: `Выплата отмечена, но касса не записана: ${ledgerErr.message}` }, { status: 500 });
      }
    }
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: id,
    action: "pay",
    before: { status: beforeRow.status },
    after: { status: "paid" },
  });
  void triggerGoogleSheetsAutoSync("guide_salary_paid");

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const { id } = await ctx.params;
  const actorId = actorUuidOrNull(session.id);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: before } = await supabase
    .from("guide_salary_records")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Начисление не найдено" }, { status: 404 });

  const { error } = await supabase
    .from("guide_salary_records")
    .update({ status: "pending", paid_at: null, paid_by: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: id,
    action: "unpay",
    before: { status: (before as { status: string }).status },
    after: { status: "pending" },
  });

  return NextResponse.json({ ok: true });
}
