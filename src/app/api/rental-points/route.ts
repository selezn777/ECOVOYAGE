import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { RENTALS_PAGE_ROLES, canViewSalesPointAnalytics } from "@/lib/role-policy";
import { listRentalPoints } from "@/lib/data";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const canList =
    RENTALS_PAGE_ROLES.includes(session.role) || canViewSalesPointAnalytics(session.role);
  if (!canList) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const rows = await listRentalPoints();
  return NextResponse.json({ points: rows });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  addressNote: z.string().max(2000).optional(),
  photoUrl: z.string().url().max(2048).optional().nullable(),
  monthlyRentVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  rentDueDayOfMonth: z.number().int().min(1).max(30).optional(),
  nextRentPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!RENTALS_PAGE_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const row = {
    name: parsed.data.name.trim(),
    address_note: parsed.data.addressNote?.trim() || null,
    photo_url: parsed.data.photoUrl?.trim() || null,
    monthly_rent_vnd: parsed.data.monthlyRentVnd ?? 0,
    rent_due_day_of_month: parsed.data.rentDueDayOfMonth ?? 1,
    next_rent_payment_date: parsed.data.nextRentPaymentDate ?? null,
    notes: parsed.data.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const primary = await supabase.from("rental_points").insert([row]).select("id").maybeSingle();
  const legacy =
    primary.error && /next_rent_payment_date|column|does not exist/i.test(String(primary.error.message))
      ? await supabase
          .from("rental_points")
          .insert([
            {
              name: row.name,
              address_note: row.address_note,
              photo_url: row.photo_url,
              monthly_rent_vnd: row.monthly_rent_vnd,
              rent_due_day_of_month: row.rent_due_day_of_month,
              notes: row.notes,
              updated_at: row.updated_at,
            },
          ])
          .select("id")
          .maybeSingle()
      : null;
  const data = (legacy?.data ?? primary.data) as { id: string } | null;
  const error = legacy?.error ?? primary.error;
  if (error) {
    if (/rental_points|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_points." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
