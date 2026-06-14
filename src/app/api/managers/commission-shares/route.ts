import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { apiDenied } from "@/lib/api-denied";

const ALLOWED_ROLES = ["manager", "chief_manager", "director"];

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  // Шары отданные: я creator и booking_id → booking → tour
  const [givenRes, receivedRes] = await Promise.all([
    supabase
      .from("booking_commission_shares")
      .select("id,booking_id,beneficiary_id,percent,created_at,bookings(customer_name,online_code,tour_id,manager_id,tours(name,start_at))")
      .eq("created_by", session.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("booking_commission_shares")
      .select("id,booking_id,beneficiary_id,percent,created_at,created_by,bookings(customer_name,online_code,tour_id,manager_id,tours(name,start_at))")
      .eq("beneficiary_id", session.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  type RawShare = {
    id: string;
    booking_id: string;
    beneficiary_id?: string;
    percent: number | string;
    created_at: string;
    created_by?: string;
    bookings: {
      customer_name?: string;
      online_code?: string | null;
      tour_id?: string;
      manager_id?: string;
      tours?: { name?: string; start_at?: string } | null;
    } | null;
  };

  // Resolve user names
  const userIds = new Set<string>();
  for (const r of [...(givenRes.data ?? []), ...(receivedRes.data ?? [])] as RawShare[]) {
    if (r.beneficiary_id) userIds.add(r.beneficiary_id);
    if (r.created_by) userIds.add(r.created_by);
    if (r.bookings?.manager_id) userIds.add(r.bookings.manager_id);
  }
  const nameById = new Map<string, string>();
  const commissionPctById = new Map<string, number>();
  if (userIds.size > 0) {
    const { data: uRows } = await supabase
      .from("users").select("id,full_name,manager_sales_commission_percent").in("id", [...userIds]);
    for (const u of (uRows as { id: string; full_name: string; manager_sales_commission_percent?: number | string | null }[] | null) ?? []) {
      nameById.set(u.id, u.full_name?.trim() || "сотрудник");
      const pct = Number(u.manager_sales_commission_percent ?? 12);
      commissionPctById.set(u.id, Number.isFinite(pct) && pct > 0 ? pct : 12);
    }
  }

  // Подгружаем суммы по брони из booking_prices
  const allBookingIds = [...new Set([
    ...(givenRes.data ?? []).map((r) => (r as RawShare).booking_id),
    ...(receivedRes.data ?? []).map((r) => (r as RawShare).booking_id),
  ])];
  const priceByBooking = new Map<string, number>();
  if (allBookingIds.length) {
    const { data: priceRows } = await supabase
      .from("booking_prices")
      .select("booking_id,amount_vnd")
      .in("booking_id", allBookingIds);
    for (const p of (priceRows as { booking_id: string; amount_vnd: number }[]) ?? []) {
      priceByBooking.set(p.booking_id, (priceByBooking.get(p.booking_id) || 0) + Number(p.amount_vnd || 0));
    }
  }

  function mapShare(r: RawShare, mode: "given" | "received") {
    const bk = r.bookings;
    const tour = (bk?.tours && !Array.isArray(bk.tours)) ? bk.tours : null;
    const tourDate = tour?.start_at ? tour.start_at.slice(0, 10) : null;
    const pct = Math.round(Number(r.percent) * 100) / 100;
    const bookingTotalVnd = priceByBooking.get(r.booking_id) ?? 0;
    // Сумма = % от комиссии гивера (не от всей брони)
    const giverCommissionPct = commissionPctById.get(r.created_by ?? "") ?? 12;
    const giverCommissionVnd = Math.round((bookingTotalVnd * giverCommissionPct) / 100);
    const shareAmountVnd = Math.round((giverCommissionVnd * pct) / 100);
    // giverCommissionPct передаём чтобы UI мог показать: 50% от 120.000₫ = 60.000₫
    return {
      id: r.id,
      bookingId: r.booking_id,
      customerName: bk?.customer_name?.trim() || "турист",
      onlineCode: bk?.online_code?.trim() || null,
      tourName: tour?.name?.trim() || null,
      tourDate,
      percent: pct,
      bookingTotalVnd,
      giverCommissionVnd,
      giverCommissionPct,
      shareAmountVnd,
      createdAt: r.created_at,
      ...(mode === "given"
        ? { beneficiaryId: r.beneficiary_id ?? null, beneficiaryName: r.beneficiary_id ? (nameById.get(r.beneficiary_id) ?? "сотрудник") : null }
        : { giverId: r.created_by ?? null, giverName: r.created_by ? (nameById.get(r.created_by) ?? "сотрудник") : (r.bookings?.manager_id ? (nameById.get(r.bookings.manager_id) ?? "менеджер") : "менеджер") }),
    };
  }

  const given = (givenRes.data as RawShare[] | null)?.map((r) => mapShare(r, "given")) ?? [];
  const received = (receivedRes.data as RawShare[] | null)?.map((r) => mapShare(r, "received")) ?? [];

  return NextResponse.json({ given, received });
}
