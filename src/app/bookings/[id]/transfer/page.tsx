import { notFound, redirect } from "next/navigation";
import { AppNavSecondaryLink } from "@/components/app-nav-secondary";
import { TopNav } from "@/components/top-nav";
import { TransferBookingForm } from "@/components/transfer-booking-form";
import { requireAuth } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { listTours } from "@/lib/data";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";

export default async function TransferBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id: bookingId } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    redirect("/dashboard");
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,customer_name")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !booking) {
    notFound();
  }

  const managerId = String((booking as { manager_id: string }).manager_id);
  const canAccess =
    user.role === "director" ||
    user.role === "chief_manager" ||
    user.role === "dispatcher" ||
    (user.role === "manager" && user.id === managerId);

  if (!canAccess) {
    redirect("/dashboard");
  }

  const tourId = String((booking as { tour_id: string }).tour_id);
  const today = tourBusinessTodayYmd();
  const allTours = await listTours();
  const futureTours = allTours.filter(
    (t) => t.date >= today && t.status !== "deleted" && t.id !== tourId,
  );
  const options = futureTours.map((t) => ({
    id: t.id,
    name: t.name,
    dateLabel: formatYmdWithWeekdayRu(t.date),
    booked: t.booked,
    capacity: t.capacity,
  }));

  const customerName = String((booking as { customer_name: string }).customer_name || "").trim() || "Бронь";

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <section className="card mb-3">
        <p className="section-label mb-1">Перенос</p>
        <h1 className="page-title">Перенос на другой тур</h1>
        <p className="page-sub">
          {customerName} · бронь остаётся с тем же номером ON и менеджером; меняется только выезд.
        </p>
      </section>
      {options.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Нет подходящих будущих туров для переноса.</p>
      ) : (
        <TransferBookingForm bookingId={bookingId} currentTourId={tourId} tours={options} />
      )}
      <p className="mt-4">
        <AppNavSecondaryLink href={`/tours/${tourId}`}>К туру</AppNavSecondaryLink>
      </p>
    </main>
  );
}
