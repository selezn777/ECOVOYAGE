import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregatePaymentsEx,
  emptyPayAggEx,
  paidOfficialFromAgg,
  topupRemittedToCash,
  type PaymentRowAgg,
} from "@/lib/data";

function aggForBooking(bookingId: string, rows: PaymentRowAgg[]) {
  const withBid = rows.map((r) => ({ ...r, booking_id: bookingId }));
  return aggregatePaymentsEx(withBid).get(bookingId) || emptyPayAggEx();
}

/**
 * Максимум, что можно зачесть одной сдачей по брони: долг в кассе + доплаты гида, ещё не отмеченные как сданные.
 */
export function maxHandoverVndForBooking(params: {
  totalVnd: number;
  agg: ReturnType<typeof emptyPayAggEx>;
}): number {
  const paidOfficial = paidOfficialFromAgg(params.agg);
  const due = Math.max(0, params.totalVnd - paidOfficial);
  return due + params.agg.topupPending;
}

/**
 * Зачисляет сдачу в кассу по брони: FIFO по pending topup гида.
 * Можно сдать **часть** суммы строки (менеджер - предоплата в кассу, гид - остаток позже): строка делится на «сдано» и «ещё у гида».
 * Затем при необходимости создаётся новый topup с remitted (остаток долга в кассе без pending у гида).
 */
export async function allocateHandoverAmountToBooking(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    tourId: string;
    amountVnd: number;
    actorId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { bookingId, tourId, amountVnd, actorId } = params;
  if (amountVnd <= 0) return { ok: false, error: "Сумма должна быть больше нуля." };

  const { data: bk, error: bkErr } = await supabase
    .from("bookings")
    .select("id,tour_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bkErr) return { ok: false, error: bkErr.message };
  if (!bk || String((bk as { tour_id: string }).tour_id) !== tourId) {
    return { ok: false, error: "Бронь не найдена или не относится к этому туру." };
  }

  const { data: priceRows } = await supabase.from("booking_prices").select("amount_vnd").eq("booking_id", bookingId);
  const totalVnd = (priceRows || []).reduce((s, p) => s + Number((p as { amount_vnd: number }).amount_vnd || 0), 0);

  let payRows: PaymentRowAgg[] = [];
  const payFull = await supabase
    .from("payments")
    .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
    const leg = await supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    payRows = ((leg.data || []) as PaymentRowAgg[]).map((r) => ({
      ...r,
      booking_id: bookingId,
      amount_vnd: Number((r as { amount_vnd: number }).amount_vnd),
      kind: String((r as { kind: string }).kind),
      remitted_to_cash_at: undefined,
    }));
  } else if (!payFull.error && payFull.data) {
    payRows = (payFull.data as PaymentRowAgg[]).map((r) => ({
      ...r,
      booking_id: bookingId,
      amount_vnd: Number(r.amount_vnd),
      kind: String(r.kind),
    }));
  } else if (payFull.error) {
    return { ok: false, error: payFull.error.message };
  }

  const agg = aggForBooking(bookingId, payRows);
  const cap = maxHandoverVndForBooking({ totalVnd, agg });
  if (amountVnd > cap) {
    return {
      ok: false,
      error: `По этой брони можно сдать не больше ${cap.toLocaleString("ru-RU")} ₫ (долг в кассе и не сданные доплаты гида).`,
    };
  }

  const nowIso = new Date().toISOString();
  let remaining = amountVnd;

  const pendingTopups = payRows
    .filter((p) => p.kind === "topup" && !topupRemittedToCash(p))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  async function insertRemittedTopup(vnd: number): Promise<{ ok: true } | { ok: false; error: string }> {
    const insertRow: Record<string, unknown> = {
      booking_id: bookingId,
      amount: vnd,
      currency: "VND",
      rate_to_vnd: 1,
      amount_vnd: vnd,
      kind: "topup",
      actor_id: actorId,
      remitted_to_cash_at: nowIso,
      remitted_to_cash_by: actorId,
    };
    let { error: insErr } = await supabase.from("payments").insert([insertRow]);
    if (insErr && /remitted_to_cash_at|column|does not exist/i.test(String(insErr.message))) {
      const legacy: Record<string, unknown> = { ...insertRow };
      delete legacy.remitted_to_cash_at;
      delete legacy.remitted_to_cash_by;
      ({ error: insErr } = await supabase.from("payments").insert([legacy]));
    }
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true };
  }

  for (const p of pendingTopups) {
    if (remaining <= 0) break;
    const amt = Math.round(Number(p.amount_vnd || 0));
    if (amt <= 0) continue;
    if (!p.id) continue;

    if (remaining >= amt) {
      const patch: Record<string, unknown> = { remitted_to_cash_at: nowIso, remitted_to_cash_by: actorId };
      const { error: upErr } = await supabase.from("payments").update(patch).eq("id", p.id);
      if (upErr && /remitted_to_cash_at|column|does not exist/i.test(String(upErr.message))) {
        return {
          ok: false,
          error: "Выполните миграцию БД: поля remitted_to_cash_at / remitted_to_cash_by в payments.",
        };
      }
      if (upErr) return { ok: false, error: upErr.message };
      remaining -= amt;
      continue;
    }

    const remittedNow = remaining;
    const stillPending = amt - remittedNow;
    if (stillPending <= 0) continue;

    const { error: shrinkErr } = await supabase
      .from("payments")
      .update({ amount_vnd: stillPending, amount: stillPending })
      .eq("id", p.id);
    if (shrinkErr) return { ok: false, error: shrinkErr.message };

    const ins = await insertRemittedTopup(remittedNow);
    if (!ins.ok) return ins;
    remaining = 0;
    break;
  }

  if (remaining > 0) {
    const ins = await insertRemittedTopup(remaining);
    if (!ins.ok) return ins;
  }

  return { ok: true };
}

export async function getBookingHandoverCapVnd(
  supabase: SupabaseClient,
  params: { bookingId: string; tourId: string },
): Promise<{ ok: true; capVnd: number } | { ok: false; error: string }> {
  const { bookingId, tourId } = params;
  const { data: bk, error: bkErr } = await supabase
    .from("bookings")
    .select("id,tour_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bkErr) return { ok: false, error: bkErr.message };
  if (!bk || String((bk as { tour_id: string }).tour_id) !== tourId) {
    return { ok: false, error: "Бронь не найдена или не относится к этому туру." };
  }
  const { data: priceRows } = await supabase.from("booking_prices").select("amount_vnd").eq("booking_id", bookingId);
  const totalVnd = (priceRows || []).reduce((s, p) => s + Number((p as { amount_vnd: number }).amount_vnd || 0), 0);

  let payRows: PaymentRowAgg[] = [];
  const payFull = await supabase
    .from("payments")
    .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
    const leg = await supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    payRows = ((leg.data || []) as PaymentRowAgg[]).map((r) => ({
      ...r,
      booking_id: bookingId,
      amount_vnd: Number((r as { amount_vnd: number }).amount_vnd),
      kind: String((r as { kind: string }).kind),
      remitted_to_cash_at: undefined,
    }));
  } else if (!payFull.error && payFull.data) {
    payRows = (payFull.data as PaymentRowAgg[]).map((r) => ({
      ...r,
      booking_id: bookingId,
      amount_vnd: Number(r.amount_vnd),
      kind: String(r.kind),
    }));
  } else if (payFull.error) {
    return { ok: false, error: payFull.error.message };
  }

  const agg = aggForBooking(bookingId, payRows);
  const capVnd = maxHandoverVndForBooking({ totalVnd, agg });
  return { ok: true, capVnd: Math.max(0, capVnd) };
}
