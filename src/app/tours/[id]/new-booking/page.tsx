import { notFound, redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { getTourById, getManagerSalesPointStatus } from "@/lib/data";
import { NewBookingWorkModeWrapper } from "@/components/new-booking-work-mode-wrapper";
import { NewBookingFormSingle } from "@/components/new-booking-form-single";
import { requireAuth } from "@/lib/auth-session";
import { canCreateBooking, canAssignBookingManager, canManageHotelDirectory } from "@/lib/role-policy";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { canPrefillBookingForEdit, getBookingSalesPrefill } from "@/lib/booking-prefill";
import { resolveOfferFromTemplateRow } from "@/lib/template-tour-offer";
import { getLocale } from "next-intl/server";

export default async function NewBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromBooking?: string; editBooking?: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const editBookingId = typeof sp.editBooking === "string" ? sp.editBooking.trim() : "";
  const fromBookingId = typeof sp.fromBooking === "string" ? sp.fromBooking.trim() : "";

  if (!canCreateBooking(user.role)) redirect(`/tours/${id}`);

  const isManager = user.role === "manager";
  const managerPointStatus = isManager ? await getManagerSalesPointStatus(user.id) : null;
  const needsWorkModeGate = isManager && managerPointStatus ? !managerPointStatus.setToday : false;
  const allowManagerPicker = canAssignBookingManager(user.role);

  const tour = await getTourById(id);
  if (!tour) notFound();

  // Load pricing
  let templatePriceVnd = 0;
  let usdRate = 26000;
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: rateRows } = await supabase
        .from("currency_rates").select("rate")
        .eq("active", true).eq("base_currency", "USD").eq("quote_currency", "VND")
        .order("set_at", { ascending: false }).limit(1);
      if (rateRows?.[0] && Number((rateRows[0] as { rate?: unknown }).rate) > 0) {
        usdRate = Number((rateRows[0] as { rate?: unknown }).rate);
      }
      const { data: tourDb } = await supabase
        .from("tours").select("template_id,default_offer_vnd,default_offer_rate_to_vnd,default_offer_usd")
        .eq("id", id).maybeSingle();
      const tRow = tourDb as { template_id?: string | null; default_offer_vnd?: unknown; default_offer_rate_to_vnd?: unknown; default_offer_usd?: unknown } | null;
      if (tRow) {
        const offerVnd = Number(tRow.default_offer_vnd ?? 0);
        if (offerVnd > 0) {
          templatePriceVnd = Math.round(offerVnd);
        } else if (tRow.template_id) {
          const { data: tmpl } = await supabase
            .from("tour_templates").select("default_price_vnd,locations")
            .eq("id", tRow.template_id).maybeSingle();
          const resolved = resolveOfferFromTemplateRow(tmpl as { default_price_vnd?: unknown; locations?: unknown } | null, usdRate);
          if (resolved && (resolved.vnd ?? 0) > 0) templatePriceVnd = Math.round(resolved.vnd ?? 0);
          else if (resolved && (resolved.usd ?? 0) > 0) templatePriceVnd = Math.round((resolved.usd ?? 0) * usdRate);
        }
      }
    }
  } catch { /* ignore */ }

  // Prefill from existing booking
  let prefill: {
    customerName?: string; phone?: string; hotelName?: string; hotelAddress?: string; hotelMapsUrl?: string; room?: string;
    telegramUsername?: string; note?: string; adults?: number; children?: number;
    infants?: number; managerName?: string; managerId?: string; offerVnd?: number;
  } | null = null;
  const prefillSourceId = editBookingId || fromBookingId;
  if (prefillSourceId) {
    const row = await getBookingSalesPrefill(prefillSourceId);
    if (row && canPrefillBookingForEdit(user.role, user.id, row, Boolean(fromBookingId && !editBookingId))) {
      // Load current price per adult for edit mode
      let editOfferVnd: number | undefined;
      if (editBookingId) {
        try {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: priceRows } = await supabase
              .from("booking_prices")
              .select("amount_vnd")
              .eq("booking_id", editBookingId);
            const total = (priceRows as { amount_vnd: number }[] | null ?? []).reduce((s, p) => s + Number(p.amount_vnd || 0), 0);
            const pax = (row.adults || 1);
            if (total > 0 && pax > 0) editOfferVnd = Math.round(total / pax);
          }
        } catch { /* ignore */ }
      }
      prefill = {
        customerName: row.customerName,
        phone: row.phoneE164,
        hotelName: row.hotelName,
        hotelAddress: row.hotelAddress ?? undefined,
        hotelMapsUrl: row.hotelMapsUrl ?? undefined,
        room: row.room ?? undefined,
        telegramUsername: row.telegramUsername ?? undefined,
        note: row.note ?? undefined,
        adults: row.adults,
        children: row.children,
        infants: row.infants,
        managerName: row.managerName,
        managerId: row.managerId,
        offerVnd: editOfferVnd,
      };
    }
  }

  const managerPreset = !allowManagerPicker
    ? { id: user.id, fullName: user.fullName }
    : null;

  const availableSeats = Math.max(0, (tour.capacity || 0) - (tour.booked || 0))
    + (editBookingId && prefill ? Math.max(0, (prefill.adults ?? 0) + (prefill.children ?? 0)) : 0);

  return (
    <main className="app-wrap app-wrap--narrow">
      <TopNav user={user} />
      <section className="card mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
          {editBookingId ? "Редактирование брони" : "Новая бронь"}
        </p>
      </section>
      <NewBookingWorkModeWrapper
        needsGate={needsWorkModeGate}
        managerId={user.id}
        pointName={managerPointStatus?.pointName ?? null}
        hasPoint={Boolean(managerPointStatus?.pointId)}
      >
        <NewBookingFormSingle
          tourId={id}
          tourName={tour.name}
          tourDate={formatYmdWithWeekday(tour.date, locale)}
          availableSeats={availableSeats}
          templatePriceVnd={templatePriceVnd}
          managerPreset={managerPreset}
          allowManagerPicker={allowManagerPicker}
          canAddHotel={canManageHotelDirectory(user.role)}
          prefill={prefill}
          editBookingId={editBookingId || null}
          backHref={`/tours/${id}`}
        />
      </NewBookingWorkModeWrapper>
    </main>
  );
}
