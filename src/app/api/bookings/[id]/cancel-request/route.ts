import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { apiDenied } from "@/lib/api-denied";
import { isPastTourBookingEditCutoff } from "@/lib/tour-booking-policies";
import { tourBusinessTodayYmd, tourCalendarDateFromStartAtIso } from "@/lib/scheduling";

const requesterRoles = new Set(["manager", "chief_manager", "chief_guide", "accountant"]);

const createSchema = z.object({
  note: z.string().max(4000).optional(),
});

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(4000).optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!requesterRoles.has(session.role) && session.role !== "director") return apiDenied();

  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase
    .from("booking_cancellation_requests")
    .select("id,status,requested_by,requested_role,requested_note,requested_at,decided_by,decision_note,decided_at")
    .eq("booking_id", id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/booking_cancellation_requests|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ request: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ request: data ?? null });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!requesterRoles.has(session.role)) return apiDenied();

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,manager_id,tour_id,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (bErr || !booking) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  if (booking.deleted_at) return NextResponse.json({ error: "Бронь уже удалена" }, { status: 400 });
  if (session.role === "manager" && booking.manager_id !== session.id) return apiDenied();

  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", booking.tour_id).maybeSingle();
  const tourStartAt = tourRow?.start_at ? String(tourRow.start_at) : "";
  const tourCalendarYmd = tourStartAt ? tourCalendarDateFromStartAtIso(tourStartAt) : "";
  if (tourCalendarYmd && tourCalendarYmd < tourBusinessTodayYmd() && session.role !== "director") {
    return apiDenied();
  }
  if (tourStartAt && !isPastTourBookingEditCutoff(tourStartAt) && session.role !== "manager") {
    return NextResponse.json({ error: "Заявка нужна только после дедлайна 17:00 накануне." }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);
  const note = parsed.data.note?.trim() || null;

  const { data: pending } = await supabase
    .from("booking_cancellation_requests")
    .select("id,status")
    .eq("booking_id", id)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending?.id) {
    return NextResponse.json({ ok: true, requestId: pending.id, alreadyPending: true });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("booking_cancellation_requests")
    .insert([
      {
        booking_id: id,
        tour_id: booking.tour_id,
        status: "pending",
        requested_by: actorId,
        requested_role: session.role,
        requested_note: note,
      },
    ])
    .select("id")
    .maybeSingle();
  if (insErr) {
    if (/booking_cancellation_requests|does not exist/i.test(String(insErr.message))) {
      return NextResponse.json({ error: "Выполните миграцию booking_cancellation_requests." }, { status: 503 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking_cancellation_request",
    entityId: String(inserted?.id ?? ""),
    action: "create",
    after: { bookingId: id, tourId: booking.tour_id, role: session.role },
  });
  return NextResponse.json({ ok: true, requestId: inserted?.id ?? null });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "director") return apiDenied();

  const parsed = decisionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  const actorId = actorUuidOrNull(session.id);
  const nowIso = new Date().toISOString();

  const { data: reqRow, error: reqErr } = await supabase
    .from("booking_cancellation_requests")
    .select("id,tour_id,status")
    .eq("booking_id", id)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ error: "Нет активной заявки на отмену." }, { status: 404 });

  const action = parsed.data.action;
  if (action === "reject") {
    const { error: rejErr } = await supabase
      .from("booking_cancellation_requests")
      .update({
        status: "rejected",
        decided_by: actorId,
        decision_note: parsed.data.note?.trim() || null,
        decided_at: nowIso,
      })
      .eq("id", reqRow.id);
    if (rejErr) return NextResponse.json({ error: rejErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,customer_name,tour_id,pickup_time,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (bErr || !booking) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  if (booking.deleted_at) return NextResponse.json({ error: "Бронь уже удалена" }, { status: 400 });

  const restoreUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error: softErr } = await supabase.from("bookings").update({ deleted_at: nowIso }).eq("id", id);
  if (softErr) return NextResponse.json({ error: softErr.message }, { status: 500 });

  const { error: deletedErr } = await supabase.from("deleted_items").insert([
    {
      entity: "booking",
      entity_id: booking.id,
      payload: { customer_name: booking.customer_name, tour_id: booking.tour_id },
      deleted_by: actorId,
      restore_until: restoreUntil,
    },
  ]);
  if (deletedErr) return NextResponse.json({ error: deletedErr.message }, { status: 500 });

  const { error: appErr } = await supabase
    .from("booking_cancellation_requests")
    .update({
      status: "approved",
      decided_by: actorId,
      decision_note: parsed.data.note?.trim() || null,
      decided_at: nowIso,
    })
    .eq("id", reqRow.id);
  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: id,
    action: "soft_delete_by_cancel_request",
    after: { deleted_at: nowIso, requestId: reqRow.id },
  });

  return NextResponse.json({ ok: true, status: "approved" });
}
