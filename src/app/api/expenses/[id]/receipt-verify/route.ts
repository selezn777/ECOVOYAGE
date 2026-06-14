import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canConfirmExpenseAccountantReview } from "@/lib/role-policy";
import { tourCalendarDateFromStartAtIso } from "@/lib/scheduling";
import { runReceiptVerificationForExpense } from "@/lib/run-receipt-verification";
import type { ReceiptVerifyPayload } from "@/lib/receipt-verify-types";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canConfirmExpenseAccountantReview(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: expenseId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: exp, error: eErr } = await supabase
    .from("expenses")
    .select("id,description,amount_vnd,attachment_url,tour_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (eErr || !exp) return NextResponse.json({ error: "Расход не найден" }, { status: 404 });

  const row = exp as {
    description: string | null;
    amount_vnd: number | string;
    attachment_url: string | null;
    tour_id: string;
  };

  const { data: tour, error: tErr } = await supabase
    .from("tours")
    .select("start_at")
    .eq("id", row.tour_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (tErr || !tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const tourDateYmd = tourCalendarDateFromStartAtIso(String((tour as { start_at: string }).start_at));
  if (!tourDateYmd) {
    return NextResponse.json({ error: "Не удалось определить дату тура" }, { status: 500 });
  }

  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("adults,children,infants")
    .eq("tour_id", row.tour_id)
    .is("deleted_at", null);

  let expectedPax = 0;
  for (const b of (bookingRows as { adults: number; children: number; infants: number }[] | null) || []) {
    expectedPax += Number(b.adults || 0) + Number(b.children || 0) + Number(b.infants || 0);
  }

  const amountVnd = Math.round(Number(row.amount_vnd) || 0);
  const description = String(row.description ?? "");
  const attachmentUrl = row.attachment_url?.trim() || null;

  const payload: ReceiptVerifyPayload = await runReceiptVerificationForExpense({
    description,
    amountVnd,
    tourDateYmd,
    expectedPax,
    attachmentUrl,
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
