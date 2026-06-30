import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { PAYMENT_ROLES, canRecordGuideBookingDebtTopup } from "@/lib/role-policy";
import { tourBusinessTodayYmd, tourCalendarDateFromStartAtIso } from "@/lib/scheduling";
import { isTourBookingCardLockedForManager } from "@/lib/tour-booking-policies";
import { getBookingDueVndBreakdown, isUserAssignedGuideOnTour } from "@/lib/data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase не настроен. Заполните .env.local." },
      { status: 500 },
    );
  }

  const { id } = await params;
  const { data: booking } = await supabase
    .from("bookings")
    .select("tour_id,manager_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking?.tour_id) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });

  const body = await request.json();
  const amountVnd = Number(body.amountVnd || 0);
  const kind = String(body.kind || "topup");

  if (amountVnd <= 0) {
    return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });
  }
  if (!["deposit", "topup", "refund"].includes(kind)) {
    return NextResponse.json({ error: "Неподдерживаемый вид платежа" }, { status: 400 });
  }

  const isFinance = PAYMENT_ROLES.includes(session.role);
  const wantsGuideDebtTopup =
    canRecordGuideBookingDebtTopup(session.role) && kind === "topup";

  if (!isFinance && !wantsGuideDebtTopup) {
    return apiDenied();
  }

  if (wantsGuideDebtTopup && !isFinance) {
    const onTour = await isUserAssignedGuideOnTour(booking.tour_id, session.id);
    if (!onTour) {
      return NextResponse.json({ error: "Доплату можно внести только по туристам своего тура" }, { status: 403 });
    }
    const dueRow = await getBookingDueVndBreakdown(id);
    if (!dueRow) {
      return NextResponse.json({ error: "Не удалось проверить долг" }, { status: 500 });
    }
    if (dueRow.dueVnd <= 0) {
      return NextResponse.json({ error: "Долга по этой брони нет" }, { status: 400 });
    }
    if (amountVnd > dueRow.dueVnd) {
      return NextResponse.json(
        { error: `Сумма не больше долга: ${dueRow.dueVnd.toLocaleString("ru-RU")} ₫` },
        { status: 400 },
      );
    }
  } else {
    if (session.role === "manager" && booking.manager_id !== session.id) {
      return apiDenied();
    }
    const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", booking.tour_id).maybeSingle();
    const tourStartAt = tourRow?.start_at ? String(tourRow.start_at) : "";
    if (isTourBookingCardLockedForManager(session.role, tourStartAt)) {
      return NextResponse.json(
        {
          error:
            "После 17:00 накануне выезда менеджер не вносит оплаты по брони. Обратитесь к директору.",
        },
        { status: 400 },
      );
    }
    const tourDate = tourRow?.start_at ? tourCalendarDateFromStartAtIso(String(tourRow.start_at)) : "";
    const todayTourYmd = tourBusinessTodayYmd();
    const managerOwnBooking = session.role === "manager" && booking.manager_id === session.id;
    if (
      tourDate &&
      tourDate < todayTourYmd &&
      session.role !== "director" &&
      !managerOwnBooking
    ) {
      return apiDenied();
    }
  }

  const actorId = actorUuidOrNull(session.id);
  const dedupeSinceIso = new Date(Date.now() - 90 * 1000).toISOString();

  // Anti-double-submit guard: identical payment by same actor in a short window.
  // This protects cash ledger from accidental repeated taps / flaky mobile retries.
  const duplicateCheck = await supabase
    .from("payments")
    .select("id,created_at")
    .eq("booking_id", id)
    .eq("kind", kind)
    .eq("amount_vnd", amountVnd)
    .eq("actor_id", actorId)
    .gte("created_at", dedupeSinceIso)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!duplicateCheck.error && (duplicateCheck.data?.length ?? 0) > 0) {
    return NextResponse.json(
      { error: "Похожая оплата уже записана только что. Проверьте кассу, чтобы не создать дубль." },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    booking_id: id,
    amount: amountVnd,
    currency: "VND",
    rate_to_vnd: 1,
    amount_vnd: amountVnd,
    kind,
    actor_id: actorId,
  };
  if (wantsGuideDebtTopup && !isFinance) {
    insertRow.remitted_to_cash_at = null;
    insertRow.remitted_to_cash_by = null;
  } else {
    insertRow.remitted_to_cash_at = nowIso;
    insertRow.remitted_to_cash_by = actorId;
  }

  let { error } = await supabase.from("payments").insert([insertRow]);

  if (error && /remitted_to_cash_at|remitted_to_cash_by|column|does not exist/i.test(String(error.message))) {
    const legacyRow = { ...insertRow };
    delete legacyRow.remitted_to_cash_at;
    delete legacyRow.remitted_to_cash_by;
    ({ error } = await supabase.from("payments").insert([legacyRow]));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: id,
    action: `payment_${kind}`,
    after: { amount_vnd: amountVnd, kind },
  });

  return NextResponse.json({ ok: true });
}
