import { NextResponse } from "next/server";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-session";
import { BUS_ROLES } from "@/lib/role-policy";
import { localDateString } from "@/lib/scheduling";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  busNumber: z.string().min(1),
  seats: z.number().int().min(0).max(50).optional().nullable(),
  comment: z.string().optional().nullable(),
  langNoteEn: z.string().optional().nullable(),
  langNoteVn: z.string().optional().nullable(),
});

async function assertCanModifyBusOnTour(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tourId: string,
  role: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
  const tourDate = tourRow?.start_at ? new Date(tourRow.start_at).toISOString().slice(0, 10) : null;
  const canAssignBusOnPastTour = role === "director" || role === "dispatcher";
  if (tourDate && tourDate < localDateString() && !canAssignBusOnPastTour) {
    return { ok: false, status: 403, message: "Нельзя менять автобус на прошедшем туре." };
  }
  return { ok: true };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!BUS_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId, assignmentId } = await params;
  const gate = await assertCanModifyBusOnTour(supabase, tourId, session.role);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const { data: assign, error: findErr } = await supabase
    .from("bus_assignments")
    .select("tour_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!assign || assign.tour_id !== tourId) {
    return NextResponse.json({ error: "Назначение не найдено." }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error: updErr } = await supabase
    .from("bus_assignments")
    .update({
      bus_number: parsed.data.busNumber.trim(),
      seats: parsed.data.seats ?? null,
      comment: parsed.data.comment ?? null,
      lang_note_en: parsed.data.langNoteEn ?? null,
      lang_note_vn: parsed.data.langNoteVn ?? null,
    })
    .eq("id", assignmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "bus_assignment",
    entityId: assignmentId,
    action: "update",
    after: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!BUS_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id: tourId, assignmentId } = await params;
  const gate = await assertCanModifyBusOnTour(supabase, tourId, session.role);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const { data: assign, error: findErr } = await supabase
    .from("bus_assignments")
    .select("tour_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!assign || assign.tour_id !== tourId) {
    return NextResponse.json({ error: "Назначение не найдено." }, { status: 404 });
  }

  const { error: delErr } = await supabase.from("bus_assignments").delete().eq("id", assignmentId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "bus_assignment",
    entityId: assignmentId,
    action: "delete",
    after: { tourId },
  });

  return NextResponse.json({ ok: true });
}
