import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNavSecondaryLink } from "@/components/app-nav-secondary";
import { TopNav } from "@/components/top-nav";
import { DashboardTourFilters } from "@/components/dashboard-tour-filters";
import { TourCard } from "@/components/tour-card";
import { requireAuth } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listTours } from "@/lib/data";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";

type BookingSourceRow = {
  id: string;
  tour_id: string;
  manager_id: string;
  customer_name: string | null;
  phone_e164: string | null;
  hotel_name: string | null;
  room: string | null;
};

type BookingDuplicateLookupRow = {
  tour_id: string;
  customer_name: string | null;
  phone_e164: string | null;
};

export default async function DuplicateBookingTourPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[]; tour?: string | string[] }>;
}) {
  const user = await requireAuth();
  const { id: bookingId } = await params;
  const sp = await searchParams;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    redirect("/dashboard");
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,customer_name,phone_e164,hotel_name,room")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !booking) {
    notFound();
  }

  const bookingRow = booking as unknown as BookingSourceRow;
  const managerId = String(bookingRow.manager_id);
  const canAccess =
    user.role === "director" ||
    user.role === "chief_manager" ||
    user.role === "manager";

  if (!canAccess) {
    redirect("/dashboard");
  }

  const tourId = String(bookingRow.tour_id);
  const sourcePhone = String(bookingRow.phone_e164 || "").trim();
  const today = tourBusinessTodayYmd();
  const allTours = await listTours();
  const futureTours = allTours.filter((t) => t.date >= today && t.status !== "deleted");

  const customerName = String(bookingRow.customer_name || "").trim() || "Турист";
  const hotel = String(bookingRow.hotel_name || "").trim();
  const room = String(bookingRow.room || "").trim();
  const customerNameKey = customerName.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();

  const futureTourIds = futureTours.map((t) => t.id);
  const duplicateTourIds = new Set<string>();
  if (futureTourIds.length > 0) {
    const { data: rows } = await supabase
      .from("bookings")
      .select("tour_id,customer_name,phone_e164")
      .in("tour_id", futureTourIds)
      .is("deleted_at", null)
      .limit(1200);
    for (const r of ((rows as unknown as BookingDuplicateLookupRow[] | null) ?? [])) {
      const samePhone = sourcePhone.length > 0 && String(r.phone_e164 || "") === sourcePhone;
      const sameName = String(r.customer_name || "").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim() === customerNameKey;
      if (samePhone || sameName) duplicateTourIds.add(String(r.tour_id));
    }
  }

  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() || "";
  const tourExact = (Array.isArray(sp.tour) ? sp.tour[0] : sp.tour)?.trim() || "";

  const upcomingTours = futureTours
    .filter((t) => t.status !== "deleted" && t.status !== "completed")
    .map((t) => ({
      id: t.id,
      name: t.name,
      dateLabel: formatYmdWithWeekdayRu(t.date),
      booked: t.booked,
      capacity: t.capacity,
    }))
    .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));

  const filteredTours = futureTours.filter((t) => {
    if (tourExact) return t.name.toLowerCase() === tourExact.toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q.toLowerCase());
  }).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      
      <section className="card mb-3 !rounded-2xl border-l-[4px] border-l-[var(--accent)]/80">
        <h1 className="page-title text-[17px] sm:text-[18px] mb-1">Запись на другой тур</h1>
        <p className="page-sub text-[13px] sm:text-sm">
          Запись туриста: <strong className="text-[var(--text)] font-semibold">{customerName}</strong> 
          {hotel ? ` (Отель ${hotel}` : ""}
          {hotel && room ? `, номер ${room})` : hotel ? ")" : ""} на ещё один тур.
        </p>
        <p className="mt-2 text-[12px] leading-snug text-[var(--muted2)]">
          Выберите тур из списка ниже. Контакты туриста будут автоматически подставлены, а новая бронь будет закреплена за исходным менеджером, который делал первую запись.
        </p>
      </section>

      <section className="mb-3">
        <DashboardTourFilters
          upcomingTours={upcomingTours}
          q={q}
          tourExact={tourExact}
          preserved={{ view: "all" }}
          title="Поиск тура"
          hint={null}
          onTourSelectHrefPattern={`/tours/[id]/new-booking?fromBooking=${encodeURIComponent(bookingId)}`}
        />
      </section>

      <section className="flex flex-col gap-3">
        {filteredTours.length === 0 ? (
          <div className="card text-sm text-[var(--muted)]">Свободных туров по вашему запросу не найдено.</div>
        ) : (
          filteredTours.map((t) => {
            const isDuplicate = duplicateTourIds.has(t.id);
            if (isDuplicate) {
              return (
                <div key={t.id} className="relative opacity-60 grayscale-[0.3]">
                  <TourCard tour={t} viewerRole={user.role} />
                  <div className="absolute inset-0 z-[10] flex flex-col items-center justify-center rounded-[inherit] bg-[var(--surface)]/70 backdrop-blur-[1px]">
                    <span className="rounded-lg bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text)] ring-1 ring-[var(--border)] shadow-sm">
                      Уже записан на этот выезд
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <TourCard 
                key={t.id} 
                tour={t} 
                viewerRole={user.role} 
                bookingIntentHref={`/tours/${t.id}/new-booking?fromBooking=${encodeURIComponent(bookingId)}`} 
              />
            );
          })
        )}
      </section>

      <div className="mt-6">
        <AppNavSecondaryLink href={`/tours/${tourId}`}>Вернуться к текущему туру</AppNavSecondaryLink>
      </div>
    </main>
  );
}
