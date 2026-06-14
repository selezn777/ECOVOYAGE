import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canEditUserRosterPrivacy, canEditUserRosterPrivacyForTarget } from "@/lib/role-policy";

const bodySchema = z.object({
  hiddenFromRoster: z.boolean().optional(),
  rosterContactPrivate: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditUserRosterPrivacy(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.hiddenFromRoster === undefined && parsed.data.rosterContactPrivate === undefined) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: target, error: targetErr } = await supabase.from("users").select("id,role").eq("id", id).maybeSingle();
  if (targetErr || !target) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const targetRole = String((target as { role?: string }).role || "");
  if (
    targetRole !== "director" &&
    targetRole !== "chief_manager" &&
    targetRole !== "manager" &&
    targetRole !== "chief_guide" &&
    targetRole !== "guide" &&
    targetRole !== "accountant" &&
    targetRole !== "dispatcher" &&
    targetRole !== "booking_dispatcher"
  ) {
    return NextResponse.json({ error: "Недопустимая роль сотрудника" }, { status: 400 });
  }

  if (!canEditUserRosterPrivacyForTarget(session.role, targetRole)) {
    return NextResponse.json({ error: "Нет доступа к этой роли сотрудника" }, { status: 403 });
  }

  if (session.role === "chief_guide" || session.role === "chief_manager") {
    const { data: createdBySession, error: ownErr } = await supabase
      .from("audit_logs")
      .select("entity_id")
      .eq("entity", "users")
      .eq("action", "create_team_user")
      .eq("entity_id", id)
      .eq("actor_id", session.id)
      .limit(1);

    if (ownErr) {
      return NextResponse.json({ error: ownErr.message }, { status: 500 });
    }
    if (!createdBySession || createdBySession.length === 0) {
      return NextResponse.json({ error: "Можно менять только сотрудников, которых создали вы" }, { status: 403 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.hiddenFromRoster !== undefined) patch.hidden_from_roster = parsed.data.hiddenFromRoster;
  if (parsed.data.rosterContactPrivate !== undefined) patch.roster_contact_private = parsed.data.rosterContactPrivate;

  const { error } = await supabase.from("users").update(patch).eq("id", id);
  if (error) {
    if (/hidden_from_roster|roster_contact_private|column|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: колонки ростера в users." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
