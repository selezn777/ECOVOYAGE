import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getTourById, getResolvedTourDescriptionForTour } from "@/lib/data";
import { parseTemplateDescription } from "@/lib/tour-description-share";
import { formatYmdWithWeekdayRu, pickupWindowFromStartEndIso } from "@/lib/scheduling";
import { BUS_ROLES } from "@/lib/role-policy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!BUS_ROLES.includes(session.role) && session.role !== "director") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id } = await params;
  const tour = await getTourById(id);
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  // Гид (основной)
  const primaryGuide = tour.assignedGuides?.find((g) => g.isPrimary) ?? tour.assignedGuides?.[0] ?? null;
  const guideName = primaryGuide?.fullName ?? null;
  const guidePhone = primaryGuide?.phone ?? null;

  // Бронирования — считаем пакс
  const supabase = getSupabaseAdmin();
  let totalPax = 0;
  if (supabase) {
    const { data: bRows } = await supabase
      .from("bookings")
      .select("adults,children,infants")
      .eq("tour_id", id)
      .is("deleted_at", null);
    totalPax = (bRows || []).reduce(
      (s, b) => s + Number((b as { adults: number }).adults) + Number((b as { children: number }).children) + Number((b as { infants: number }).infants),
      0,
    );
  }

  // Локации из описания тура
  const descriptionRaw = await getResolvedTourDescriptionForTour(tour);
  const { locations } = parseTemplateDescription(descriptionRaw ?? "");

  // Пикап окно
  const pickupWindow = pickupWindowFromStartEndIso(tour.startAtIso ?? null, tour.endAtIso ?? null) || tour.pickupWindow;

  // Сборка сообщения
  const lines: string[] = [];
  lines.push(`Тур: ${tour.name}`);
  lines.push(`Дата: ${formatYmdWithWeekdayRu(tour.date)}`);
  if (pickupWindow) lines.push(`Сбор туристов: ${pickupWindow}`);
  lines.push(`Туристов: ${totalPax} чел.`);

  if (guideName) {
    lines.push("");
    lines.push(`Гид: ${guideName}`);
    if (guidePhone) {
      const digits = guidePhone.replace(/[^\d]/g, "");
      const formatted = digits.startsWith("84") ? `+${digits}` : guidePhone;
      lines.push(`Тел: ${formatted}`);
    }
  }

  if (locations.length > 0) {
    lines.push("");
    lines.push("Локации:");
    locations.forEach((loc, i) => {
      const entry = [`${i + 1}. ${loc.name}`];
      if (loc.recommendedTime) entry.push(`(${loc.recommendedTime})`);
      lines.push(entry.join(" "));
      if (loc.mapUrl) lines.push(loc.mapUrl);
    });
  }

  return NextResponse.json({ text: lines.join("\n") });
}
