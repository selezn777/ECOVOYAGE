import { NextResponse } from "next/server";
import { listBookingsForTour, getTourById, isUserAssignedGuideOnTour } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/auth-session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await params;
  const tour = await getTourById(id);
  if (!tour) {
    return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  }

  if (session.role === "guide" || session.role === "chief_guide") {
    const onTour = await isUserAssignedGuideOnTour(id, session.id);
    if (!onTour) {
      return NextResponse.json(
        { error: "Копирование списка с контактами доступно только на назначенных вам турах" },
        { status: 403 },
      );
    }
  }

  const rows = await listBookingsForTour(id);
  const busBlock = (() => {
    const list = tour.buses ?? [];
    if (!list.length) return "";
    const parts = list.map((b, idx) => {
      const lines: string[] = [];
      lines.push(`Автобус ${idx + 1}: № ${b.busNumber}${b.seats != null ? `, ${b.seats} мест` : ""}`);
      if (b.comment?.trim()) lines.push(`Водитель / контакты: ${b.comment.trim()}`);
      if (b.langNoteEn?.trim()) lines.push(`EN: ${b.langNoteEn.trim()}`);
      if (b.langNoteVn?.trim()) lines.push(`VN: ${b.langNoteVn.trim()}`);
      if (b.assignedByName) lines.push(`Запись внес: ${b.assignedByName}`);
      return lines.join("\n");
    });
    return `\n\n--- Автобус и водитель (диспетчер) ---\n${parts.join("\n\n")}`;
  })();
  const header = `${tour.name} | ${formatYmdWithWeekdayRu(tour.date)}${busBlock}`;
  const lines = rows.map((b, idx) => {
    const duePart = b.dueVnd > 0 ? ` | доплата ${formatVnd(b.dueVnd)}` : "";
    const tg = b.telegramUsername?.trim() ? ` | TG @${b.telegramUsername.trim()}` : "";
    return `${idx + 1}. ${b.hotel} | ${b.room || ""} | ${b.customerName} | ${b.adults + b.children + b.infants} | ${b.phone}${tg} | ${b.pickupTime} | Sell ${b.managerName}${duePart} | ${b.mapsUrl || "-"}`;
  });

  return NextResponse.json({
    text: `${header}\n\n${lines.join("\n\n")}`,
  });
}
