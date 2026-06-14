import { NextResponse } from "next/server";
import { z } from "zod";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { apiDenied } from "@/lib/api-denied";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-session";
import { canEditTourDispatcherBooking, canViewTourDispatcherBooking } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  note: z.string().max(3000).optional().nullable(),
  photoUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canViewTourDispatcherBooking(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId } = await params;
  const full = await supabase
    .from("tour_dispatcher_bookings")
    .select("tour_id,note,photo_url,updated_at,updated_by")
    .eq("tour_id", tourId)
    .maybeSingle();
  if (!full.error && full.data) return NextResponse.json({ entry: full.data });

  if (full.error && /updated_by|column|does not exist/i.test(String(full.error.message))) {
    const fallback = await supabase
      .from("tour_dispatcher_bookings")
      .select("tour_id,note,photo_url,updated_at")
      .eq("tour_id", tourId)
      .maybeSingle();
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ entry: fallback.data ?? null });
  }

  if (full.error && /tour_dispatcher_bookings|does not exist|relation/i.test(String(full.error.message))) {
    return NextResponse.json({ error: "Нужна таблица tour_dispatcher_bookings в Supabase." }, { status: 500 });
  }
  return NextResponse.json({ entry: null });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditTourDispatcherBooking(session.role)) return apiDenied();
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const note = (parsed.data.note ?? "").trim() || null;
  const photoUrlRaw = parsed.data.photoUrl;
  const photoUrl = photoUrlRaw == null || photoUrlRaw === "" ? null : photoUrlRaw;

  const actorId = actorUuidOrNull(session.id);
  const payload = {
    tour_id: tourId,
    note,
    photo_url: photoUrl,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };

  let upsert = await supabase.from("tour_dispatcher_bookings").upsert(payload, { onConflict: "tour_id" });
  if (upsert.error && /updated_by|column|does not exist/i.test(String(upsert.error.message))) {
    const legacyPayload = {
      tour_id: tourId,
      note,
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    };
    upsert = await supabase.from("tour_dispatcher_bookings").upsert(legacyPayload, { onConflict: "tour_id" });
  }
  if (upsert.error) {
    if (/tour_dispatcher_bookings|does not exist|relation/i.test(String(upsert.error.message))) {
      return NextResponse.json(
        {
          error:
            "Нужна таблица tour_dispatcher_bookings в Supabase. Примените новую миграцию из supabase/migrations.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: upsert.error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_dispatcher_booking",
    entityId: tourId,
    action: "upsert",
    after: { hasNote: Boolean(note), hasPhoto: Boolean(photoUrl) },
  });

  return NextResponse.json({ ok: true, note, photoUrl });
}
