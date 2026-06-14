import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser, isDemoUser } from "@/lib/auth-session";
import { canCreateTour } from "@/lib/role-policy";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { resolveOfferFromTemplateRow } from "@/lib/template-tour-offer";
import { buildTemplateDescription, type TourTemplateLocation } from "@/lib/tour-description-share";
import { formatYmdWithWeekdayRu, tourBusinessTodayYmd } from "@/lib/scheduling";
import { createInAppNotificationsForUsers } from "@/lib/in-app-notifications";

const payloadSchema = z.object({
  templateId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(500),
  tourType: z.enum(["group", "private"]),
  offerUsd: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(0).optional(),
  ),
  usdToVndRate: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(1).max(1_000_000).optional(),
  ),
  customDescription: z.string().max(12000).optional(),
  customLocations: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(400).optional().or(z.literal("")),
        mapUrl: z.string().trim().url().max(500),
        recommendedTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        plusVnd: z.coerce.number().min(0).max(2_000_000_000).optional(),
      }),
    )
    .max(30)
    .optional(),
  /** Полное описание выезда (как в шаблоне), если отличается от шаблона — сохраняется в tours.description_override */
  tourDescriptionOverride: z.string().max(12000).optional().or(z.literal("")),
});

function toIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+07:00`;
}

/**
 * Проверяет правила расписания Asia Mix.
 * Возвращает строку с ошибкой или null если всё OK.
 * Правила:
 *   - Дананг 1d/2d: не в субботу и воскресенье
 *   - Сайгон 2d: только пн и чт (вечерний выезд)
 *   - Сайгон 1d: только пн/вт/чт/пт (Cu Chi=пн+чт, Mekong=вт+пт)
 */
function checkScheduleRule(templateName: string, dateYmd: string): string | null {
  const lower = templateName.toLowerCase();
  const dow = new Date(`${dateYmd}T12:00:00+07:00`).getDay(); // 0=вс,1=пн,...,6=сб

  if (lower.includes("дананг")) {
    if (dow === 0 || dow === 6) {
      return "Туры в Дананг не открываются в субботу и воскресенье (правило расписания).";
    }
  }

  if (lower.includes("сайгон") && lower.includes("2 дня")) {
    if (dow !== 1 && dow !== 4) {
      return "Сайгон 2 дня — выезд только вечером в понедельник и четверг.";
    }
  }

  if (lower.includes("сайгон") && lower.includes("1 день")) {
    if (dow !== 1 && dow !== 2 && dow !== 4 && dow !== 5) {
      return "Сайгон 1 день — выезд только в пн/вт/чт/пт (Cu Chi: пн+чт, Mekong: вт+пт).";
    }
  }

  return null;
}

function add30Minutes(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(2000, 0, 1, h || 0, m || 0);
  dt.setMinutes(dt.getMinutes() + 30);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateTour(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен. Заполните .env.local." }, { status: 500 });
  }

  const raw = await request.json();
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля тура." }, { status: 400 });
  }
  const body = parsed.data;
  const todayYmd = tourBusinessTodayYmd();
  if (body.date < todayYmd) {
    return NextResponse.json({ error: "Нельзя создавать тур в прошедшей дате." }, { status: 400 });
  }
  let templateId = body.templateId || null;
  const { data: rateRows } = await supabase
    .from("currency_rates")
    .select("rate")
    .eq("active", true)
    .eq("base_currency", "USD")
    .eq("quote_currency", "VND")
    .order("set_at", { ascending: false })
    .limit(1);
  const rateFromDb =
    rateRows && rateRows[0] && Number((rateRows[0] as { rate?: unknown }).rate) > 0
      ? Number((rateRows[0] as { rate?: unknown }).rate)
      : 26000;
  let rate = body.usdToVndRate ?? rateFromDb;
  if (!Number.isFinite(rate) || rate < 1) rate = 26000;

  let fromTemplate: ReturnType<typeof resolveOfferFromTemplateRow> = null;
  let templateRow: { name: string; default_price_vnd?: unknown; locations?: unknown } | null = null;
  if (templateId) {
    const { data: tmpl } = await supabase
      .from("tour_templates")
      .select("name,default_price_vnd,locations")
      .eq("id", templateId)
      .eq("active", true)
      .maybeSingle();
    if (!tmpl) {
      return NextResponse.json({ error: "Шаблон тура не найден." }, { status: 400 });
    }
    templateRow = tmpl as { name: string; default_price_vnd?: unknown; locations?: unknown };
    const scheduleRuleError = checkScheduleRule(templateRow.name, body.date);
    if (scheduleRuleError) {
      return NextResponse.json({ error: scheduleRuleError }, { status: 422 });
    }
    fromTemplate = resolveOfferFromTemplateRow(templateRow, rate);
  }

  const explicitUsd = body.offerUsd != null && body.offerUsd > 0 ? body.offerUsd : 0;
  let finalUsd = 0;
  let finalVnd = 0;
  if (explicitUsd > 0) {
    finalUsd = explicitUsd;
    finalVnd = Math.round(finalUsd * rate);
  } else if (fromTemplate) {
    if (fromTemplate.usd > 0) {
      finalUsd = fromTemplate.usd;
      finalVnd = Math.round(finalUsd * rate);
    } else if (fromTemplate.vnd > 0) {
      finalVnd = fromTemplate.vnd;
      finalUsd = finalVnd / rate;
    }
  }
  if (finalVnd <= 0 || !Number.isFinite(finalUsd) || finalUsd <= 0) {
    return NextResponse.json(
      {
        error:
          "Укажите цену тура в долларах и курс USD→VND или выберите тур из списка с заполненной ценой.",
      },
      { status: 400 },
    );
  }

  const dateTo = body.dateTo && body.dateTo.trim() ? body.dateTo : body.date;
  if (dateTo < body.date) {
    return NextResponse.json({ error: "Дата окончания должна быть не раньше даты начала." }, { status: 400 });
  }
  const daySpan =
    Math.round((new Date(`${dateTo}T00:00:00+07:00`).getTime() - new Date(`${body.date}T00:00:00+07:00`).getTime()) / 86400000) +
    1;
  if (!Number.isFinite(daySpan) || daySpan < 1) {
    return NextResponse.json({ error: "Некорректный диапазон дат тура." }, { status: 400 });
  }
  if (daySpan > 31) {
    return NextResponse.json({ error: "Слишком длинный диапазон. Максимум 31 день на один тур." }, { status: 400 });
  }

  const endTime = body.endTime ?? "";
  const normalizedEndTime = body.tourType === "group" ? (endTime || add30Minutes(body.startTime)) : endTime;
  const hasRangeEnd = normalizedEndTime.length > 0;
  if (body.tourType === "group" && !hasRangeEnd) {
    return NextResponse.json({ error: "Для группового тура укажите окно сбора: с и до." }, { status: 400 });
  }
  if (body.tourType === "group" && normalizedEndTime <= body.startTime) {
    return NextResponse.json({ error: "Конец окна сбора должен быть позже начала." }, { status: 400 });
  }
  const startAt = toIso(body.date, body.startTime);
  const endAt = body.tourType === "group" && hasRangeEnd ? toIso(dateTo, normalizedEndTime) : toIso(dateTo, body.startTime);

  const finalName = body.name.trim();
  const actorId = actorUuidOrNull(session.id);
  const offerUsdRounded = Math.round(finalUsd * 10000) / 10000;
  if (!templateId) {
    const customDescription = String(body.customDescription || "").trim();
    const customLocations: TourTemplateLocation[] = (body.customLocations || [])
      .map((l) => ({
        name: l.name.trim(),
        description: (l.description || "").trim(),
        mapUrl: l.mapUrl.trim(),
        recommendedTime: (l.recommendedTime || "").trim(),
        plusVnd: Math.max(0, Math.round(Number(l.plusVnd || 0))),
      }))
      .filter((l) => l.name && l.mapUrl);
    if (customDescription || customLocations.length > 0) {
      const syntheticDescription = buildTemplateDescription(customDescription, customLocations);
      const { data: tmplCreated, error: tmplErr } = await supabase
        .from("tour_templates")
        .insert([
          {
            name: body.name,
            description: syntheticDescription,
            pickup_mode: body.tourType === "group" ? "range" : "exact",
            pickup_from: body.startTime,
            pickup_to: body.tourType === "group" ? (body.endTime || add30Minutes(body.startTime)) : null,
            default_price_vnd: finalVnd,
            active: false,
            created_by: actorId,
            locations: {
              currency: "USD",
              usd_price: offerUsdRounded,
              vnd_price: finalVnd,
            },
          },
        ])
        .select("id")
        .single();
      if (tmplErr || !tmplCreated?.id) {
        return NextResponse.json({ error: tmplErr?.message || "Не удалось подготовить кастомный маршрут." }, { status: 500 });
      }
      templateId = tmplCreated.id;
    }
  }
  const descriptionOverrideTrimmed = String(body.tourDescriptionOverride ?? "").trim();
  const descriptionOverridePayload = descriptionOverrideTrimmed ? descriptionOverrideTrimmed : null;

  const insertRow = {
    template_id: templateId,
    name: finalName,
    tour_type: body.tourType,
    start_at: startAt,
    end_at: endAt,
    capacity: body.capacity,
    default_offer_usd: offerUsdRounded,
    default_offer_rate_to_vnd: rate,
    default_offer_vnd: finalVnd,
    created_by: actorId,
    ...(session && isDemoUser(session) ? { is_demo: true } : {}),
    ...(descriptionOverridePayload ? { description_override: descriptionOverridePayload } : {}),
  };

  let createdRows: { id: string; start_at: string }[] | null = null;
  let error: { message?: string } | null = null;
  const ins = await supabase.from("tours").insert([insertRow]).select("id,start_at");
  if (ins.error && /description_override|column|does not exist/i.test(String(ins.error.message))) {
    const ins2 = await supabase
      .from("tours")
      .insert([
        (({ description_override: _drop, ...rest }) => rest)(insertRow),
      ])
      .select("id,start_at");
    createdRows = ins2.data as { id: string; start_at: string }[] | null;
    error = ins2.error;
  } else {
    createdRows = ins.data as { id: string; start_at: string }[] | null;
    error = ins.error;
  }
  if (error || !createdRows || createdRows.length === 0) {
    return NextResponse.json({ error: error?.message || "Не удалось создать тур." }, { status: 500 });
  }

  const created = createdRows[0]!;
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour",
    entityId: created.id,
    action: "create",
    after: {
      template_id: templateId,
      name: finalName,
      tour_type: body.tourType,
      start_at: created.start_at,
      end_at: endAt,
      duration_days: daySpan,
      capacity: body.capacity,
      default_offer_usd: offerUsdRounded,
      default_offer_rate_to_vnd: rate,
      default_offer_vnd: finalVnd,
    },
  });

  try {
    const { data: dispRows } = await supabase.from("users").select("id").in("role", ["dispatcher", "booking_dispatcher"]);
    const ids =
      ((dispRows as { id?: string }[] | null) ?? []).map((r) => String(r.id || "")).filter(Boolean) ?? [];
    const ymd = body.date;
    const whenRu = formatYmdWithWeekdayRu(ymd);
    await createInAppNotificationsForUsers(supabase, ids, {
      kind: "tour_created_dispatcher",
      title: "Новый тур — назначьте автобус",
      body: `${finalName} · ${whenRu}`,
      linkUrl: `/tours/${created.id}`,
      meta: { tourId: created.id },
    });
  } catch {
    /* не блокируем создание тура */
  }

  return NextResponse.json({ ok: true, tourId: created.id, createdCount: 1, durationDays: daySpan });
}
