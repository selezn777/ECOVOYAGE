import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { canManageGuideProfiles } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

const bodySchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const canManageGuides = canManageGuideProfiles(session.role);
  const canManageDispatchers = session.role === "dispatcher";
  if (!canManageGuides && !canManageDispatchers) {
    return apiDenied();
  }

  const { id } = await params;
  if (session.id === id) {
    return NextResponse.json({ error: "Нельзя изменить свой аккаунт здесь" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { data: target, error: loadErr } = await supabase
    .from("users")
    .select("id,role,is_active,full_name")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const targetRole = target.role as Role;
  if (canManageDispatchers) {
    if (targetRole !== "dispatcher" && targetRole !== "booking_dispatcher") {
      return NextResponse.json({ error: "Главный диспетчер может менять доступ только диспетчерам" }, { status: 400 });
    }
  } else if (targetRole !== "guide") {
    return NextResponse.json({ error: "Доступно только для роли «гид»" }, { status: 400 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { isActive } = parsed.data;
  const { error: updErr } = await supabase.from("users").update({ is_active: isActive }).eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "users",
    entityId: id,
    action: "set_active",
    before: { is_active: target.is_active },
    after: { is_active: isActive, full_name: target.full_name },
  });

  return NextResponse.json({ ok: true });
}
