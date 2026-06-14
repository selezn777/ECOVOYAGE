import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { canUploadBookingPassportPhotos } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Supabase public URL иногда не проходит z.string().url() в Zod - проверяем через URL(). */
function isHttpUrl(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const bodySchema = z.object({
  add: z.string().max(2000).optional(),
  remove: z.string().max(2000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: bookingId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const add = parsed.data.add?.trim();
  const remove = parsed.data.remove?.trim();
  if (!add && !remove) {
    return NextResponse.json({ error: "Укажите add или remove (URL)" }, { status: 400 });
  }
  if (add && !isHttpUrl(add)) {
    return NextResponse.json({ error: "Некорректный URL фото (нужен http/https)" }, { status: 400 });
  }
  if (remove && !isHttpUrl(remove)) {
    return NextResponse.json({ error: "Некорректный URL для удаления" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  /** Сначала только существующие колонки - иначе при отсутствии passport_photo_urls PostgREST даёт ошибку, её нельзя путать с «брони нет». */
  const { data: row, error: selErr } = await supabase
    .from("bookings")
    .select("id,manager_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message || "Ошибка чтения брони" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  }

  const managerId = String((row as { manager_id: string }).manager_id);
  if (!canUploadBookingPassportPhotos(session.role, session.id, managerId)) {
    return NextResponse.json({ error: "Нет права менять фото паспортов" }, { status: 403 });
  }

  const { data: urlsRow, error: urlsErr } = await supabase
    .from("bookings")
    .select("passport_photo_urls")
    .eq("id", bookingId)
    .maybeSingle();

  if (urlsErr) {
    const m = String(urlsErr.message || "");
    if (/passport_photo_urls|column|does not exist|schema cache/i.test(m)) {
      return NextResponse.json(
        {
          error:
            "В базе нет колонки passport_photo_urls. В Supabase → SQL Editor выполните: ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS passport_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: m }, { status: 500 });
  }

  const raw = (urlsRow as { passport_photo_urls?: unknown } | null)?.passport_photo_urls;
  let urls: string[] = [];
  if (Array.isArray(raw)) {
    urls = raw.filter((u): u is string => typeof u === "string" && u.length > 0);
  }

  if (add) {
    if (!urls.includes(add)) urls = [...urls, add];
  }
  if (remove) {
    urls = urls.filter((u) => u !== remove);
  }

  const { error: upErr } = await supabase
    .from("bookings")
    .update({ passport_photo_urls: urls })
    .eq("id", bookingId);

  if (upErr) {
    if (/passport_photo_urls/i.test(String(upErr.message))) {
      return NextResponse.json(
        { error: "Выполните миграцию: колонка passport_photo_urls в bookings." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "booking",
    entityId: bookingId,
    action: "passport_photos",
    after: { count: urls.length, add: Boolean(add), remove: Boolean(remove) },
  });

  return NextResponse.json({ ok: true, urls });
}
