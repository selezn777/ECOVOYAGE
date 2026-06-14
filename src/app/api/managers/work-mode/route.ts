import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { setManagerWorkModeForDay } from "@/lib/data";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import { createInAppNotificationsForUsers } from "@/lib/in-app-notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  managerId: z.string().uuid(),
  mode: z.enum(["point", "promo", "online"]),
  dayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dayTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pointId: z.string().uuid().nullable().optional(),
  promoPlace: z.string().max(240).optional(),
  onlineChannel: z.string().max(240).optional(),
  onlineTrafficSource: z.enum(["own", "office"]).optional(),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { managerId, mode, dayFrom, dayTo, pointId, promoPlace, onlineChannel, onlineTrafficSource } = parsed.data;
  const canSetForAny =
    session.role === "director" || session.role === "chief_manager" || session.role === "accountant";
  const canSetSelf = session.role === "manager" && session.id === managerId;
  if (!canSetForAny && !canSetSelf) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const res = await setManagerWorkModeForDay(managerId, mode, {
    dayFrom,
    dayTo,
    pointId: pointId ?? null,
    promoPlace,
    onlineChannel,
    onlineTrafficSource,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  const senderIsLeadership =
    session.baseRole === "director" ||
    session.baseRole === "chief_manager" ||
    session.baseRole === "accountant";
  const leadershipAssignsAnother = senderIsLeadership && session.id !== managerId;

  if (mode === "point" && leadershipAssignsAnother && res.days?.length) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const pid =
          pointId != null && String(pointId).trim()
            ? String(pointId).trim()
            : null;
        let pointName: string | null = null;
        if (pid) {
          const pt = await supabase.from("rental_points").select("name").eq("id", pid).maybeSingle();
          pointName = String((pt.data as { name?: string } | null)?.name || "").trim() || null;
        }
        const daysRu = res.days.map((d) => formatYmdWithWeekdayRu(d)).join(", ");
        await createInAppNotificationsForUsers(supabase, [managerId], {
          kind: "manager_point_assigned",
          title: "Назначение на точку продаж",
          body: [daysRu, pointName ? `Точка: ${pointName}` : null].filter(Boolean).join("\n"),
          linkUrl: "/sales-points",
          meta: { days: res.days, pointId: pid },
        });
      } catch {
        /* не блокируем сохранение */
      }
    }
  }

  return NextResponse.json(res);
}
