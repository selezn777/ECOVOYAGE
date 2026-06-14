import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { tourBusinessTodayYmd, tourCalendarDateFromStartAtIso, hhmmFromIsoInTourTz } from "@/lib/scheduling";

const bodySchema = z.object({ targetTourId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { id: bookingId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { targetTourId } = parsed.data;

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,adults,children,infants")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  }

  const managerId = String((booking as { manager_id: string }).manager_id);
  const canTransfer =
    session.role === "director" ||
    session.role === "chief_manager" ||
    (session.role === "manager" && session.id === managerId);
  if (!canTransfer) {
    return apiDenied();
  }

  if (String((booking as { tour_id: string }).tour_id) === targetTourId) {
    return NextResponse.json({ error: "Выберите другой тур." }, { status: 400 });
  }

  const { data: currentTourRow } = await supabase
    .from("tours")
    .select("start_at")
    .eq("id", (booking as { tour_id: string }).tour_id)
    .maybeSingle();
  const currentStart = currentTourRow?.start_at ? String(currentTourRow.start_at) : "";
  const currentYmd = currentStart ? tourCalendarDateFromStartAtIso(currentStart) : "";
  if (
    currentYmd &&
    currentYmd < tourBusinessTodayYmd() &&
    session.role !== "director"
  ) {
    return NextResponse.json(
      { error: "Перенос с прошедшего выезда недоступен (обратитесь к директору)." },
      { status: 400 },
    );
  }

  const { data: targetTour, error: tErr } = await supabase
    .from("tours")
    .select("id,start_at,end_at,capacity,status,deleted_at")
    .eq("id", targetTourId)
    .maybeSingle();

  if (tErr || !targetTour) {
    return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  }

  const tr = targetTour as {
    start_at: string;
    end_at?: string | null;
    capacity?: number | null;
    status?: string;
    deleted_at?: string | null;
  };
  if (tr.deleted_at != null) {
    return NextResponse.json({ error: "Тур недоступен" }, { status: 400 });
  }
  if (tr.status === "deleted") {
    return NextResponse.json({ error: "Тур недоступен" }, { status: 400 });
  }

  const startYmd = tourCalendarDateFromStartAtIso(String(tr.start_at));
  if (startYmd && startYmd < tourBusinessTodayYmd() && session.role !== "director") {
    return NextResponse.json({ error: "Нельзя перенести на прошедший тур" }, { status: 400 });
  }

  const pax =
    Number((booking as { adults: number }).adults) +
    Number((booking as { children: number }).children) +
    Number((booking as { infants: number }).infants);

  const { data: bookRows } = await supabase
    .from("bookings")
    .select("adults,children,infants")
    .eq("tour_id", targetTourId)
    .is("deleted_at", null);

  let booked = 0;
  for (const r of bookRows || []) {
    booked +=
      Number((r as { adults: number }).adults) +
      Number((r as { children: number }).children) +
      Number((r as { infants: number }).infants);
  }
  const cap = tr.capacity != null ? Math.max(0, Math.round(Number(tr.capacity))) : 0;
  if (cap > 0 && booked + pax > cap) {
    const free = Math.max(0, cap - booked);
    return NextResponse.json(
      { error: `Не хватает мест на выбранном туре (свободно ${free}, нужно ${pax}).` },
      { status: 400 },
    );
  }

  const startAt = String(tr.start_at);
  const hh = hhmmFromIsoInTourTz(startAt);
  const pickupTime = hh ? `${hh}:00` : null;

  const { error: upErr } = await supabase
    .from("bookings")
    .update({ tour_id: targetTourId, ...(pickupTime ? { pickup_time: pickupTime } : {}) })
    .eq("id", bookingId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: bookingId,
    action: "transfer_tour",
    after: { from_tour_id: (booking as { tour_id: string }).tour_id, to_tour_id: targetTourId },
  });

  return NextResponse.json({ ok: true, tourId: targetTourId });
}
