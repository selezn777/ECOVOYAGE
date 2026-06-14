import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";

const bodySchema = z.object({
  /** true - пометить тур выполненным (закрыт для дашборда); false - только отметка в журнале, статус тура не трогаем */
  markTourCompleted: z.boolean(),
});

/**
 * Кнопки внизу сводки бухгалтера: «Закрыто» / «Пока открыто».
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);

  const { data: before } = await supabase.from("tours").select("id,status").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (!before) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  if (parsed.data.markTourCompleted) {
    const { error } = await supabase.from("tours").update({ status: "completed" }).eq("id", tourId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAuditLog(supabase, {
      actorId,
      entity: "tour",
      entityId: tourId,
      action: "accounting_mark_completed",
      before: { status: (before as { status: string }).status },
      after: { status: "completed" },
    });
  } else {
    await writeAuditLog(supabase, {
      actorId,
      entity: "tour",
      entityId: tourId,
      action: "accounting_save_open",
      after: { note: "Сводка сохранена без смены статуса тура" },
    });
  }

  return NextResponse.json({ ok: true });
}
