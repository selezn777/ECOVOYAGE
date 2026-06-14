import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { canEditTourManifestRefundNotes } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  items: z.array(
    z.object({
      bookingId: z.string().uuid(),
      refundExecutionNote: z.union([z.string().max(4000), z.literal("")]).optional(),
    }),
  ),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditTourManifestRefundNotes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const raw = await request.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);

  for (const item of parsed.data.items) {
    const note =
      item.refundExecutionNote === undefined || item.refundExecutionNote === ""
        ? null
        : item.refundExecutionNote.trim() || null;

    const { data: row, error: selErr } = await supabase
      .from("tour_manifest_absences")
      .select("id")
      .eq("tour_id", tourId)
      .eq("booking_id", item.bookingId)
      .maybeSingle();

    if (selErr) {
      if (/refund_execution_note/i.test(String(selErr.message))) {
        return NextResponse.json(
          { error: "Выполните в Supabase: alter table tour_manifest_absences add column refund_execution_note text;" },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (!row) continue;

    const { error: upErr } = await supabase
      .from("tour_manifest_absences")
      .update({ refund_execution_note: note })
      .eq("tour_id", tourId)
      .eq("booking_id", item.bookingId);

    if (upErr) {
      if (/refund_execution_note/i.test(String(upErr.message))) {
        return NextResponse.json(
          { error: "Добавьте колонку refund_execution_note в tour_manifest_absences (см. migration_manifest_refund_execution_note.sql)." },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_manifest_absence",
    entityId: tourId,
    action: "refund_notes_update",
    after: { items: parsed.data.items.length },
  });

  return NextResponse.json({ ok: true });
}
