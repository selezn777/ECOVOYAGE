import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { tourBusinessTodayYmd, tourCalendarDateFromStartAtIso } from "@/lib/scheduling";
import { triggerGoogleSheetsAutoSync } from "@/lib/google-sheets-sync";

const bodySchema = z.object({
  amountVnd: z.number().int().min(0),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tour, error: selErr } = await supabase
    .from("tours")
    .select("id,start_at")
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const startAt = (tour as { start_at: string }).start_at;
  const tourDate = tourCalendarDateFromStartAtIso(startAt) || new Date(startAt).toISOString().slice(0, 10);
  const today = tourBusinessTodayYmd();
  if (tourDate <= today) {
    return NextResponse.json({ error: "Депозит можно задать только для предстоящих туров." }, { status: 400 });
  }

  const value = parsed.data.amountVnd <= 0 ? null : parsed.data.amountVnd;
  const { error: upErr } = await supabase.from("tours").update({ guide_cash_deposit_vnd: value }).eq("id", tourId);

  if (upErr) {
    if (/guide_cash_deposit_vnd/i.test(String(upErr.message))) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонка guide_cash_deposit_vnd в tours." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour",
    entityId: tourId,
    action: "guide_cash_deposit",
    after: { guide_cash_deposit_vnd: value },
  });
  void triggerGoogleSheetsAutoSync("tour_guide_deposit");

  return NextResponse.json({ ok: true });
}
