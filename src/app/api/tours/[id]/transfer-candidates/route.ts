import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canResolveTourOverbook } from "@/lib/role-policy";
import { tourCalendarDateFromStartAtIso, hhmmFromIsoInTourTz } from "@/lib/scheduling";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";

const postSchema = z.object({
  sourceTourId: z.string().uuid(),
  bookingIds: z.array(z.string().uuid()).min(1).max(100),
});

function denied() {
  return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
}

async function resolveAccess(targetTourId: string) {
  const session = await getSessionUser();
  if (!session) {
    return { session: null, supabase: null, error: NextResponse.json({ error: "Нет авторизации" }, { status: 401 }) };
  }
  const canManage = canResolveTourOverbook(session.role) || canResolveTourOverbook(session.baseRole);
  if (!canManage) {
    return { session, supabase: null, error: denied() };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { session, supabase: null, error: NextResponse.json({ error: "Supabase не настроен." }, { status: 500 }) };
  }

  const { data: targetTour, error: targetErr } = await supabase
    .from("tours")
    .select("id,start_at,status,deleted_at")
    .eq("id", targetTourId)
    .maybeSingle();
  if (targetErr || !targetTour || targetTour.deleted_at != null || String(targetTour.status || "") === "deleted") {
    return { session, supabase, error: NextResponse.json({ error: "Тур назначения недоступен" }, { status: 404 }) };
  }
  return { session, supabase, targetTour, error: null };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: targetTourId } = await ctx.params;
  const access = await resolveAccess(targetTourId);
  if (access.error) return access.error;
  const { supabase, targetTour } = access;

  const url = new URL(request.url);
  const sourceTourId = String(url.searchParams.get("sourceTourId") || "").trim();
  if (!sourceTourId) {
    return NextResponse.json({ bookings: [] });
  }

  const { data: sourceTour, error: sourceErr } = await supabase
    .from("tours")
    .select("id,start_at,status,deleted_at")
    .eq("id", sourceTourId)
    .maybeSingle();
  if (sourceErr || !sourceTour || sourceTour.deleted_at != null || String(sourceTour.status || "") === "deleted") {
    return NextResponse.json({ error: "Тур-источник недоступен" }, { status: 404 });
  }

  const sourceYmd = tourCalendarDateFromStartAtIso(String(sourceTour.start_at || ""));
  const targetYmd = tourCalendarDateFromStartAtIso(String(targetTour?.start_at || ""));
  if (!sourceYmd || !targetYmd || sourceYmd !== targetYmd) {
    return NextResponse.json(
      { error: "Быстрый перенос работает только между турами одного календарного дня." },
      { status: 400 },
    );
  }

  const { data: bookingRows, error: bErr } = await supabase
    .from("bookings")
    .select("id,customer_name,manager_id,adults,children,infants")
    .eq("tour_id", sourceTourId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const managerIds = Array.from(
    new Set(
      ((bookingRows as { manager_id?: string | null }[] | null) ?? [])
        .map((r) => String(r.manager_id || "").trim())
        .filter(Boolean),
    ),
  );
  const usersById = new Map<string, string>();
  if (managerIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id,full_name").in("id", managerIds);
    for (const u of (users as { id?: string; full_name?: string | null }[] | null) ?? []) {
      const id = String(u.id || "").trim();
      if (id) usersById.set(id, String(u.full_name || "").trim() || "Менеджер");
    }
  }

  const bookings = ((bookingRows as {
    id: string;
    customer_name?: string | null;
    manager_id?: string | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
  }[] | null) ?? []
  ).map((r) => {
    const managerId = String(r.manager_id || "").trim();
    return {
      id: r.id,
      customerName: String(r.customer_name || "").trim() || "Без имени",
      managerName: usersById.get(managerId) || "Менеджер",
      adults: Math.max(0, Number(r.adults || 0)),
      children: Math.max(0, Number(r.children || 0)),
      infants: Math.max(0, Number(r.infants || 0)),
    };
  });

  return NextResponse.json({ bookings });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: targetTourId } = await ctx.params;
  const access = await resolveAccess(targetTourId);
  if (access.error) return access.error;
  const { session, supabase, targetTour } = access;

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sourceTourId = parsed.data.sourceTourId;
  const bookingIds = Array.from(new Set(parsed.data.bookingIds));
  if (sourceTourId === targetTourId) {
    return NextResponse.json({ error: "Источник и назначение должны отличаться." }, { status: 400 });
  }

  const { data: sourceTour, error: sourceErr } = await supabase
    .from("tours")
    .select("id,start_at,status,deleted_at")
    .eq("id", sourceTourId)
    .maybeSingle();
  if (sourceErr || !sourceTour || sourceTour.deleted_at != null || String(sourceTour.status || "") === "deleted") {
    return NextResponse.json({ error: "Тур-источник недоступен" }, { status: 404 });
  }

  const sourceYmd = tourCalendarDateFromStartAtIso(String(sourceTour.start_at || ""));
  const targetYmd = tourCalendarDateFromStartAtIso(String(targetTour?.start_at || ""));
  if (!sourceYmd || !targetYmd || sourceYmd !== targetYmd) {
    return NextResponse.json(
      { error: "Быстрый перенос работает только между турами одного календарного дня." },
      { status: 400 },
    );
  }

  const { data: bookingRows, error: bErr } = await supabase
    .from("bookings")
    .select("id,tour_id,adults,children")
    .in("id", bookingIds)
    .eq("tour_id", sourceTourId)
    .is("deleted_at", null);
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const validRows = (bookingRows as { id: string; adults?: number | null; children?: number | null }[] | null) ?? [];
  if (validRows.length === 0) {
    return NextResponse.json({ error: "Не найдено броней для переноса." }, { status: 400 });
  }

  const movingSeats = validRows.reduce(
    (sum, b) => sum + Math.max(0, Number(b.adults || 0)) + Math.max(0, Number(b.children || 0)),
    0,
  );

  const [{ data: targetBookings }, { data: targetCapRow }] = await Promise.all([
    supabase
      .from("bookings")
      .select("adults,children")
      .eq("tour_id", targetTourId)
      .is("deleted_at", null)
      .limit(5000),
    supabase.from("tours").select("capacity,start_at").eq("id", targetTourId).maybeSingle(),
  ]);

  const targetBooked = ((targetBookings as { adults?: number | null; children?: number | null }[] | null) ?? []).reduce(
    (sum, b) => sum + Math.max(0, Number(b.adults || 0)) + Math.max(0, Number(b.children || 0)),
    0,
  );
  const targetCapacity = Math.max(0, Number((targetCapRow as { capacity?: number | null } | null)?.capacity || 0));
  if (targetCapacity > 0 && targetBooked + movingSeats > targetCapacity) {
    const free = Math.max(0, targetCapacity - targetBooked);
    return NextResponse.json(
      { error: `Недостаточно мест в туре назначения (свободно ${free}, нужно ${movingSeats}).` },
      { status: 400 },
    );
  }

  const startAt = String((targetCapRow as { start_at?: string | null } | null)?.start_at || "");
  const hh = startAt ? hhmmFromIsoInTourTz(startAt) : "";
  const pickupTime = hh ? `${hh}:00` : null;
  const updatePayload = pickupTime ? { tour_id: targetTourId, pickup_time: pickupTime } : { tour_id: targetTourId };

  const { error: upErr } = await supabase
    .from("bookings")
    .update(updatePayload)
    .in(
      "id",
      validRows.map((r) => r.id),
    )
    .eq("tour_id", sourceTourId)
    .is("deleted_at", null);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "tour",
    entityId: targetTourId,
    action: "bulk_transfer_in",
    before: { source_tour_id: sourceTourId },
    after: {
      source_tour_id: sourceTourId,
      moved_booking_ids: validRows.map((r) => r.id),
      moved_count: validRows.length,
      moved_seats: movingSeats,
    },
  });

  return NextResponse.json({ ok: true, movedCount: validRows.length });
}
