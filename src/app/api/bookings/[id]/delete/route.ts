import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { tourBusinessTodayYmd, tourCalendarDateFromStartAtIso } from "@/lib/scheduling";
import { isPastTourBookingEditCutoff } from "@/lib/tour-booking-policies";

const GLOBAL_DELETE_ROLES = ["director", "chief_manager", "chief_guide", "dispatcher"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const isDirector = session.role === "director";
  const isStaff = session.role === "director" || session.role === "chief_manager" || session.role === "dispatcher" || session.role === "chief_guide";
  const { id } = await params;

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id,manager_id,customer_name,tour_id,pickup_time,created_at,deposit_vnd,deleted_at")
    .eq("id", id)
    .maybeSingle();

  // Директор: если не найдена или уже удалена — считаем успехом (страница протухла)
  if (!booking || bookingErr) {
    if (isDirector) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  }
  if ((booking as { deleted_at?: string | null }).deleted_at) {
    if (isDirector) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Бронь уже удалена" }, { status: 404 });
  }

  const { data: tourRowForDate } = await supabase.from("tours").select("start_at").eq("id", booking.tour_id).maybeSingle();
  const tourStartAt = tourRowForDate?.start_at ? String(tourRowForDate.start_at) : "";
  const tourCalendarYmd = tourStartAt ? tourCalendarDateFromStartAtIso(tourStartAt) : "";

  // Прошедший тур: директор, главный менеджер, диспетчер
  if (tourCalendarYmd && tourCalendarYmd < tourBusinessTodayYmd() && !isStaff) {
    return apiDenied();
  }

  const globalDelete = GLOBAL_DELETE_ROLES.includes(session.role);
  const managerOwn = session.role === "manager" && booking.manager_id === session.id;

  if (!globalDelete && !managerOwn) {
    return NextResponse.json({ error: "Недостаточно прав для удаления этой брони." }, { status: 403 });
  }

  // После 17:00 накануне — менеджер не может; директор/главный менеджер/диспетчер могут
  if (tourStartAt && isPastTourBookingEditCutoff(tourStartAt) && !isStaff) {
    return NextResponse.json(
      { error: "После 17:00 накануне выезда используйте «Отмена с удержанием»." },
      { status: 400 },
    );
  }

  if (managerOwn) {
    const createdAtMs = Date.parse(String(booking.created_at || ""));
    const withinTwoHours = Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= 2 * 60 * 60 * 1000;
    const zeroDeposit = Number((booking as { deposit_vnd?: number }).deposit_vnd ?? 0) === 0;
    if (!withinTwoHours && !zeroDeposit) {
      return NextResponse.json(
        { error: "Менеджер может удалить только в первые 2 часа или при нулевом депозите. Обратитесь к главному менеджеру." },
        { status: 400 },
      );
    }
  }

  const actorId = actorUuidOrNull(session.id);
  const now = new Date();
  const restoreUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const { error: softErr } = await supabase.from("bookings").update({ deleted_at: now.toISOString() }).eq("id", id);
  if (softErr) return NextResponse.json({ error: softErr.message }, { status: 500 });

  await supabase.from("deleted_items").insert([{
    entity: "booking",
    entity_id: booking.id,
    payload: { customer_name: booking.customer_name, tour_id: booking.tour_id },
    deleted_by: actorId,
    restore_until: restoreUntil,
  }]);

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: id,
    action: "soft_delete",
    before: { customer_name: booking.customer_name, tour_id: booking.tour_id, pickup_time: booking.pickup_time },
    after: { deleted_at: now.toISOString(), restore_until: restoreUntil },
  });

  return NextResponse.json({ ok: true });
}
