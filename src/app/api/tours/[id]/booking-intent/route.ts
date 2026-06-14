import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { apiDenied } from "@/lib/api-denied";
import { canCreateBooking, FINANCE_ROLES } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  adults: z.number().int().min(0).max(20),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(20),
  editingBookingId: z.string().uuid().optional(),
});

const INTENT_TTL_MIN = 20;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role)) return apiDenied();

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { adults, children, infants, editingBookingId } = parsed.data;
  if (adults + children + infants <= 0) {
    return NextResponse.json({ error: "Укажите хотя бы одного туриста." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { id: tourId } = await params;

  let editingBookingIdNorm: string | null = null;
  if (editingBookingId) {
    /** Правка брони: те же роли, что могут открыть мастер правки (в т.ч. старший гид). */
    const canHoldEditIntent =
      FINANCE_ROLES.includes(session.role) || session.role === "chief_guide";
    if (!canHoldEditIntent) {
      return apiDenied();
    }
    const { data: editBooking, error: ebErr } = await supabase
      .from("bookings")
      .select("id,tour_id,manager_id")
      .eq("id", editingBookingId)
      .is("deleted_at", null)
      .maybeSingle();
    if (ebErr || !editBooking) {
      return NextResponse.json({ error: "Бронь для правки не найдена." }, { status: 404 });
    }
    const tr = editBooking as { tour_id?: string; manager_id?: string };
    if (String(tr.tour_id || "") !== tourId) {
      return NextResponse.json({ error: "Бронь относится к другому туру." }, { status: 400 });
    }
    if (session.role === "manager" && String(tr.manager_id || "") !== session.id) {
      return apiDenied();
    }
    editingBookingIdNorm = editingBookingId;
  }

  const expiresAt = new Date(Date.now() + INTENT_TTL_MIN * 60_000).toISOString();
  const upsertPayload: Record<string, unknown> = {
    tour_id: tourId,
    manager_id: session.id,
    adults,
    children,
    infants,
    expires_at: expiresAt,
    editing_booking_id: editingBookingIdNorm,
  };

  let { error } = await supabase.from("tour_booking_intents").upsert(upsertPayload, {
    onConflict: "tour_id,manager_id",
  });
  if (error && /editing_booking_id|column|does not exist/i.test(String(error.message))) {
    const { editing_booking_id: _eb, ...withoutEdit } = upsertPayload;
    void _eb;
    ({ error } = await supabase.from("tour_booking_intents").upsert(withoutEdit, {
      onConflict: "tour_id,manager_id",
    }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    expiresAt,
    ttlMinutes: INTENT_TTL_MIN,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }
  const { id: tourId } = await params;
  let sel = await supabase
    .from("tour_booking_intents")
    .select("id,adults,children,infants,expires_at,editing_booking_id")
    .eq("tour_id", tourId)
    .eq("manager_id", session.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sel.error && /editing_booking_id|column|does not exist/i.test(String(sel.error.message))) {
    sel = await supabase
      .from("tour_booking_intents")
      .select("id,adults,children,infants,expires_at")
      .eq("tour_id", tourId)
      .eq("manager_id", session.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
  }
  const { data, error } = sel;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ active: false });
  const row = data as {
    id: string;
    adults?: number;
    children?: number;
    infants?: number;
    expires_at: string;
    editing_booking_id?: string | null;
  };
  return NextResponse.json({
    active: true,
    intent: {
      id: row.id,
      adults: Number(row.adults ?? 0),
      children: Number(row.children ?? 0),
      infants: Number(row.infants ?? 0),
      expiresAt: String(row.expires_at),
      editingBookingId: row.editing_booking_id ? String(row.editing_booking_id) : null,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }
  const { id: tourId } = await params;
  const { error } = await supabase
    .from("tour_booking_intents")
    .delete()
    .eq("tour_id", tourId)
    .eq("manager_id", session.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

