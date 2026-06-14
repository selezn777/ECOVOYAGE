import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

const bodySchema = z.object({
  closedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id: pointId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: pt } = await supabase.from("rental_points").select("id").eq("id", pointId).maybeSingle();
  if (!pt) return NextResponse.json({ error: "Точка не найдена" }, { status: 404 });

  const { error } = await supabase.from("rental_point_closed_days").insert([
    {
      point_id: pointId,
      closed_date: parsed.data.closedDate,
      note: parsed.data.note?.trim() || null,
    },
  ]);
  if (error) {
    if (/unique|duplicate/i.test(String(error.message))) {
      return NextResponse.json({ error: "Эта дата уже отмечена для точки" }, { status: 400 });
    }
    if (/rental_point_closed_days|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_point_closed_days." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
