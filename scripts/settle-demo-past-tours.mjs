/**
 * Demo cleanup: close past tours, materialize fallback prices, and mark past booking debt as paid.
 *
 * Dry-run:
 *   node scripts/settle-demo-past-tours.mjs
 *
 * Apply:
 *   node scripts/settle-demo-past-tours.mjs --apply
 *
 * Only tours before today are touched. Future tours are left intact.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes("--apply");
const todayYmd = new Date().toISOString().slice(0, 10);

function readEnv() {
  const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const eq = line.indexOf("=");
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

const env = readEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function money(value) {
  const n = Math.round(Number(value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function templateDefaultPriceVnd(tour) {
  const raw = Array.isArray(tour?.tour_templates) ? tour.tour_templates[0] : tour?.tour_templates;
  const direct = money(raw?.default_price_vnd);
  if (direct > 0) return direct;
  const locations = raw?.locations;
  if (locations && typeof locations === "object" && !Array.isArray(locations)) {
    const vnd = money(locations.vnd_price);
    if (vnd > 0) return vnd;
    const usd = Number(locations.usd_price ?? 0);
    const rate = money(locations.rate_to_vnd) || 26000;
    if (Number.isFinite(usd) && usd > 0) return Math.round(usd * rate);
  }
  return 0;
}

function usdPriceFromTourName(name) {
  const m = String(name ?? "").match(/(\d+(?:[.,]\d+)?)\s*\$/);
  if (!m) return 0;
  const usd = Number(m[1].replace(",", "."));
  return Number.isFinite(usd) && usd > 0 ? usd : 0;
}

function estimateBookingRevenueVnd(booking, tour) {
  const adults = Math.max(0, Math.round(Number(booking.adults ?? 0)));
  const children = Math.max(0, Math.round(Number(booking.children ?? 0)));
  const payingPax = Math.max(1, adults + children);
  const tourType = String(tour?.tour_type ?? "").toLowerCase();
  const tourOfferVnd = money(tour?.default_offer_vnd);
  const rate = money(tour?.default_offer_rate_to_vnd) || 26000;
  if (tourType === "private") {
    if (tourOfferVnd > 0) return tourOfferVnd;
    const usd = Number(tour?.default_offer_usd ?? 0);
    if (Number.isFinite(usd) && usd > 0) return Math.round(usd * rate);
  }
  const perPerson =
    tourOfferVnd ||
    (Number(tour?.default_offer_usd ?? 0) > 0 ? Math.round(Number(tour.default_offer_usd) * rate) : 0) ||
    templateDefaultPriceVnd(tour) ||
    Math.round(usdPriceFromTourName(tour?.name) * rate);
  return money(perPerson) * payingPax;
}

function paidFromPayments(rows) {
  let paid = 0;
  let refund = 0;
  for (const row of rows) {
    const amt = money(row.amount_vnd);
    if (row.kind === "refund") refund += amt;
    else if (row.kind === "topup") {
      const remitted = row.remitted_to_cash_at === undefined || (row.remitted_to_cash_at != null && String(row.remitted_to_cash_at).trim() !== "");
      if (remitted) paid += amt;
    } else {
      paid += amt;
    }
  }
  return paid - refund;
}

async function insertWithRemitFallback(table, row) {
  let res = await supabase.from(table).insert([row]);
  if (res.error && /remitted_to_cash_at|remitted_to_cash_by|column|does not exist/i.test(String(res.error.message))) {
    const legacy = { ...row };
    delete legacy.remitted_to_cash_at;
    delete legacy.remitted_to_cash_by;
    res = await supabase.from(table).insert([legacy]);
  }
  if (res.error) throw new Error(res.error.message);
}

async function main() {
  const director = await supabase.from("users").select("id").eq("role", "director").eq("is_active", true).order("created_at").limit(1);
  const actorId = director.data?.[0]?.id ?? null;

  const toursRes = await supabase
    .from("tours")
    .select("id,name,start_at,status,tour_type,default_offer_usd,default_offer_rate_to_vnd,default_offer_vnd,tour_templates(default_price_vnd,locations)")
    .lt("start_at", `${todayYmd}T00:00:00.000Z`)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .limit(5000);
  if (toursRes.error) throw new Error(toursRes.error.message);

  const tours = toursRes.data ?? [];
  const tourIds = tours.map((t) => t.id);
  const tourById = new Map(tours.map((t) => [t.id, t]));
  const bookingsRes = tourIds.length
    ? await supabase
        .from("bookings")
        .select("id,tour_id,customer_name,adults,children,infants,deleted_at")
        .in("tour_id", tourIds)
        .is("deleted_at", null)
        .limit(10000)
    : { data: [], error: null };
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const bookings = bookingsRes.data ?? [];
  const bookingIds = bookings.map((b) => b.id);
  const pricesRes = bookingIds.length
    ? await supabase.from("booking_prices").select("booking_id,amount_vnd").in("booking_id", bookingIds).limit(20000)
    : { data: [], error: null };
  if (pricesRes.error) throw new Error(pricesRes.error.message);

  let payRes = bookingIds.length
    ? await supabase.from("payments").select("booking_id,amount_vnd,kind,remitted_to_cash_at").in("booking_id", bookingIds).limit(20000)
    : { data: [], error: null };
  if (payRes.error && /remitted_to_cash_at|column|does not exist/i.test(String(payRes.error.message))) {
    payRes = await supabase.from("payments").select("booking_id,amount_vnd,kind").in("booking_id", bookingIds).limit(20000);
  }
  if (payRes.error) throw new Error(payRes.error.message);

  const priceByBooking = new Map();
  for (const p of pricesRes.data ?? []) {
    priceByBooking.set(p.booking_id, (priceByBooking.get(p.booking_id) ?? 0) + money(p.amount_vnd));
  }
  const paymentsByBooking = new Map();
  for (const p of payRes.data ?? []) {
    const list = paymentsByBooking.get(p.booking_id) ?? [];
    list.push(p);
    paymentsByBooking.set(p.booking_id, list);
  }

  const actions = {
    pastTours: tours.length,
    toursToComplete: tours.filter((t) => t.status !== "completed").length,
    bookings: bookings.length,
    pricesToMaterialize: 0,
    paymentsToInsert: 0,
    amountToAcceptVnd: 0,
  };

  const materialize = [];
  const payments = [];
  for (const booking of bookings) {
    const tour = tourById.get(booking.tour_id);
    const exact = priceByBooking.get(booking.id) ?? 0;
    const estimated = exact > 0 ? 0 : estimateBookingRevenueVnd(booking, tour);
    const total = exact > 0 ? exact : estimated;
    if (exact <= 0 && estimated > 0) {
      actions.pricesToMaterialize += 1;
      materialize.push({
        booking_id: booking.id,
        person_label: "Демо: стоимость тура",
        amount: estimated,
        currency: "VND",
        rate_to_vnd: 1,
        amount_vnd: estimated,
      });
    }
    const paid = paidFromPayments(paymentsByBooking.get(booking.id) ?? []);
    const due = Math.max(0, total - paid);
    if (due > 0) {
      const paymentDate = new Date(tour?.start_at || new Date());
      paymentDate.setUTCHours(12, 0, 0, 0);
      const paymentIso = paymentDate.toISOString();
      actions.paymentsToInsert += 1;
      actions.amountToAcceptVnd += due;
      payments.push({
        booking_id: booking.id,
        amount: due,
        currency: "VND",
        rate_to_vnd: 1,
        amount_vnd: due,
        kind: "office_cash",
        actor_id: actorId,
        created_at: paymentIso,
        remitted_to_cash_at: paymentIso,
        remitted_to_cash_by: actorId,
      });
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", todayYmd, ...actions }, null, 2));
  if (!apply) return;

  if (materialize.length > 0) {
    const res = await supabase.from("booking_prices").insert(materialize);
    if (res.error) throw new Error(res.error.message);
  }
  for (const row of payments) {
    await insertWithRemitFallback("payments", row);
  }
  const toComplete = tours.filter((t) => t.status !== "completed").map((t) => t.id);
  if (toComplete.length > 0) {
    const res = await supabase.from("tours").update({ status: "completed" }).in("id", toComplete);
    if (res.error) throw new Error(res.error.message);
  }
  console.log("Applied demo settlement successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
