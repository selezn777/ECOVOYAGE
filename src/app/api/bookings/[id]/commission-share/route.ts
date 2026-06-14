import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { FINANCE_ROLES } from "@/lib/role-policy";

const bodySchema = z.object({
  beneficiaryId: z.string().uuid().nullable(),
  percent: z.number().min(0).max(100).optional(),
});

async function loadBookingForAccess(bookingId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { supabase: null, booking: null, error: "Supabase не настроен." };
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id,manager_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !booking) return { supabase, booking: null, error: "Бронь не найдена" };
  return { supabase, booking: booking as { id: string; manager_id: string }, error: null };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!FINANCE_ROLES.includes(session.role)) return apiDenied();
  const { id } = await params;
  const loaded = await loadBookingForAccess(id);
  if (!loaded.supabase) return NextResponse.json({ error: loaded.error }, { status: 500 });
  if (!loaded.booking) return NextResponse.json({ error: loaded.error }, { status: 404 });
  if (session.role === "manager" && loaded.booking.manager_id !== session.id) return apiDenied();

  const { data, error } = await loaded.supabase
    .from("booking_commission_shares")
    .select("beneficiary_id,percent")
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !/booking_commission_shares|relation|does not exist/i.test(String(error.message))) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ share: null });
  const row = data as { beneficiary_id?: string | null; percent?: number | string | null };
  return NextResponse.json({
    share: row.beneficiary_id
      ? {
          beneficiaryId: String(row.beneficiary_id),
          percent: Math.max(0, Math.min(100, Number(row.percent || 0))),
        }
      : null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!FINANCE_ROLES.includes(session.role)) return apiDenied();

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await params;
  const loaded = await loadBookingForAccess(id);
  if (!loaded.supabase) return NextResponse.json({ error: loaded.error }, { status: 500 });
  if (!loaded.booking) return NextResponse.json({ error: loaded.error }, { status: 404 });
  if (session.role === "manager" && loaded.booking.manager_id !== session.id) return apiDenied();

  const supabase = loaded.supabase;
  const { beneficiaryId } = parsed.data;
  const pctRaw = Number(parsed.data.percent ?? 0);
  const pct = Math.round(Math.max(0, Math.min(100, pctRaw)) * 100) / 100;

  const { error: delErr } = await supabase.from("booking_commission_shares").delete().eq("booking_id", id);
  if (delErr && !/booking_commission_shares|relation|does not exist/i.test(String(delErr.message))) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (!beneficiaryId || pct <= 0) return NextResponse.json({ ok: true, share: null });
  if (beneficiaryId === loaded.booking.manager_id) {
    return NextResponse.json({ error: "Нельзя делить комиссию с самим собой." }, { status: 400 });
  }
  if (pct >= 100) {
    return NextResponse.json({ error: "Процент должен быть меньше 100." }, { status: 400 });
  }

  const { data: u, error: uErr } = await supabase
    .from("users")
    .select("id,is_active")
    .eq("id", beneficiaryId)
    .maybeSingle();
  if (uErr || !u || (u as { is_active?: boolean }).is_active !== true) {
    return NextResponse.json({ error: "Сотрудник не найден или не активен." }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("booking_commission_shares").insert([
    {
      booking_id: id,
      beneficiary_id: beneficiaryId,
      percent: pct,
      created_by: session.id,
    },
  ]);
  if (insErr && !/booking_commission_shares|relation|does not exist/i.test(String(insErr.message))) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, share: { beneficiaryId, percent: pct } });
}

