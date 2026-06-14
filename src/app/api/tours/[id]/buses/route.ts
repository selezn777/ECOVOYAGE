import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { isMissingPendingAccountantReviewColumn } from "@/lib/expense-pending-fallback";
import { BUS_ROLES, canConfirmExpenseAccountantReview } from "@/lib/role-policy";
import { localDateString } from "@/lib/scheduling";

const bodySchema = z.object({
  busNumber: z.string().min(1),
  seats: z.number().int().min(0).optional().nullable(),
  comment: z.string().optional().nullable(),
  langNoteEn: z.string().optional().nullable(),
  langNoteVn: z.string().optional().nullable(),
  driverPaidVnd: z.number().int().min(0).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!BUS_ROLES.includes(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { id: tourId } = await params;
  const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
  const tourDate = tourRow?.start_at ? new Date(tourRow.start_at).toISOString().slice(0, 10) : null;
  const canAssignBusOnPastTour = session.role === "director" || session.role === "dispatcher";
  if (tourDate && tourDate < localDateString() && !canAssignBusOnPastTour) {
    return apiDenied();
  }
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);

  const { error } = await supabase.from("bus_assignments").insert([
    {
      tour_id: tourId,
      bus_number: parsed.data.busNumber,
      seats: parsed.data.seats ?? null,
      comment: parsed.data.comment ?? null,
      lang_note_en: parsed.data.langNoteEn ?? null,
      lang_note_vn: parsed.data.langNoteVn ?? null,
      assigned_by: actorId,
    },
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Dispatcher enters what he paid the driver; it must appear in accountant expenses.
  if (parsed.data.driverPaidVnd != null) {
    const expDescription = `Оплата водителю автобуса ${parsed.data.busNumber}`;
    const needsReview = !canConfirmExpenseAccountantReview(session.role);
    const rowExp = {
      tour_id: tourId,
      category: "bus" as const,
      amount_vnd: parsed.data.driverPaidVnd,
      description: expDescription,
      created_by: actorId,
      pending_accountant_review: needsReview,
    };
    let { error: expErr } = await supabase.from("expenses").insert([rowExp]);
    if (expErr && isMissingPendingAccountantReviewColumn(expErr)) {
      const { error: e2 } = await supabase
        .from("expenses")
        .insert([
          {
            tour_id: tourId,
            category: "bus" as const,
            amount_vnd: parsed.data.driverPaidVnd,
            description: expDescription,
            created_by: actorId,
          },
        ]);
      expErr = e2;
    }
    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "bus_assignment",
    entityId: tourId,
    action: "create",
    after: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
