import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canResolveTourOverbook } from "@/lib/role-policy";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";

function nextCloneName(baseName: string, existingNames: string[]): string {
  const base = baseName.trim() || "Тур";
  const taken = new Set(existingNames.map((x) => x.trim().toLowerCase()));
  // Первая копия без номера; следующие — (2), (3), ...
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (i < 1000) {
    const n = `${base} (${i})`;
    if (!taken.has(n.toLowerCase())) return n;
    i += 1;
  }
  return `${base} (${Date.now()})`;
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const canManage = canResolveTourOverbook(session.role) || canResolveTourOverbook(session.baseRole);
  if (!canManage) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: src, error: srcErr } = await supabase
    .from("tours")
    .select(
      "id,name,tour_type,start_at,end_at,capacity,template_id,default_offer_usd,default_offer_rate_to_vnd,default_offer_vnd,description_override,status",
    )
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  if (!src) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  if (String((src as { status?: string }).status || "") === "deleted") {
    return NextResponse.json({ error: "Нельзя копировать удалённый тур" }, { status: 400 });
  }

  const srcRow = src as {
    name?: string | null;
    start_at: string;
    end_at: string;
    tour_type?: "group" | "private" | null;
    capacity?: number | null;
    template_id?: string | null;
    default_offer_usd?: number | null;
    default_offer_rate_to_vnd?: number | null;
    default_offer_vnd?: number | null;
    description_override?: string | null;
  };

  const srcDate = String(srcRow.start_at || "").slice(0, 10);
  const baseName = String(srcRow.name || "Тур");
  const { data: sameDayRows } = await supabase
    .from("tours")
    .select("name")
    .gte("start_at", `${srcDate}T00:00:00+07:00`)
    .lte("start_at", `${srcDate}T23:59:59+07:00`)
    .is("deleted_at", null);
  const names = ((sameDayRows as { name?: string | null }[] | null) ?? []).map((r) => String(r.name || ""));
  const clonedName = nextCloneName(baseName, names);

  const insertRow = {
    name: clonedName,
    tour_type: srcRow.tour_type ?? "group",
    start_at: srcRow.start_at,
    end_at: srcRow.end_at,
    capacity: Math.max(1, Math.round(Number(srcRow.capacity || 1))),
    template_id: srcRow.template_id ?? null,
    default_offer_usd: srcRow.default_offer_usd ?? 0,
    default_offer_rate_to_vnd: srcRow.default_offer_rate_to_vnd ?? 1,
    default_offer_vnd: srcRow.default_offer_vnd ?? 0,
    description_override: srcRow.description_override ?? null,
    created_by: actorUuidOrNull(session.id),
  };

  const { data: inserted, error: insErr } = await supabase.from("tours").insert([insertRow]).select("id").maybeSingle();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  const newTourId = (inserted as { id?: string } | null)?.id;
  if (!newTourId) return NextResponse.json({ error: "Не удалось создать дубль тура" }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "tour",
    entityId: newTourId,
    action: "overbook_clone_create",
    before: { source_tour_id: tourId },
    after: { name: clonedName, source_tour_id: tourId },
  });

  return NextResponse.json({
    ok: true,
    newTourId,
    href: `/tours/${newTourId}?transferFrom=${encodeURIComponent(tourId)}`,
  });
}
