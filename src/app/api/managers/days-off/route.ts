import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import {
  isPastCalendarDay,
  isValidManagerOffForChiefTarget,
  minManagerDayOffDateForChiefAction,
} from "@/lib/scheduling";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { MANAGER_OFF_ADMIN_ROLES } from "@/lib/role-policy";
import { tourCalendarDateFromStartAtIso } from "@/lib/scheduling";

const bodySchema = z
  .object({
    managerId: z.string().uuid(),
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

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { managerId } = parsed.data;
  const requestedDays = parsed.data.dayOff
    ? [parsed.data.dayOff]
    : ymdRangeInclusive(parsed.data.dayFrom!, parsed.data.dayTo!);
  for (const dayOff of requestedDays) {
    if (isPastCalendarDay(dayOff)) {
      return NextResponse.json({ error: `Нельзя добавить выходной в прошлом: ${dayOff}` }, { status: 400 });
    }
  }

  const isAdmin = MANAGER_OFF_ADMIN_ROLES.includes(session.role);
  const isSelfManager = session.role === "manager" && managerId === session.id;

  if (!isAdmin && !isSelfManager) {
    return apiDenied();
  }

  if (isAdmin && managerId !== session.id && requestedDays.some((d) => !isValidManagerOffForChiefTarget(d))) {
    return NextResponse.json(
      {
        error: `For another manager, day off must be on or after ${minManagerDayOffDateForChiefAction()} (5+ calendar days ahead).`,
      },
      { status: 400 },
    );
  }

  const requestedSet = new Set(requestedDays);
  const { data: asManagerRows, error: asManagerErr } = await supabase
    .from("bookings")
    .select("tour_id")
    .eq("manager_id", managerId)
    .is("deleted_at", null);
  if (asManagerErr) return NextResponse.json({ error: asManagerErr.message }, { status: 500 });
  const tourIds = ((asManagerRows as { tour_id: string }[] | null) ?? []).map((r) => r.tour_id).filter(Boolean);
  if (tourIds.length > 0) {
    const { data: tours, error: toursErr } = await supabase.from("tours").select("id,name,start_at,status").in("id", tourIds);
    if (toursErr) return NextResponse.json({ error: toursErr.message }, { status: 500 });
    const clash = ((tours as { id: string; name: string; start_at: string; status?: string }[] | null) ?? []).find((t) => {
      if (t.status === "deleted") return false;
      const ymd = tourCalendarDateFromStartAtIso(String(t.start_at || ""));
      return requestedSet.has(ymd);
    });
    if (clash) {
      const ymd = tourCalendarDateFromStartAtIso(String(clash.start_at || ""));
      return NextResponse.json(
        { error: `На ${ymd} есть ваша продажа/тур «${clash.name || "без названия"}». Сначала перенесите работу.` },
        { status: 400 },
      );
    }
  }
  const { data: asGuideRows, error: asGuideErr } = await supabase
    .from("tour_guides")
    .select("tour_id")
    .eq("guide_id", managerId);
  if (asGuideErr) return NextResponse.json({ error: asGuideErr.message }, { status: 500 });
  const guideTourIds = ((asGuideRows as { tour_id: string }[] | null) ?? []).map((r) => r.tour_id).filter(Boolean);
  if (guideTourIds.length > 0) {
    const { data: tours, error: toursErr } = await supabase.from("tours").select("id,name,start_at,status").in("id", guideTourIds);
    if (toursErr) return NextResponse.json({ error: toursErr.message }, { status: 500 });
    const clash = ((tours as { id: string; name: string; start_at: string; status?: string }[] | null) ?? []).find((t) => {
      if (t.status === "deleted") return false;
      const ymd = tourCalendarDateFromStartAtIso(String(t.start_at || ""));
      return requestedSet.has(ymd);
    });
    if (clash) {
      const ymd = tourCalendarDateFromStartAtIso(String(clash.start_at || ""));
      return NextResponse.json(
        { error: `На ${ymd} вы назначены тургидом на «${clash.name || "без названия"}». Сначала снимите назначение.` },
        { status: 400 },
      );
    }
  }
  // Лимит количества дней отпуска не ограничиваем: можно ставить длинные периоды (вне сезона и т.д.).

  const actorId = actorUuidOrNull(session.id);
  const { error } = await supabase.from("manager_days_off").insert(
    requestedDays.map((d) => ({ manager_id: managerId, day_off: d, created_by: actorId })),
  );
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Этот день уже отмечен" }, { status: 409 });
    if (error.message.includes("manager_days_off") || error.code === "42P01") {
      return NextResponse.json(
        { error: "Нет таблицы manager_days_off - выполните актуальный supabase/schema.sql в Supabase." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "manager_days_off",
    entityId: managerId,
    action: "add",
    after: { days: requestedDays },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get("managerId");
  const dayOff = searchParams.get("dayOff");
  if (!managerId || !dayOff || !/^\d{4}-\d{2}-\d{2}$/.test(dayOff)) {
    return NextResponse.json({ error: "Нужны managerId и dayOff (ГГГГ-ММ-ДД)" }, { status: 400 });
  }

  const isAdmin = MANAGER_OFF_ADMIN_ROLES.includes(session.role);
  const isSelf = session.role === "manager" && managerId === session.id;
  if (!isAdmin && !isSelf) {
    return apiDenied();
  }

  const actorId = actorUuidOrNull(session.id);
  const { error, data } = await supabase
    .from("manager_days_off")
    .delete()
    .eq("manager_id", managerId)
    .eq("day_off", dayOff)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "manager_days_off",
    entityId: managerId,
    action: "remove",
    before: { day_off: dayOff },
  });

  return NextResponse.json({ ok: true });
}
