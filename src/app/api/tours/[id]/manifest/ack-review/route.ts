import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isMissingNeedsAccountantReviewColumnError } from "@/lib/tour-manifest-db";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Только бухгалтерия или руководство" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  const { error } = await supabase
    .from("tour_manifests")
    .update({ needs_accountant_review: false })
    .eq("tour_id", tourId);

  if (error && isMissingNeedsAccountantReviewColumnError(error.message)) {
    return NextResponse.json({ ok: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_manifest",
    entityId: tourId,
    action: "ack_review",
    after: { needs_accountant_review: false },
  });

  return NextResponse.json({ ok: true });
}
