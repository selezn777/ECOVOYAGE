import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";

const bodySchema = z.object({
  amountVnd: z.number().int().min(1).max(9_999_999_999),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
  nextPaymentDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const payload = parsed.data;
  const row = {
    point_id: id,
    amount_vnd: payload.amountVnd,
    paid_on: payload.paidOn,
    note: payload.note?.trim() || null,
  };

  const { error } = await supabase.from("rental_point_rent_payments").insert([row]);
  if (error) {
    if (/rental_point_rent_payments|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_point_rent_payments." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (payload.nextPaymentDate !== undefined) {
    const patch: Record<string, unknown> = {
      next_rent_payment_date: payload.nextPaymentDate,
      updated_at: new Date().toISOString(),
    };
    const { error: pointError } = await supabase.from("rental_points").update(patch).eq("id", id);
    if (pointError && !/next_rent_payment_date|column|does not exist/i.test(String(pointError.message))) {
      return NextResponse.json({ error: pointError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
