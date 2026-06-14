import { z } from "zod";
import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone } from "@/lib/format";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { canAssignBookingManager, canCreateBooking } from "@/lib/role-policy";
import {
  defaultTourPickupHhMmFromStartEndIso,
  normalizeTourPickupHhMm,
  tourBusinessTodayYmd,
  tourCalendarDateFromStartAtIso,
} from "@/lib/scheduling";
import { ensureBookingOnlineCode } from "@/lib/online-code";
import { getSalesManagerIdForPhone, getManagerRentalPointId } from "@/lib/tourist-sale-phone";
import { normalizeTelegramUsername } from "@/lib/telegram-username";

const payloadSchema = z.object({
  managerId: z.string().uuid().optional(),
  managerName: z.string().min(1).optional(),
  hotelName: z.string().optional(),
  hotelAddress: z.string().optional(),
  hotelMapsUrl: z.string().optional(),
  room: z.string().optional(),
  customerName: z.string().min(1),
  phone: z.string().min(6),
  /** Второй контактный номер (E.164), опционально */
  phoneAlt: z.string().min(6).max(24).optional().or(z.literal("")),
  pickupTime: z.string().optional(),
  adults: z.number().int().min(0).max(20),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(20),
  note: z.string().optional(),
  /** Ник в Telegram без @ (опционально). */
  telegramUsername: z.string().max(64).optional(),
  offerVnd: z.number().int().min(0),
  amountVnd: z.number().int().min(0),
  /** Разбивка по строкам для чека (сумма строк = offerVnd) */
  priceLines: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        amountVnd: z.number().int().min(0),
      }),
    )
    .optional(),
  commissionShare: z
    .object({
      userId: z.string().uuid(),
      percent: z.number().min(0).max(100),
    })
    .optional(),
  passportPhotoUrls: z.array(z.string()).optional(),
});

