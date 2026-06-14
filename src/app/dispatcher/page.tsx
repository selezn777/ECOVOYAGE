import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { DispatcherWorkdayPanel } from "@/components/dispatcher-workday-panel";
import { listTours, listExpensesForTour } from "@/lib/data";
import { requireAuth } from "@/lib/auth-session";
import { tourBusinessTodayYmd } from "@/lib/scheduling";
import type { TourExpense } from "@/lib/types";

export const dynamic = "force-dynamic";

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function DispatcherPage() {
  const user = await requireAuth();
  if (user.role !== "dispatcher" && user.role !== "booking_dispatcher") {
    redirect("/dashboard");
  }

  const today = tourBusinessTodayYmd();
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  const allTours = await listTours();
  const relevantDates = new Set([today, tomorrow, dayAfter]);
  const tours = allTours.filter((t) => relevantDates.has(t.date));

  const expensesByTour: Record<string, TourExpense[]> = Object.fromEntries(
    await Promise.all(tours.map(async (t) => [t.id, await listExpensesForTour(t.id)])),
  );

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <DispatcherWorkdayPanel
        tours={tours}
        expensesByTour={expensesByTour}
        todayYmd={today}
        tomorrowYmd={tomorrow}
        dayAfterYmd={dayAfter}
      />
    </main>
  );
}
