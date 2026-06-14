import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { RENTALS_PAGE_ROLES } from "@/lib/role-policy";
import { getRentalPointById } from "@/lib/data";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const { id } = await ctx.params;
  const detail = await getRentalPointById(id);
  if (!detail) return NextResponse.json({ error: "Точка не найдена" }, { status: 404 });
  return NextResponse.json(detail);
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  addressNote: z.union([z.string().max(2000), z.null()]).optional(),
  photoUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
  monthlyRentVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  rentDueDayOfMonth: z.number().int().min(1).max(30).optional(),
  nextRentPaymentDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  notes: z.union([z.string().max(4000), z.null()]).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const d = parsed.data;
  let hasField = false;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) {
    patch.name = d.name.trim();
    hasField = true;
  }
  if (d.addressNote !== undefined) {
    patch.address_note = d.addressNote?.trim() || null;
    hasField = true;
  }
  if (d.photoUrl !== undefined) {
    patch.photo_url = d.photoUrl?.trim() || null;
    hasField = true;
  }
  if (d.monthlyRentVnd !== undefined) {
    patch.monthly_rent_vnd = d.monthlyRentVnd;
    hasField = true;
  }
  if (d.rentDueDayOfMonth !== undefined) {
    patch.rent_due_day_of_month = d.rentDueDayOfMonth;
    hasField = true;
  }
  if (d.nextRentPaymentDate !== undefined) {
    patch.next_rent_payment_date = d.nextRentPaymentDate;
    hasField = true;
  }
  if (d.notes !== undefined) {
    patch.notes = d.notes?.trim() || null;
    hasField = true;
  }

  if (!hasField) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const primary = await supabase.from("rental_points").update(patch).eq("id", id);
  const legacyPatch =
    primary.error && /next_rent_payment_date|column|does not exist/i.test(String(primary.error.message))
      ? Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "next_rent_payment_date"))
      : null;
  const fallback =
    legacyPatch && Object.keys(legacyPatch).length > 1
      ? await supabase.from("rental_points").update(legacyPatch).eq("id", id)
      : null;
  const error = fallback?.error ?? primary.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { error } = await supabase.from("rental_points").delete().eq("id", id);
  if (error) {
    if (/rental_points|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_points." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
