import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";
import { z } from "zod";

const patchSchema = z.object({
  action: z.enum(["approve", "recheck", "reset"]),
  note: z.string().max(4000).optional(),
});

/** Служебно: снять пометку «в обработке» (устаревшие записи). */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: expenseId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);

  const { data: before } = await supabase
    .from("expenses")
    .select("id,pending_accountant_review,tour_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (!before) return NextResponse.json({ error: "Расход не найден" }, { status: 404 });

  const { error } = await supabase
    .from("expenses")
    .update({
      pending_accountant_review: false,
      accountant_reviewed_at: new Date().toISOString(),
      accountant_reviewed_by: actorId,
    })
    .eq("id", expenseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "expense",
    entityId: expenseId,
    action: "accountant_review",
    before: { pending_accountant_review: (before as { pending_accountant_review: boolean }).pending_accountant_review },
    after: { pending_accountant_review: false },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: expenseId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  const actorId = actorUuidOrNull(session.id);

  const action = parsed.data.action;
  const note = parsed.data.note?.trim() || null;
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> =
    action === "approve"
      ? {
          pending_accountant_review: false,
          accountant_reviewed_at: nowIso,
          accountant_reviewed_by: actorId,
          accountant_review_state: "approved",
          accountant_review_note: note,
        }
      : action === "recheck"
        ? {
            pending_accountant_review: true,
            accountant_reviewed_at: null,
            accountant_reviewed_by: null,
            accountant_review_state: "recheck",
            accountant_review_note: note,
          }
        : {
            pending_accountant_review: true,
            accountant_reviewed_at: null,
            accountant_reviewed_by: null,
            accountant_review_state: "pending",
            accountant_review_note: note,
          };

  let { error } = await supabase.from("expenses").update(patch).eq("id", expenseId);
  if (error && /accountant_review_state|accountant_review_note|column|does not exist/i.test(String(error.message))) {
    const legacyPatch = { ...patch };
    delete (legacyPatch as Record<string, unknown>).accountant_review_state;
    delete (legacyPatch as Record<string, unknown>).accountant_review_note;
    ({ error } = await supabase.from("expenses").update(legacyPatch).eq("id", expenseId));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "expense",
    entityId: expenseId,
    action: `accountant_review_${action}`,
    after: { note: note ?? null },
  });

  return NextResponse.json({ ok: true });
}
