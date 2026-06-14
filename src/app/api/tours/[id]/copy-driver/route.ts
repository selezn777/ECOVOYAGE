import { NextResponse } from "next/server";
import { listBookingsForTour, getTourById, isUserAssignedGuideOnTour } from "@/lib/data";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/auth-session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await params;
  const tour = await getTourById(id);
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  if (session.role === "guide" || session.role === "chief_guide") {
    const onTour = await isUserAssignedGuideOnTour(id, session.id);
    if (!onTour) {
      return NextResponse.json(
        { error: "Список для водителя доступен только на назначенных вам турах" },
        { status: 403 },
      );
    }
  }

  const rows = await listBookingsForTour(id);
  const header = `${tour.name} | ${formatYmdWithWeekdayRu(tour.date)}\nСбор: ${tour.pickupWindow}`;
  const lines = rows.map((b, idx) => {
    const map = b.mapsUrl?.trim() ? b.mapsUrl.trim() : "-";
    return `${idx + 1}. ${b.hotel}\n${map}`;
  });

  return NextResponse.json({
    text: `${header}\n\n${lines.join("\n\n")}`,
  });
}

