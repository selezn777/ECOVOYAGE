import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import {
  isPastCalendarDay,
  minGuideSelfDayOffDate,
  tourCalendarDateFromStartAtIso,
} from "@/lib/scheduling";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";

const bodySchema = z
  .object({
    guideId: z.string().uuid().optional(),
    dayOff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dayTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((v, ctx) => {
    const single = Boolean(v.dayOff);
    const range = Boolean(v.dayFrom || v.dayTo);
    if (single && range) {
      ctx.addIssue({ code: "custom", message: "Используйте либо dayOff, либо dayFrom/dayTo." });
      return;
    }
    if (!single && !(v.dayFrom && v.dayTo)) {
      ctx.addIssue({ code: "custom", message: "Укажите dayOff или диапазон dayFrom/dayTo." });
      return;
    }
    if (v.dayFrom && v.dayTo && v.dayFrom > v.dayTo) {
      ctx.addIssue({ code: "custom", path: ["dayTo"], message: "Дата окончания раньше даты начала." });
    }
  });

function canUseGuideDaysOffApi(role: string) {
  return role === "guide" || role === "chief_guide" || role === "director";
}

function ymdRangeInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T00:00:00`);
  while (cur.getTime() <= to.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canUseGuideDaysOffApi(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const targetGuideId = parsed.data.guideId ?? session.id;
  const isAdminForOthers =
    (session.role === "chief_guide" || session.role === "director") && targetGuideId !== session.id;
  if (targetGuideId !== session.id && !isAdminForOthers) return apiDenied();

  const requestedDays = parsed.data.dayOff
    ? [parsed.data.dayOff]
    : ymdRangeInclusive(parsed.data.dayFrom!, parsed.data.dayTo!);
  const minDay = isAdminForOthers ? minGuideSelfDayOffDate() : minGuideSelfDayOffDate();
  for (const dayOff of requestedDays) {
    if (isPastCalendarDay(dayOff)) {
      return NextResponse.json({ error: `Нельзя добавить выходной в прошлом: ${dayOff}` }, { status: 400 });
    }
    if (dayOff < minDay) {
      return NextResponse.json(
        { error: `Выходной ${dayOff} можно запланировать не раньше ${minDay} (не раньше чем через 3 дня от сегодня)` },
        { status: 400 },
      );
    }
  }

  // Нельзя взять выходной на день, где гид уже назначен на тур.
  const { data: myGuideRows, error: myGuideErr } = await supabase
    .from("tour_guides")
    .select("tour_id")
    .eq("guide_id", targetGuideId);
  if (myGuideErr) return NextResponse.json({ error: myGuideErr.message }, { status: 500 });
  const myTourIds = ((myGuideRows as { tour_id: string }[] | null) || []).map((r) => r.tour_id).filter(Boolean);
  if (myTourIds.length > 0) {
    const { data: myTours, error: myToursErr } = await supabase
      .from("tours")
      .select("id,name,start_at,status")
      .in("id", myTourIds);
    if (myToursErr) return NextResponse.json({ error: myToursErr.message }, { status: 500 });
    const requestedSet = new Set(requestedDays);
    const assignedOnDay = ((myTours as { id: string; name: string; start_at: string; status?: string }[] | null) || []).find((t) => {
      if (t.status === "deleted") return false;
      const day = tourCalendarDateFromStartAtIso(String(t.start_at || ""));
      return requestedSet.has(day);
    });
    if (assignedOnDay) {
      const onDay = tourCalendarDateFromStartAtIso(String(assignedOnDay.start_at || ""));
      return NextResponse.json(
        {
          error: `Нельзя взять выходной на ${onDay}: вы уже назначены на тур «${assignedOnDay.name || "без названия"}». Сначала снимите назначение.`,
        },
        { status: 400 },
      );
    }
  }

  // Лимит количества дней отпуска не ограничиваем: можно ставить длинные периоды (вне сезона и т.д.).

  const actorId = actorUuidOrNull(session.id);
  const { error } = await supabase.from("guide_days_off").insert(
    requestedDays.map((d) => ({ guide_id: targetGuideId, day_off: d })),
  );
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Этот день уже отмечен как выходной" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_days_off",
    entityId: targetGuideId,
    action: "add",
    after: { days: requestedDays },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canUseGuideDaysOffApi(session.role)) {
    return apiDenied();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const dayOff = searchParams.get("dayOff");
  const guideIdParam = searchParams.get("guideId");
  const targetGuideId = guideIdParam && /^[0-9a-f-]{36}$/i.test(guideIdParam) ? guideIdParam : session.id;
  const isAdminForOthers =
    (session.role === "chief_guide" || session.role === "director") && targetGuideId !== session.id;
  if (targetGuideId !== session.id && !isAdminForOthers) return apiDenied();
  if (!dayOff || !/^\d{4}-\d{2}-\d{2}$/.test(dayOff)) {
    return NextResponse.json({ error: "Нужен параметр dayOff (ГГГГ-ММ-ДД)" }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);
  const { error, data } = await supabase
    .from("guide_days_off")
    .delete()
    .eq("guide_id", targetGuideId)
    .eq("day_off", dayOff)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_days_off",
    entityId: targetGuideId,
    action: "remove",
    before: { day_off: dayOff },
  });

  return NextResponse.json({ ok: true });
}
