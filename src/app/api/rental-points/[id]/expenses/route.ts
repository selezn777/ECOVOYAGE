import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

const bodySchema = z.object({
  amountVnd: z.number().int().positive().max(9_999_999_999),
  title: z.string().min(1).max(300),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
  attachmentUrl: z.string().url().max(2048).optional().nullable(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const { id: pointId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: pt } = await supabase.from("rental_points").select("id").eq("id", pointId).maybeSingle();
  if (!pt) return NextResponse.json({ error: "Точка не найдена" }, { status: 404 });

  const actorId = actorUuidOrNull(session.id);
  const attachmentUrl =
    parsed.data.attachmentUrl != null && String(parsed.data.attachmentUrl).trim()
      ? String(parsed.data.attachmentUrl).trim()
      : null;

  const { error } = await supabase.from("rental_point_expenses").insert([
    {
      point_id: pointId,
      amount_vnd: parsed.data.amountVnd,
      title: parsed.data.title.trim(),
      expense_date: parsed.data.expenseDate,
      note: parsed.data.note?.trim() || null,
      attachment_url: attachmentUrl,
      created_by: actorId,
      approval_status: "pending",
      approval_note: null,
      approved_at: null,
      approved_by: null,
      issued_at: null,
      issued_by: null,
    },
  ]);
  if (error && /approval_status|approval_note|approved_at|issued_at|column|does not exist/i.test(String(error.message))) {
    const legacy = await supabase.from("rental_point_expenses").insert([
      {
        point_id: pointId,
        amount_vnd: parsed.data.amountVnd,
        title: parsed.data.title.trim(),
        expense_date: parsed.data.expenseDate,
        note: parsed.data.note?.trim() || null,
        attachment_url: attachmentUrl,
        created_by: actorId,
      },
    ]);
    if (!legacy.error) return NextResponse.json({ ok: true });
    if (/rental_point_expenses|does not exist/i.test(String(legacy.error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_point_expenses." }, { status: 503 });
    }
    return NextResponse.json({ error: legacy.error.message }, { status: 500 });
  }
  if (error) {
    if (/rental_point_expenses|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_point_expenses." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
