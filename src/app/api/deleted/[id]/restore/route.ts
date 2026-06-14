import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!["director", "chief_manager", "accountant"].includes(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id } = await params;
  const { data: item, error } = await supabase
    .from("deleted_items")
    .select("id,entity,entity_id,restore_until")
    .eq("id", id)
    .maybeSingle();

  if (error || !item) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  if (new Date(item.restore_until).getTime() < Date.now()) {
    return NextResponse.json({ error: "Срок восстановления истёк" }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);

  if (item.entity === "booking") {
    const { error: restoreErr } = await supabase.from("bookings").update({ deleted_at: null }).eq("id", item.entity_id);
    if (restoreErr) return NextResponse.json({ error: restoreErr.message }, { status: 500 });
  }

  const { error: delErr } = await supabase.from("deleted_items").delete().eq("id", item.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: item.entity,
    entityId: item.entity_id,
    action: "restore",
    after: { deleted_item_id: item.id },
  });

  return NextResponse.json({ ok: true });
}
