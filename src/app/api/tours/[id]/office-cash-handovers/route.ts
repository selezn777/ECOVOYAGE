import { NextResponse } from "next/server";
import { z } from "zod";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { triggerGoogleSheetsAutoSync } from "@/lib/google-sheets-sync";
import { allocateHandoverAmountToBooking, getBookingHandoverCapVnd } from "@/lib/tour-office-handover-booking";
import { sumManagerHandoversOnTour, sumPaymentsReceivedForBookingIds } from "@/lib/data";

const bodySchema = z
  .object({
    holderRole: z.enum(["manager", "guide"]),
    employeeId: z.string().uuid(),
    amountVnd: z.number().int().positive(),
    channelId: z.string().uuid(),
    amountUsd: z.number().positive().max(9_999_999).optional(),
    note: z.string().max(2000).optional(),
    /** Привязка к брони: закрытие долга в кассе / снятие pending доплат гида. */
    bookingId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amountUsd != null && !Number.isFinite(data.amountUsd)) {
      ctx.addIssue({ code: "custom", path: ["amountUsd"], message: "Некорректная сумма в долларах." });
    }
  });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tour, error: tourErr } = await supabase.from("tours").select("id").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (tourErr) return NextResponse.json({ error: tourErr.message }, { status: 500 });
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const { holderRole, employeeId, amountVnd, channelId, amountUsd, note, bookingId } = parsed.data;

  const { data: chRow, error: chErr } = await supabase
    .from("office_cash_handover_channels")
    .select("id,expects_usd_amount")
    .eq("id", channelId)
    .maybeSingle();
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
  if (!chRow) {
    return NextResponse.json({ error: "Канал сдачи не найден. Проверьте справочник на странице «Касса»." }, { status: 400 });
  }
  const expectsUsd = Boolean((chRow as { expects_usd_amount?: boolean }).expects_usd_amount);
  const amountUsdDb = expectsUsd && amountUsd != null ? amountUsd : null;
  if (expectsUsd && (amountUsdDb == null || amountUsdDb <= 0)) {
    return NextResponse.json({ error: "Укажите сумму в долларах США для выбранного канала." }, { status: 400 });
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id,role")
    .eq("id", employeeId)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!userRow) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 400 });

  const role = String((userRow as { role: string }).role);
  if (holderRole === "manager") {
    if (
      role !== "manager" &&
      role !== "chief_manager" &&
      role !== "director" &&
      role !== "dispatcher" &&
      role !== "booking_dispatcher"
    ) {
      return NextResponse.json(
        { error: "Для роли «менеджер/диспетчер» выберите менеджера или диспетчера продаж." },
        { status: 400 },
      );
    }
    const { count, error: bkErr } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tour_id", tourId)
      .eq("manager_id", employeeId)
      .is("deleted_at", null);
    if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
    if (!count || count < 1) {
      return NextResponse.json({ error: "У этого менеджера нет броней на выбранном туре." }, { status: 400 });
    }
  } else {
    if (role !== "guide" && role !== "chief_guide" && role !== "director") {
      return NextResponse.json({ error: "Для роли «гид» выберите гида." }, { status: 400 });
    }
    const { data: tg, error: tgErr } = await supabase
      .from("tour_guides")
      .select("guide_id")
      .eq("tour_id", tourId)
      .eq("guide_id", employeeId)
      .maybeSingle();
    if (tgErr) return NextResponse.json({ error: tgErr.message }, { status: 500 });
    if (!tg) {
      return NextResponse.json({ error: "Этот гид не назначен на тур." }, { status: 400 });
    }
  }

  if (bookingId) {
    const { data: bk, error: bkErr } = await supabase
      .from("bookings")
      .select("id,manager_id")
      .eq("id", bookingId)
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bkErr) return NextResponse.json({ error: bkErr.message }, { status: 500 });
    if (!bk) {
      return NextResponse.json({ error: "Бронь не найдена на этом туре." }, { status: 400 });
    }
    if (holderRole === "manager" && String((bk as { manager_id: string }).manager_id) !== employeeId) {
      return NextResponse.json({ error: "Эта бронь закреплена за другим менеджером." }, { status: 400 });
    }
    const capOne = await getBookingHandoverCapVnd(supabase, { bookingId, tourId });
    if (!capOne.ok) return NextResponse.json({ error: capOne.error }, { status: 400 });
    if (amountVnd > capOne.capVnd) {
      return NextResponse.json(
        { error: `По выбранной брони можно не больше ${capOne.capVnd.toLocaleString("ru-RU")} ₫.` },
        { status: 400 },
      );
    }
    const alloc = await allocateHandoverAmountToBooking(supabase, {
      bookingId,
      tourId,
      amountVnd,
      actorId: actorUuidOrNull(session.id),
    });
    if (!alloc.ok) return NextResponse.json({ error: alloc.error }, { status: 400 });
  } else if (holderRole === "manager") {
    // Журнал без привязки к брони: ограничиваем тем, что менеджер реально должен сдать по этому
    // туру (всего принято по своим броням минус всего уже сдано), а не суммой долгов по броням -
    // брони могут быть полностью закрыты, а наличные на руках всё равно остаются.
    const { data: mgrBookings, error: mbErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("tour_id", tourId)
      .eq("manager_id", employeeId)
      .is("deleted_at", null);
    if (mbErr) return NextResponse.json({ error: mbErr.message }, { status: 500 });
    const bookingIds = (mgrBookings || []).map((x) => String((x as { id: string }).id));

    const [receivedVnd, handedVnd] = await Promise.all([
      sumPaymentsReceivedForBookingIds(supabase, bookingIds),
      sumManagerHandoversOnTour(supabase, tourId, employeeId),
    ]);
    const capSum = Math.max(0, receivedVnd - handedVnd);
    if (amountVnd > capSum) {
      return NextResponse.json(
        { error: `По выбранной привязке можно не больше ${capSum.toLocaleString("ru-RU")} ₫.` },
        { status: 400 },
      );
    }
  } else {
    // Гид, журнал без привязки к брони: ограничиваем суммой долгов по броням тура (как раньше).
    const { data: tourBookings, error: tbErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("tour_id", tourId)
      .is("deleted_at", null);
    if (tbErr) return NextResponse.json({ error: tbErr.message }, { status: 500 });
    const bookingIds = (tourBookings || []).map((x) => String((x as { id: string }).id));

    let capSum = 0;
    for (const bid of bookingIds) {
      const cap = await getBookingHandoverCapVnd(supabase, { bookingId: bid, tourId });
      if (!cap.ok) return NextResponse.json({ error: cap.error }, { status: 400 });
      capSum += cap.capVnd;
    }
    if (amountVnd > capSum) {
      return NextResponse.json(
        { error: `По выбранной привязке можно не больше ${capSum.toLocaleString("ru-RU")} ₫.` },
        { status: 400 },
      );
    }
  }

  const insertPayload: Record<string, unknown> = {
    tour_id: tourId,
    holder_role: holderRole,
    employee_id: employeeId,
    amount_vnd: amountVnd,
    channel_id: channelId,
    amount_usd: amountUsdDb,
    note: note?.trim() || null,
    recorded_by: session.id,
  };
  if (bookingId) insertPayload.booking_id = bookingId;

  const { data: inserted, error: insErr } = await supabase
    .from("tour_office_cash_handovers")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (insErr) {
    const insMsg = String(insErr.message);
    if (/tour_office_cash_handovers/i.test(insMsg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: таблица tour_office_cash_handovers." },
        { status: 500 },
      );
    }
    if (/channel_id|office_cash_handover_channels|column|does not exist/i.test(insMsg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: office_cash_handover_channels и поле channel_id в tour_office_cash_handovers." },
        { status: 500 },
      );
    }
    if (/amount_usd|column|does not exist/i.test(insMsg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: поле amount_usd в tour_office_cash_handovers." },
        { status: 500 },
      );
    }
    if (/booking_id|column|does not exist/i.test(insMsg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: поле booking_id в tour_office_cash_handovers." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_office_cash_handover",
    entityId: String((inserted as { id: string } | null)?.id ?? tourId),
    action: "create",
    after: { tourId, holderRole, employeeId, amountVnd, channelId, amount_usd: amountUsdDb },
  });
  void triggerGoogleSheetsAutoSync("tour_office_cash_handover");

  return NextResponse.json({ ok: true, id: (inserted as { id: string } | null)?.id });
}
