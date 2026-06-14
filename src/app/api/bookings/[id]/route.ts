import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { FINANCE_ROLES } from "@/lib/role-policy";
import {
  defaultTourPickupHhMmFromStartEndIso,
  normalizeTourPickupHhMm,
  tourBusinessTodayYmd,
  tourCalendarDateFromStartAtIso,
} from "@/lib/scheduling";
import { isPastTourBookingEditCutoff } from "@/lib/tour-booking-policies";
import { normalizePhone } from "@/lib/format";
import { normalizeTelegramUsername } from "@/lib/telegram-username";

const patchSchema = z.object({
  adults: z.number().int().min(0).max(20),
  children: z.number().int().min(0).max(20),
  infants: z.number().int().min(0).max(20),
  note: z.string().max(5000).optional().default(""),
  customerName: z.string().min(1).max(500),
  hotelName: z.string().max(500).optional().default(""),
  hotelAddress: z.string().max(500).optional().default(""),
  hotelMapsUrl: z.string().max(2000).optional().default(""),
  room: z.string().max(100).optional().default(""),
  phone: z.string().min(6).max(40),
  phoneAlt: z.string().max(40).optional().or(z.literal("")),
  /** HH:MM времени сбора у отеля — если не передан, сохраняется текущее */
  pickupTime: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional(),
  telegramUsername: z.string().max(64).optional(),
  priceLines: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        amountVnd: z.number().int().min(0),
      }),
    )
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!FINANCE_ROLES.includes(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { id } = await params;
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,created_at,adults,children,infants,pickup_time")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  }

  if (session.role === "manager" && booking.manager_id !== session.id) {
    return apiDenied();
  }

  const { data: tourRow } = await supabase
    .from("tours")
    .select("start_at,end_at")
    .eq("id", booking.tour_id)
    .maybeSingle();
  const trTour = tourRow as { start_at?: string | null; end_at?: string | null } | null;
  const tourStartAt = trTour?.start_at ? String(trTour.start_at) : "";
  const tourEndAt = trTour?.end_at && String(trTour.end_at).trim() ? String(trTour.end_at) : null;
  const tourStandardPickup = defaultTourPickupHhMmFromStartEndIso(tourStartAt, tourEndAt);
  const prevPickupNorm = normalizeTourPickupHhMm(
    booking.pickup_time != null && String(booking.pickup_time).trim().length >= 5
      ? String(booking.pickup_time).slice(0, 5)
      : "",
  );
  const tourCalendarYmd = tourStartAt ? tourCalendarDateFromStartAtIso(tourStartAt) : "";
  const readOnlyPast =
    tourCalendarYmd !== "" &&
    tourCalendarYmd < tourBusinessTodayYmd() &&
    session.role !== "director";
  if (readOnlyPast) {
    return apiDenied();
  }

  const touristEditsAllowed =
    session.role === "director" || !tourStartAt || !isPastTourBookingEditCutoff(tourStartAt, Date.now());
  if (!touristEditsAllowed) {
    return NextResponse.json(
      {
        error:
          "Редактирование недоступно: после 17:00 накануне выезда изменения только через директора (правила переноса/отмены).",
      },
      { status: 400 },
    );
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const {
    adults,
    children,
    infants,
    note,
    customerName,
    hotelName,
    hotelAddress,
    hotelMapsUrl,
    room,
    phone,
    pickupTime,
    phoneAlt,
    telegramUsername,
    priceLines,
  } = parsed.data;
  const hotel = hotelName.trim() || "-";
  const addressTrim = hotelAddress.trim();
  const mapsTrim = hotelMapsUrl.trim();
  const roomTrim = room.trim();
  const rawPickup = pickupTime ?? (booking.pickup_time ? String(booking.pickup_time).slice(0, 5) : "00:00");
  const [ph, pm] = rawPickup.split(":");
  const pickupNorm = `${ph.padStart(2, "0")}:${pm}`;

  if (pickupTime && session.role === "accountant" && pickupNorm !== prevPickupNorm) {
    return NextResponse.json(
      {
        error:
          "Время сбора у отеля меняют менеджер продаж (своя бронь), главный менеджер или директор — с указанием причины в примечании к брони, если время нестандартное.",
      },
      { status: 400 },
    );
  }

  if (
    pickupTime &&
    tourStandardPickup &&
    pickupNorm !== tourStandardPickup &&
    session.role !== "director" &&
    session.role !== "accountant" &&
    note.trim().length < 12
  ) {
    return NextResponse.json(
      {
        error:
          "Время сбора отличается от стандартного по туру — добавьте в примечание к брони причину (не короче 12 символов), чтобы гид и офис видели контекст.",
      },
      { status: 400 },
    );
  }

  let telegramNorm: string | null | undefined;
  if (telegramUsername !== undefined) {
    const raw = telegramUsername.trim();
    if (!raw) {
      telegramNorm = null;
    } else {
      telegramNorm = normalizeTelegramUsername(raw);
      if (!telegramNorm) {
        return NextResponse.json(
          { error: "Некорректный ник Telegram: латиница, 5-32 символа, с буквы (можно без @)." },
          { status: 400 },
        );
      }
    }
  }

  const updatePayload: Record<string, unknown> = {
    adults,
    children,
    infants,
    note: note.trim() ? note.trim() : null,
    customer_name: customerName.trim(),
    hotel_name: hotel,
    hotel_address: addressTrim ? addressTrim : null,
    hotel_maps_url: mapsTrim ? mapsTrim : null,
    room: roomTrim ? roomTrim : null,
    phone_e164: normalizePhone(phone),
    phone_alt_e164: phoneAlt && phoneAlt.trim() ? normalizePhone(phoneAlt) : null,
    pickup_time: `${pickupNorm}:00`,
  };
  if (telegramNorm !== undefined) {
    updatePayload.telegram_username = telegramNorm;
  }

  let { error: updErr } = await supabase.from("bookings").update(updatePayload).eq("id", id);

  if (updErr && /hotel_address|column.*does not exist|schema cache/i.test(String(updErr.message))) {
    delete updatePayload.hotel_address;
    ({ error: updErr } = await supabase.from("bookings").update(updatePayload).eq("id", id));
  }

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  if (priceLines && priceLines.length > 0) {
    const { error: delErr } = await supabase.from("booking_prices").delete().eq("booking_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await supabase.from("booking_prices").insert(
      priceLines.map((l) => ({
        booking_id: id,
        person_label: l.label,
        amount: l.amountVnd,
        currency: "VND",
        rate_to_vnd: 1,
        amount_vnd: l.amountVnd,
      })),
    );
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const oldPax = Number(booking.adults) + Number(booking.children) + Number(booking.infants);
  const newPax = adults + children + infants;
  const addedPax = Math.max(0, newPax - oldPax);
  let extraAmountVnd = 0;
  if (addedPax > 0 && oldPax > 0) {
    const { data: beforePriceRows } = await supabase.from("booking_prices").select("amount_vnd").eq("booking_id", id);
    const totalBeforeVnd = (beforePriceRows || []).reduce((s, r) => s + Number(r.amount_vnd || 0), 0);
    const perPaxVnd = Math.max(0, Math.round(totalBeforeVnd / oldPax));
    extraAmountVnd = perPaxVnd * addedPax;
    if (extraAmountVnd > 0) {
      const { error: addPriceErr } = await supabase.from("booking_prices").insert([
        {
          booking_id: id,
          amount: extraAmountVnd,
          currency: "VND",
          rate_to_vnd: 1,
          amount_vnd: extraAmountVnd,
        },
      ]);
      if (addPriceErr) {
        return NextResponse.json({ error: addPriceErr.message }, { status: 500 });
      }
    }
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: id,
    action: "patch_tourist_fields",
    after: {
      adults,
      children,
      infants,
      note,
      customer_name: customerName.trim(),
      hotel_name: hotel,
      hotel_address: addressTrim || null,
      hotel_maps_url: mapsTrim || null,
      room: roomTrim || null,
      pickup_time: pickupNorm,
      extra_amount_vnd: extraAmountVnd,
    },
  });

  await supabase
    .from("tour_booking_intents")
    .delete()
    .eq("tour_id", booking.tour_id)
    .eq("manager_id", session.id);

  return NextResponse.json({ ok: true });
}
