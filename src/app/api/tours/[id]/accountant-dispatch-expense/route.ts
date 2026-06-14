import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseExpenseImageDataUrl } from "@/lib/expense-attachment";
import { isMissingPendingAccountantReviewColumn } from "@/lib/expense-pending-fallback";
import { ACCT_BOOKING_PREFIX } from "@/lib/tour-expense-partition";

const bodySchema = z.object({
  kind: z.enum(["bus", "booking"]),
  amountVnd: z.number().int().min(1),
  description: z.string().min(1).max(500),
  attachmentDataUrl: z.string().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "accountant") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const actorId = actorUuidOrNull(session.id);
  const { kind, amountVnd, description, attachmentDataUrl } = parsed.data;
  const attachmentUrl = attachmentDataUrl ? parseExpenseImageDataUrl(attachmentDataUrl) : null;
  if (attachmentDataUrl && !attachmentUrl) {
    return NextResponse.json(
      { error: "Некорректное фото: нужен JPEG, PNG или WebP до ~2 МБ." },
      { status: 400 },
    );
  }

  const category = kind === "bus" ? "bus" : "other";
  const fullDescription =
    kind === "booking" ? `${ACCT_BOOKING_PREFIX} ${description.trim()}` : `Бухгалтер · водитель: ${description.trim()}`;

  const rowFull = {
    tour_id: tourId,
    category,
    amount_vnd: amountVnd,
    description: fullDescription,
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
          description: fullDescription,
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
    after: { tour_id: tourId, category, amount_vnd: amountVnd, accountant_dispatch: true },
  });

  return NextResponse.json({ ok: true, id: (row as { id: string }).id });
}
