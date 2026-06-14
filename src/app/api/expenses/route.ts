import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { parseExpenseImageDataUrl } from "@/lib/expense-attachment";
import { isMissingPendingAccountantReviewColumn } from "@/lib/expense-pending-fallback";

const bodySchema = z.object({
  tourId: z.string().uuid(),
  category: z.enum(["guide", "bus", "salary", "other"]),
  amountVnd: z.number().int().min(0),
  description: z.string().min(1).max(500),
  attachmentDataUrl: z.string().optional(),
});

const DUPLICATE_EXPENSE_WINDOW_MS = 45_000;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "director" && session.role !== "chief_manager") {
    return apiDenied();
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tourId, category, amountVnd, description, attachmentDataUrl } = parsed.data;
  const attachmentUrl = attachmentDataUrl ? parseExpenseImageDataUrl(attachmentDataUrl) : null;
  if (attachmentDataUrl && !attachmentUrl) {
    return NextResponse.json(
      { error: "Некорректное фото: нужен JPEG, PNG или WebP до ~2 МБ." },
      { status: 400 },
    );
  }

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const actorId = actorUuidOrNull(session.id);
  const duplicateSinceIso = new Date(Date.now() - DUPLICATE_EXPENSE_WINDOW_MS).toISOString();
  const duplicateLookup = await supabase
    .from("expenses")
    .select("id")
    .eq("tour_id", tourId)
    .eq("category", category)
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
    category,
    amount_vnd: amountVnd,
    description,
    created_by: actorId,
    attachment_url: attachmentUrl,
    pending_accountant_review: false,
  };

  let { data: row, error } = await supabase.from("expenses").insert([rowFull]).select("id").single();

  if (error && isMissingPendingAccountantReviewColumn(error)) {
    const retry = await supabase
      .from("expenses")
      .insert([
        {
          tour_id: tourId,
          category,
          amount_vnd: amountVnd,
          description,
          created_by: actorId,
          attachment_url: attachmentUrl,
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
    after: { tour_id: tourId, category, amount_vnd: amountVnd },
  });

  return NextResponse.json({ ok: true });
}
