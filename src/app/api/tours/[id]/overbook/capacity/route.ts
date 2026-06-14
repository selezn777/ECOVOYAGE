import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canResolveTourOverbook } from "@/lib/role-policy";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  capacity: z.number().int().min(1).max(500),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const canManage = canResolveTourOverbook(session.role) || canResolveTourOverbook(session.baseRole);
  if (!canManage) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id: tourId } = await ctx.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: before, error: selErr } = await supabase
    .from("tours")
    .select("id,capacity,status")
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  if (String((before as { status?: string }).status || "") === "deleted") {
    return NextResponse.json({ error: "Нельзя менять удалённый тур" }, { status: 400 });
  }

  const nextCapacity = parsed.data.capacity;
  const { error: upErr } = await supabase.from("tours").update({ capacity: nextCapacity }).eq("id", tourId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "tour",
    entityId: tourId,
    action: "overbook_capacity_update",
    before: { capacity: (before as { capacity?: number | null }).capacity ?? null },
    after: { capacity: nextCapacity },
  });

  return NextResponse.json({ ok: true, capacity: nextCapacity });
}
