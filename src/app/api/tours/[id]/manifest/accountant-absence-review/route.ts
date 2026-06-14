import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const itemSchema = z.object({
  bookingId: z.string().uuid(),
  refundExecutionNote: z.union([z.string().max(4000), z.literal("")]).optional(),
  decision: z.enum(["approved", "rejected"]).nullable().optional(),
  comment: z.union([z.string().max(4000), z.literal("")]).optional(),
  traveledAdults: z.number().int().min(0).nullable().optional(),
  traveledChildren: z.number().int().min(0).nullable().optional(),
  traveledInfants: z.number().int().min(0).nullable().optional(),
  markReviewed: z.boolean().optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
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
  const nowIso = new Date().toISOString();

  for (const item of parsed.data.items) {
    const { data: exists, error: selErr } = await supabase
      .from("tour_manifest_absences")
      .select("id")
      .eq("tour_id", tourId)
      .eq("booking_id", item.bookingId)
      .maybeSingle();

    if (selErr) {
      if (/accountant_absence/i.test(String(selErr.message))) {
        return NextResponse.json(
          { error: "Выполните миграцию tour_manifest_absences (поля accountant_*)." },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (!exists) continue;

    const note =
      item.refundExecutionNote === undefined || item.refundExecutionNote === ""
        ? undefined
        : item.refundExecutionNote.trim() || null;

    const patch: Record<string, unknown> = {};
    if (note !== undefined) patch.refund_execution_note = note;
    if (item.decision !== undefined) patch.accountant_absence_decision = item.decision;
    if (item.comment !== undefined) patch.accountant_absence_comment = item.comment.trim() || null;
    if (item.traveledAdults !== undefined) patch.accountant_traveled_adults = item.traveledAdults;
    if (item.traveledChildren !== undefined) patch.accountant_traveled_children = item.traveledChildren;
    if (item.traveledInfants !== undefined) patch.accountant_traveled_infants = item.traveledInfants;
    if (item.markReviewed) {
      patch.accountant_absence_reviewed_at = nowIso;
      patch.accountant_absence_reviewed_by = actorId;
    }

    if (Object.keys(patch).length === 0) continue;

    const { error: upErr } = await supabase
      .from("tour_manifest_absences")
      .update(patch)
      .eq("tour_id", tourId)
      .eq("booking_id", item.bookingId);

    if (upErr) {
      if (/accountant_absence/i.test(String(upErr.message))) {
        return NextResponse.json({ error: "Миграция accountant_* для tour_manifest_absences не применена." }, { status: 500 });
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_manifest_absence",
    entityId: tourId,
    action: "accountant_absence_review",
    after: { items: parsed.data.items.length },
  });

  return NextResponse.json({ ok: true });
}