function customerNameKey(s: string): string {
  return String(s || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateBooking(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase не настроен. Заполните .env.local." },
      { status: 500 },
    );
  }

  const { id: tourId } = await params;
  const { data: tourRow } = await supabase.from("tours").select("start_at,end_at").eq("id", tourId).maybeSingle();
  const tr = tourRow as { start_at?: string | null; end_at?: string | null } | null;
  const startAtRaw = typeof tr?.start_at === "string" ? String(tr.start_at) : "";
  const endAtRaw = typeof tr?.end_at === "string" && String(tr.end_at).trim() ? String(tr.end_at) : null;
  const tourDate = startAtRaw ? tourCalendarDateFromStartAtIso(startAtRaw) : "";
  const todayTourYmd = tourBusinessTodayYmd();
  /** Время сбора по умолчанию = начало окна тура (как на карточке тура), не из «сырого» UTC без таймзоны. */
  const defaultPickupHhMm = defaultTourPickupHhMmFromStartEndIso(startAtRaw, endAtRaw);
  const pickupForInsert = defaultPickupHhMm ? `${normalizeTourPickupHhMm(defaultPickupHhMm)}:00` : null;
  if (tourDate && tourDate < todayTourYmd && session.role !== "director") {
    return apiDenied();
  }
  const raw = await request.json();
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const canAssignManager = canAssignBookingManager(session.role);
  let managerId = body.managerId || null;
  if (!managerId) {
    managerId = session.id;
  }
  if (!canAssignManager && managerId !== session.id) {
    return apiDenied();
  }

  const phoneE164 = normalizePhone(body.phone);
  const phoneAltRaw = body.phoneAlt?.trim() || "";
  const phoneAltE164 = phoneAltRaw ? normalizePhone(phoneAltRaw) : "";
  const customerNameNormalized = customerNameKey(body.customerName);
  const telegramNorm = normalizeTelegramUsername(body.telegramUsername);
  if (body.telegramUsername != null && String(body.telegramUsername).trim() && !telegramNorm) {
    return NextResponse.json(
      { error: "Некорректный ник Telegram: латиница, 5-32 символа, с буквы (можно без @)." },
      { status: 400 },
    );
  }
  const ownerManagerId = await getSalesManagerIdForPhone(supabase, phoneE164);
  if (ownerManagerId && ownerManagerId !== managerId) {
    const officeOverride = session.role === "director" || session.role === "chief_manager";
    if (!officeOverride) {
      // Проверяем: тот же sales point → разрешаем, но записываем на владельца туриста
      const [sessionPoint, ownerPoint] = await Promise.all([
        getManagerRentalPointId(supabase, session.id),
        getManagerRentalPointId(supabase, ownerManagerId),
      ]);
      const samePoint = sessionPoint && ownerPoint && sessionPoint === ownerPoint;
      if (samePoint) {
        // Та же точка: записываем туриста на оригинального менеджера (все деньги ему)
        managerId = ownerManagerId;
      } else {
        return NextResponse.json(
          {
            error:
              "Этот турист закреплён за менеджером другой точки. Запись может оформить только он, или офис.",
          },
          { status: 400 },
        );
      }
    } else {
      // Офис (директор/главный менеджер) всегда может менять
    }
  }

  // Защита от осознанных дублей внутри одного тура:
  // если уже есть активная бронь с тем же телефоном ИЛИ тем же именем, новую не создаём.
  const { data: sameTourRows, error: sameTourErr } = await supabase
    .from("bookings")
    .select("id,customer_name,phone_e164")
    .eq("tour_id", tourId)
    .is("deleted_at", null)
    .limit(300);
  if (sameTourErr) {
    return NextResponse.json({ error: sameTourErr.message }, { status: 500 });
  }
  const duplicateInTour = ((sameTourRows as { id: string; customer_name?: string | null; phone_e164?: string | null }[] | null) ?? []).find(
    (r) =>
      (r.phone_e164 && String(r.phone_e164) === phoneE164) ||
      customerNameKey(String(r.customer_name ?? "")) === customerNameNormalized,
  );
  if (duplicateInTour) {
    return NextResponse.json(
      {
        error:
          "В этом туре уже есть бронь с таким телефоном или именем туриста. Откройте существующую запись, чтобы избежать дубля.",
      },
      { status: 409 },
    );
  }

  const actorId = actorUuidOrNull(session.id);

  const baseBookingInsert = {
    tour_id: tourId,
    manager_id: managerId,
    hotel_name: body.hotelName?.trim() || "-",
    hotel_maps_url: body.hotelMapsUrl || null,
    room: body.room || null,
    customer_name: body.customerName,
    phone_e164: phoneE164,
    ...(phoneAltE164 ? { phone_alt_e164: phoneAltE164 } : {}),
    pickup_time: pickupForInsert,
    adults: body.adults,
    children: body.children,
    infants: body.infants,
    note: body.note || null,
    telegram_username: telegramNorm,
    passport_photo_urls: body.passportPhotoUrls ?? [],
  };
  const hotelAddressVal = body.hotelAddress?.trim() || null;

  let { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .insert([{ ...baseBookingInsert, hotel_address: hotelAddressVal }])
    .select("*")
    .single();

  if (bookingErr && /hotel_address|column.*does not exist|schema cache/i.test(String(bookingErr.message))) {
    ({ data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert([baseBookingInsert])
      .select("*")
      .single());
  }

  if (bookingErr || !booking) {
    return NextResponse.json({ error: bookingErr?.message || "Не удалось создать бронь." }, { status: 500 });
  }

  const bookingRow = booking as { id: string; online_code?: string | null };

  const lines =
    body.priceLines && body.priceLines.length > 0
      ? body.priceLines
      : [{ label: "Стоимость", amountVnd: body.offerVnd }];
  const sumLines = lines.reduce((s, l) => s + l.amountVnd, 0);
  if (sumLines !== body.offerVnd) {
    return NextResponse.json(
      { error: "Сумма строк прайса должна совпадать с итогом (offerVnd)." },
      { status: 400 },
    );
  }

  const { error: priceErr } = await supabase.from("booking_prices").insert(
    lines.map((l) => ({
      booking_id: bookingRow.id,
      person_label: l.label,
      amount: l.amountVnd,
      currency: "VND",
      rate_to_vnd: 1,
      amount_vnd: l.amountVnd,
    })),
  );

  if (priceErr) {
    return NextResponse.json({ error: priceErr.message }, { status: 500 });
  }

  // Сплит комиссии (опционально): доля продаж уходит beneficiary, у менеджера остаётся остаток.
  if (body.commissionShare && body.commissionShare.userId) {
    const pct = Number(body.commissionShare.percent) || 0;
    const beneficiaryId = body.commissionShare.userId;
    if (pct > 0) {
      if (beneficiaryId === managerId) {
        return NextResponse.json({ error: "Нельзя делить комиссию с самим собой." }, { status: 400 });
      }
      if (pct >= 100) {
        return NextResponse.json({ error: "Процент для сотрудника должен быть меньше 100%." }, { status: 400 });
      }
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("id,is_active")
        .eq("id", beneficiaryId)
        .maybeSingle();
      if (uErr || !u) {
        return NextResponse.json({ error: "Сотрудник для комиссии не найден." }, { status: 400 });
      }
      if ((u as { is_active?: boolean }).is_active !== true) {
        return NextResponse.json({ error: "Сотрудник не активен." }, { status: 400 });
      }
      const { error: shareErr } = await supabase.from("booking_commission_shares").insert([
        {
          booking_id: bookingRow.id,
          beneficiary_id: beneficiaryId,
          percent: Math.round(pct * 100) / 100,
          created_by: actorId,
        },
      ]);
      if (shareErr && !/booking_commission_shares|relation|does not exist/i.test(String(shareErr.message))) {
        return NextResponse.json({ error: shareErr.message }, { status: 500 });
      }
    }
  }

  // First payment (deposit) = what user typed as "paid now"
  if (body.amountVnd > 0) {
    const { error: payErr } = await supabase.from("payments").insert([
      {
        booking_id: bookingRow.id,
        amount: body.amountVnd,
        currency: "VND",
        rate_to_vnd: 1,
        amount_vnd: body.amountVnd,
        kind: "deposit",
        actor_id: actorId,
      },
    ]);
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: bookingRow.id,
    action: "create",
    after: {
      tour_id: tourId,
      manager_id: managerId,
      customer_name: body.customerName,
      offer_vnd: body.offerVnd,
      paid_vnd: body.amountVnd,
    },
  });

  // Шаг 2 завершён: убираем черновую фиксацию мест этого менеджера по туру.
  await supabase
    .from("tour_booking_intents")
    .delete()
    .eq("tour_id", tourId)
    .eq("manager_id", session.id);

  const ensuredOnlineCode = (bookingRow.online_code?.trim() || (await ensureBookingOnlineCode(supabase, bookingRow.id)) || null);
  return NextResponse.json({
    ok: true,
    bookingId: bookingRow.id,
    onlineCode: ensuredOnlineCode,
  });
}
