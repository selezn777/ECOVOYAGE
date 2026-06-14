import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { isUserAssignedGuideOnTour } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canConfirmExpenseAccountantReview, canSubmitGuideTourExpenses } from "@/lib/role-policy";
import { parseExpenseImageDataUrl } from "@/lib/expense-attachment";
import {
  isMissingExpensesDbColumn,
  isMissingPendingAccountantReviewColumn,
  isMissingAccountantReviewedAtColumn,
  withDateMismatchFallbackDescription,
} from "@/lib/expense-pending-fallback";

const bodySchema = z.object({
  amountVnd: z.number().int().min(1),
  description: z.string().min(1).max(500),
  /** data:image/jpeg|png|webp;base64,... - фото чека */
  attachmentDataUrl: z.string().optional(),
  /** Дата чека ≠ день тура и т.п. - бухгалтер проверит позже */
  pendingAccountantReview: z.boolean().optional(),
});

const patchBodySchema = bodySchema.extend({
  expenseId: z.string().uuid(),
});

const deleteBodySchema = z.object({
  expenseId: z.string().uuid(),
});

const DUPLICATE_EXPENSE_WINDOW_MS = 45_000;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canSubmitGuideTourExpenses(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
  if (session.role !== "booking_dispatcher" && session.role !== "dispatcher" && !onTour) {
    return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const actorId = actorUuidOrNull(session.id);
  const { amountVnd, description, attachmentDataUrl, pendingAccountantReview } = parsed.data;
  const attachmentUrl = attachmentDataUrl ? parseExpenseImageDataUrl(attachmentDataUrl) : null;
  if (attachmentDataUrl && !attachmentUrl) {
    return NextResponse.json(
      { error: "Некорректное фото: нужен JPEG, PNG или WebP до ~2 МБ." },
      { status: 400 },
    );
  }

  const reviewer = canConfirmExpenseAccountantReview(session.role);
  const pending = !reviewer || pendingAccountantReview === true;

  // Защита от повторного сабмита (двойной тап/повтор запроса): ищем практически
  // идентичный расход этого же автора в коротком окне времени и переиспользуем его.
  const duplicateSinceIso = new Date(Date.now() - DUPLICATE_EXPENSE_WINDOW_MS).toISOString();
  const duplicateLookup = await supabase
    .from("expenses")
    .select("id")
    .eq("tour_id", tourId)
    .eq("category", "guide")
    .eq("created_by", actorId)
    .eq("amount_vnd", amountVnd)
    .eq("description", description)
    .gte("created_at", duplicateSinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!duplicateLookup.error && duplicateLookup.data?.id) {
    return NextResponse.json({ ok: true, id: String(duplicateLookup.data.id), duplicate: true });
  }

  const rowFull = {
    tour_id: tourId,
    category: "guide" as const,
    amount_vnd: amountVnd,
    description,
    created_by: actorId,
    attachment_url: attachmentUrl,
    pending_accountant_review: pending,
    accountant_review_state: pending ? "pending" : "approved",
    accountant_review_note: null,
  };

  const descriptionLegacy = pending ? withDateMismatchFallbackDescription(description) : description;

  const stripReviewWorkflowFields = <T extends Record<string, unknown>>(obj: T) => {
    const copy = { ...obj };
    delete copy.accountant_review_state;
    delete copy.accountant_review_note;
    delete copy.accountant_reviewed_at;
    delete copy.accountant_reviewed_by;
    return copy;
  };

  let { data: row, error } = await supabase.from("expenses").insert([rowFull]).select("id").single();
  if (error && /accountant_review_state|accountant_review_note|column|does not exist/i.test(String(error.message))) {
    const retry = await supabase.from("expenses").insert([stripReviewWorkflowFields(rowFull)]).select("id").single();
    row = retry.data;
    error = retry.error;
  }

  if (error && isMissingExpensesDbColumn(error, "attachment_url")) {
    const retry = await supabase
      .from("expenses")
      .insert([
        {
          tour_id: tourId,
          category: "guide" as const,
          amount_vnd: amountVnd,
          description,
          created_by: actorId,
          pending_accountant_review: pending,
        },
      ])
      .select("id")
      .single();
    row = retry.data;
    error = retry.error;
  }

  if (error && isMissingPendingAccountantReviewColumn(error)) {
    const base: Record<string, unknown> = {
      tour_id: tourId,
      category: "guide" as const,
      amount_vnd: amountVnd,
      description: descriptionLegacy,
      created_by: actorId,
    };
    if (attachmentUrl) base.attachment_url = attachmentUrl;
    const retry = await supabase.from("expenses").insert([base]).select("id").single();
    row = retry.data;
    error = retry.error;
  }

  if (error && isMissingExpensesDbColumn(error, "attachment_url") && attachmentUrl) {
    const retry = await supabase
      .from("expenses")
      .insert([
        {
          tour_id: tourId,
          category: "guide" as const,
          amount_vnd: amountVnd,
          description: descriptionLegacy,
          created_by: actorId,
        },
      ])
      .select("id")
      .single();
    row = retry.data;
    error = retry.error;
  }

  if (error || !row) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "expense",
    entityId: (row as { id: string }).id,
    action: "create",
    after: {
      tour_id: tourId,
      category: "guide",
      amount_vnd: amountVnd,
      has_attachment: Boolean(attachmentUrl),
    },
  });

  return NextResponse.json({ ok: true, id: (row as { id: string }).id });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canSubmitGuideTourExpenses(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
  if (session.role !== "booking_dispatcher" && session.role !== "dispatcher" && !onTour) {
    return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  const { expenseId, amountVnd, description, attachmentDataUrl, pendingAccountantReview } = parsed.data;

  const selectWithReviewedAt = supabase
    .from("expenses")
    .select("id,tour_id,category,created_by,accountant_reviewed_at")
    .eq("id", expenseId)
    .eq("tour_id", tourId)
    .maybeSingle();
  let expenseRow: any = null;
  let expenseSelectErr: any = null;
  ({ data: expenseRow, error: expenseSelectErr } = (await selectWithReviewedAt) as any);

  if (!expenseRow && expenseSelectErr && isMissingAccountantReviewedAtColumn(expenseSelectErr)) {
    const selectWithoutReviewedAt = await supabase
      .from("expenses")
      .select("id,tour_id,category,created_by")
      .eq("id", expenseId)
      .eq("tour_id", tourId)
      .maybeSingle();
    expenseRow = selectWithoutReviewedAt.data;
    expenseSelectErr = selectWithoutReviewedAt.error;
  }

  if (!expenseRow) return NextResponse.json({ error: "Расход не найден" }, { status: 404 });
  if (expenseRow.category !== "guide") return NextResponse.json({ error: "Можно редактировать только расходы гида" }, { status: 403 });
  if (session.role !== "dispatcher" && actorId && expenseRow.created_by !== actorId) {
    return NextResponse.json({ error: "Можно редактировать только свои расходы" }, { status: 403 });
  }

  if ("accountant_reviewed_at" in expenseRow && expenseRow.accountant_reviewed_at) {
    return NextResponse.json({ error: "Редактирование запрещено: расход подтверждён бухгалтерией" }, { status: 403 });
  }

  let attachmentUrl: string | null | undefined = undefined;
  if (typeof attachmentDataUrl === "string") {
    attachmentUrl = parseExpenseImageDataUrl(attachmentDataUrl);
    if (attachmentDataUrl && !attachmentUrl) {
      return NextResponse.json({ error: "Некорректное фото: нужен JPEG, PNG или WebP до ~2 МБ." }, { status: 400 });
    }
  }

  const reviewer = canConfirmExpenseAccountantReview(session.role);

  const updateFull: Record<string, unknown> = {
    amount_vnd: amountVnd,
    description,
    ...(attachmentUrl !== undefined ? { attachment_url: attachmentUrl } : {}),
  };
  if (!reviewer) {
    updateFull.pending_accountant_review = true;
    updateFull.accountant_review_state = "pending";
    updateFull.accountant_review_note = null;
    updateFull.accountant_reviewed_at = null;
    updateFull.accountant_reviewed_by = null;
  } else if (pendingAccountantReview !== undefined) {
    updateFull.pending_accountant_review = pendingAccountantReview === true;
    updateFull.accountant_review_state = pendingAccountantReview ? "pending" : "approved";
    if (pendingAccountantReview) {
      updateFull.accountant_review_note = null;
      updateFull.accountant_reviewed_at = null;
      updateFull.accountant_reviewed_by = null;
    }
  }

  const stripReviewWorkflowFields = <T extends Record<string, unknown>>(obj: T) => {
    const copy = { ...obj };
    delete copy.accountant_review_state;
    delete copy.accountant_review_note;
    delete copy.accountant_reviewed_at;
    delete copy.accountant_reviewed_by;
    return copy;
  };

  let { error } = await supabase.from("expenses").update(updateFull).eq("id", expenseId);
  if (error && /accountant_review_state|accountant_review_note|column|does not exist/i.test(String(error.message))) {
    ({ error } = await supabase.from("expenses").update(stripReviewWorkflowFields(updateFull)).eq("id", expenseId));
  }

  if (error && isMissingExpensesDbColumn(error, "attachment_url") && attachmentUrl !== undefined) {
    const updateNoAttach = { ...updateFull };
    delete updateNoAttach.attachment_url;
    ({ error } = await supabase.from("expenses").update(updateNoAttach).eq("id", expenseId));
  }

  if (error && isMissingPendingAccountantReviewColumn(error)) {
    const pendingLegacy = !reviewer || pendingAccountantReview === true;
    const descriptionLegacy = pendingLegacy ? withDateMismatchFallbackDescription(description) : description;
    const updateLegacy: Record<string, unknown> = {
      amount_vnd: amountVnd,
      description: descriptionLegacy,
      ...(attachmentUrl !== undefined ? { attachment_url: attachmentUrl } : {}),
    };
    ({ error } = await supabase.from("expenses").update(updateLegacy).eq("id", expenseId));
  }

  if (error && isMissingExpensesDbColumn(error, "attachment_url") && attachmentUrl !== undefined) {
    const pendingLegacy = !reviewer || pendingAccountantReview === true;
    const descriptionLegacy = pendingLegacy ? withDateMismatchFallbackDescription(description) : description;
    ({ error } = await supabase
      .from("expenses")
      .update({ amount_vnd: amountVnd, description: descriptionLegacy })
      .eq("id", expenseId));
  }

  if (error) return NextResponse.json({ error: error.message || "Update failed" }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "expense",
    entityId: expenseId,
    action: "update",
    after: {
      tour_id: tourId,
      category: "guide",
      amount_vnd: amountVnd,
      has_attachment: attachmentUrl !== undefined ? Boolean(attachmentUrl) : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canSubmitGuideTourExpenses(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
  if (session.role !== "booking_dispatcher" && session.role !== "dispatcher" && !onTour) {
    return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
  }

  const json = await request.json();
  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const actorId = actorUuidOrNull(session.id);
  const { expenseId } = parsed.data;

  const selectWithReviewedAt = supabase
    .from("expenses")
    .select("id,tour_id,category,created_by,accountant_reviewed_at")
    .eq("id", expenseId)
    .eq("tour_id", tourId)
    .maybeSingle();
  let expenseRow: any = null;
  let expenseSelectErr: any = null;
  ({ data: expenseRow, error: expenseSelectErr } = (await selectWithReviewedAt) as any);

  if (!expenseRow && expenseSelectErr && isMissingAccountantReviewedAtColumn(expenseSelectErr)) {
    const selectWithoutReviewedAt = await supabase
      .from("expenses")
      .select("id,tour_id,category,created_by")
      .eq("id", expenseId)
      .eq("tour_id", tourId)
      .maybeSingle();
    expenseRow = selectWithoutReviewedAt.data;
    expenseSelectErr = selectWithoutReviewedAt.error;
  }

  if (!expenseRow) return NextResponse.json({ error: "Расход не найден" }, { status: 404 });
  if (expenseRow.category !== "guide") return NextResponse.json({ error: "Можно удалять только расходы гида" }, { status: 403 });
  if (session.role !== "dispatcher" && actorId && expenseRow.created_by !== actorId) {
    return NextResponse.json({ error: "Можно удалять только свои расходы" }, { status: 403 });
  }
  if ("accountant_reviewed_at" in expenseRow && expenseRow.accountant_reviewed_at) {
    return NextResponse.json({ error: "Удаление запрещено: расход подтверждён бухгалтерией" }, { status: 403 });
  }

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "expense",
    entityId: expenseId,
    action: "delete",
    after: { tour_id: tourId, category: "guide" },
  });

  return NextResponse.json({ ok: true });
}
