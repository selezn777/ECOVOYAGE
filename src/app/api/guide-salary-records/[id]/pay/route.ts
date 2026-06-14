import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { triggerGoogleSheetsAutoSync } from "@/lib/google-sheets-sync";

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
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Начисление не найдено" }, { status: 404 });
  if (String((before as { status: string }).status).toLowerCase() === "paid") {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("guide_salary_records")
    .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: actorId })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: id,
    action: "pay",
    before: { status: (before as { status: string }).status },
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

