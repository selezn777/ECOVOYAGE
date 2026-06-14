import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { getTourGuideAssignmentState } from "@/lib/data";
import { canAssignTourGuides } from "@/lib/role-policy";
import type { Role } from "@/lib/types";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { formatYmdWithWeekdayRu, localDateString } from "@/lib/scheduling";
import { createInAppNotificationsForUsers } from "@/lib/in-app-notifications";

const postSchema = z.object({
  guideId: z.string().uuid(),
  makePrimary: z.boolean().optional(),
  isInspection: z.boolean().optional(),
});

const patchSchema = z.object({
  guideId: z.string().uuid(),
  setPrimary: z.literal(true),
});

function assertCanAssign(session: { id: string; role: Role }) {
  return canAssignTourGuides(session.role);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const { id } = await params;
  const state = await getTourGuideAssignmentState(id);
  return NextResponse.json(state);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId } = await params;
  if (!assertCanAssign(session)) {
    return apiDenied();
  }
  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
  const tourDate = tourRow?.start_at ? new Date(tourRow.start_at).toISOString().slice(0, 10) : null;
  if (tourDate && tourDate < localDateString() && session.role !== "director") {
    return apiDenied();
  }

  const json = await request.json();
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { guideId, makePrimary } = parsed.data;
  const isInspection = parsed.data.isInspection === true;
  const state = await getTourGuideAssignmentState(tourId);
  if (state.assigned.some((a) => a.guideId === guideId)) {
    return NextResponse.json({ error: "Гид уже на этом туре" }, { status: 400 });
  }
  const assignedMain = state.assigned.filter((a) => !a.isInspection);
  const assignedInspection = state.assigned.filter((a) => a.isInspection);
  if (!isInspection && assignedMain.length >= 1) {
    return NextResponse.json({ error: "Основной гид уже назначен на тур." }, { status: 400 });
  }
  if (isInspection && assignedInspection.length >= 1) {
    return NextResponse.json({ error: "Инспекшн уже назначен на тур." }, { status: 400 });
  }
  const cand = state.candidates.find((c) => c.guideId === guideId);
  if (!cand) return NextResponse.json({ error: "Гид не найден" }, { status: 404 });
  if (!isInspection && cand.role !== "guide" && cand.role !== "chief_guide" && cand.role !== "director") {
    return NextResponse.json({ error: "Основным гидом можно назначить только сотрудника с ролью гида." }, { status: 400 });
  }
  if (cand.status === "day_off") {
    return NextResponse.json({ error: "У выбранного сотрудника выходной в эту дату" }, { status: 400 });
  }
  if (cand.status === "busy") {
    return NextResponse.json(
      { error: cand.otherTourName ? `Already on tour: ${cand.otherTourName}` : "Already assigned another tour this day" },
      { status: 400 },
    );
  }

  const { data: existingPrimary } = await supabase
    .from("tour_guides")
    .select("id")
    .eq("tour_id", tourId)
    .eq("is_primary", true)
    .limit(1);
  const shouldPrimary = !isInspection && (makePrimary === true || !existingPrimary?.length);

  if (shouldPrimary) {
    await supabase.from("tour_guides").update({ is_primary: false }).eq("tour_id", tourId);
  }

  const { error: insErr } = await supabase.from("tour_guides").insert([
    {
      tour_id: tourId,
      guide_id: guideId,
      is_primary: shouldPrimary,
      is_inspection: isInspection,
    },
  ]);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_guides",
    entityId: tourId,
    action: isInspection ? "assign_inspection" : "assign_guide",
    after: { guide_id: guideId, is_primary: shouldPrimary, is_inspection: isInspection },
  });

  try {
    const { data: tourMeta } = await supabase.from("tours").select("name,start_at").eq("id", tourId).maybeSingle();
    const nm = String((tourMeta as { name?: string } | null)?.name || "").trim() || "Тур";
    const rawStart = (tourMeta as { start_at?: string } | null)?.start_at;
    const ymd = rawStart ? String(rawStart).slice(0, 10) : "";
    const whenRu = ymd ? formatYmdWithWeekdayRu(ymd) : "";
    const suffix = isInspection ? " (инспекшн)" : "";
    await createInAppNotificationsForUsers(
      supabase,
      [guideId],
      {
        kind: "guide_assigned",
        title: `Вы назначены на тур${suffix}`,
        body: whenRu ? `${nm} · ${whenRu}` : nm,
        linkUrl: `/tours/${tourId}`,
        meta: { tourId, inspection: isInspection },
      },
    );
  } catch {
    /* не блокируем назначение */
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId } = await params;
  if (!assertCanAssign(session)) {
    return apiDenied();
  }
  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
  const tourDate = tourRow?.start_at ? new Date(tourRow.start_at).toISOString().slice(0, 10) : null;
  if (tourDate && tourDate < localDateString() && session.role !== "director") {
    return apiDenied();
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { guideId } = parsed.data;
  const { data: row } = await supabase
    .from("tour_guides")
    .select("guide_id,is_inspection")
    .eq("tour_id", tourId)
    .eq("guide_id", guideId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Гида нет на этом туре" }, { status: 404 });
  if (row.is_inspection) return NextResponse.json({ error: "Инспекшн нельзя сделать основным гидом." }, { status: 400 });

  await supabase.from("tour_guides").update({ is_primary: false }).eq("tour_id", tourId);
  const { error: upErr } = await supabase
    .from("tour_guides")
    .update({ is_primary: true })
    .eq("tour_id", tourId)
    .eq("guide_id", guideId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_guides",
    entityId: tourId,
    action: "set_primary_guide",
    after: { guide_id: guideId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId } = await params;
  if (!assertCanAssign(session)) {
    return apiDenied();
  }
  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
  const tourDate = tourRow?.start_at ? new Date(tourRow.start_at).toISOString().slice(0, 10) : null;
  if (tourDate && tourDate < localDateString() && session.role !== "director") {
    return apiDenied();
  }

  const guideId = new URL(request.url).searchParams.get("guideId");
  if (!guideId) return NextResponse.json({ error: "Нужен параметр guideId" }, { status: 400 });

  const { data: row } = await supabase
    .from("tour_guides")
    .select("is_primary,is_inspection")
    .eq("tour_id", tourId)
    .eq("guide_id", guideId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Не назначен на этот тур" }, { status: 404 });

  const wasPrimary = row.is_primary;
  const wasInspection = row.is_inspection;
  const { error: delErr } = await supabase.from("tour_guides").delete().eq("tour_id", tourId).eq("guide_id", guideId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (wasPrimary) {
    const { data: rest } = await supabase
      .from("tour_guides")
      .select("guide_id,is_inspection")
      .eq("tour_id", tourId)
      .eq("is_inspection", false)
      .limit(1);
    if (rest?.length) {
      await supabase.from("tour_guides").update({ is_primary: true }).eq("tour_id", tourId).eq("guide_id", rest[0].guide_id);
    }
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_guides",
    entityId: tourId,
    action: wasInspection ? "unassign_inspection" : "unassign_guide",
    before: { guide_id: guideId, is_inspection: wasInspection },
  });

  return NextResponse.json({ ok: true });
}
