import { NextResponse } from "next/server";
import { z } from "zod";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { apiDenied } from "@/lib/api-denied";
import { canEditBookingDispatcherPhoto } from "@/lib/role-policy";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  photoUrl: z.union([z.string().url().max(2000), z.literal("")]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditBookingDispatcherPhoto(session.role)) return apiDenied();
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id } = await params;
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (bookingErr || !booking) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });

  const url = parsed.data.photoUrl === "" ? null : parsed.data.photoUrl;

  const { error: updErr } = await supabase.from("bookings").update({ dispatcher_booking_photo_url: url }).eq("id", id);

  if (updErr) {
    if (/dispatcher_booking_photo_url/i.test(String(updErr.message))) {
      return NextResponse.json(
        {
          error:
            "Добавьте колонку dispatcher_booking_photo_url в bookings (см. migration_booking_dispatcher_photo.sql).",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "booking",
    entityId: id,
    action: "dispatcher_booking_photo",
    after: { hasPhoto: Boolean(url) },
  });

  return NextResponse.json({ ok: true, photoUrl: url });
}
