import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { apiDenied } from "@/lib/api-denied";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";

const TOUR_DELETE_ROLES = ["director", "chief_manager", "dispatcher"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!TOUR_DELETE_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id } = await params;

  const { data: tour, error: tourErr } = await supabase
    .from("tours")
    .select("id,name,status,deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (tourErr || !tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  if ((tour as { deleted_at?: string | null }).deleted_at || (tour as { status: string }).status === "deleted") {
    return NextResponse.json({ error: "Тур уже удалён" }, { status: 400 });
  }

  // Проверяем активные брони (не удалённые)
  const { count: activeBookings } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tour_id", id)
    .is("deleted_at", null);

  if (activeBookings && activeBookings > 0) {
    return NextResponse.json(
      { error: `В туре есть ${activeBookings} активных брон(и). Сначала перенесите или удалите их.` },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("tours")
    .update({ status: "deleted", deleted_at: now })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "tour",
    entityId: id,
    action: "soft_delete",
    before: { name: (tour as { name: string }).name, status: (tour as { status: string }).status },
    after: { status: "deleted", deleted_at: now },
  });

  return NextResponse.json({ ok: true });
}
