import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isUserAssignedGuideOnTour } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { parseExpenseImageDataUrl } from "@/lib/expense-attachment";

const GUIDE_EXTRA_ROLES = ["guide", "chief_guide"] as const;
const GUIDE_EXTRA_LEADERSHIP_ROLES = ["director", "chief_manager"] as const;

function isMissingGuideSalaryNoteColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /note/i.test(msg);
}

function isMissingGuideSalaryAttachmentColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /attachment_url/i.test(msg);
}

function isMissingGuideSalaryKindColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /kind/i.test(msg);
}

const bodySchema = z
  .object({
    mode: z.enum(["shop", "levals"]),

    // mode === "shop"
    /** Сколько магазин отдал по факту (сумма для распределения). */
    shopProfitVnd: z.number().int().min(1).optional(),

    // mode === "levals"
    /** Сумма конфиденциальных доплат “вне магазина”. */
    levalsTotalVnd: z.number().int().min(1).optional(),
    /** Режим ввода для водителя: либо `%`, либо фиксированная сумма VND. */
    levalsDriverMode: z.enum(["percent", "fixed"]).optional(),
    /** Доля водителя, % (используется, если levalsDriverMode === "percent"). */
    levalsDriverPercent: z.number().min(0).max(100).optional(),
    /** Фиксированная сумма водителю, VND (используется, если levalsDriverMode === "fixed"). */
    levalsDriverFixedVnd: z.number().int().min(0).optional(),

    /** Для levals обязательно; для shop подставляется по умолчанию на сервере. */
    whereNote: z.string().max(250).optional(),
    /** Фото/скан чека или выплаты (data URL). Требуется, когда есть доля офиса. */
    attachmentDataUrl: z.string().optional(),
    /** Как прошли деньги магазина: у гида или сразу в офисе. */
    settlement: z.enum(["guide_kept", "office_received"]).optional(),
    /** Доли от суммы магазина, % (остаток - гид). По умолчанию 40 / 20. */
    shopOfficePercent: z.number().min(0).max(100).optional(),
    shopDriverPercent: z.number().min(0).max(100).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "shop") {
      if (!d.shopProfitVnd || d.shopProfitVnd < 1) ctx.addIssue({ code: "custom", path: ["shopProfitVnd"], message: "Нужна сумма от магазина" });
      const o = d.shopOfficePercent ?? 40;
      const dr = d.shopDriverPercent ?? 20;
      if (o + dr > 100) {
        ctx.addIssue({ code: "custom", path: ["shopOfficePercent"], message: "Сумма % офиса и водителя не больше 100" });
      }
    }
    if (d.mode === "levals") {
      if (!d.whereNote?.trim()) ctx.addIssue({ code: "custom", path: ["whereNote"], message: "Укажите, где/за что заработок" });
      if (!d.levalsTotalVnd || d.levalsTotalVnd < 1) ctx.addIssue({ code: "custom", path: ["levalsTotalVnd"], message: "Нужна сумма вне магазина" });
      const driverMode = d.levalsDriverMode ?? "percent";
      if (driverMode === "fixed") {
        const fixed = d.levalsDriverFixedVnd ?? 0;
        if (fixed > (d.levalsTotalVnd ?? 0)) {
          ctx.addIssue({
            code: "custom",
            path: ["levalsDriverFixedVnd"],
            message: "Фикс водителя не может быть больше суммы вне магазина",
          });
        }
      }
    }
  });

const patchBodySchema = z
  .object({
    recordId: z.string().uuid(),
    action: z.enum(["toggleTaken", "updateLevals", "updateShop", "setShopDriverPaid"]),
    taken: z.boolean().optional(),
    levalsTotalVnd: z.number().int().min(1).optional(),
    levalsDriverMode: z.enum(["percent", "fixed"]).optional(),
    levalsDriverPercent: z.number().min(0).max(100).optional(),
    levalsDriverFixedVnd: z.number().int().min(0).optional(),
    whereNote: z.string().min(1).max(250).optional(),
    shopProfitVnd: z.number().int().min(1).optional(),
    attachmentDataUrl: z.string().optional(),
    settlement: z.enum(["guide_kept", "office_received"]).optional(),
    shopOfficePercent: z.number().min(0).max(100).optional(),
    shopDriverPercent: z.number().min(0).max(100).optional(),
    shopDriverPaidByGuideVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.action === "updateShop") {
      if (!d.shopProfitVnd || d.shopProfitVnd < 1) {
        ctx.addIssue({ code: "custom", path: ["shopProfitVnd"], message: "Нужна сумма от магазина" });
      }
      const o = d.shopOfficePercent ?? 40;
      const dr = d.shopDriverPercent ?? 20;
      if (o + dr > 100) {
        ctx.addIssue({ code: "custom", path: ["shopOfficePercent"], message: "Сумма % офиса и водителя не больше 100" });
      }
    }
  });

const deleteBodySchema = z.object({
  recordId: z.string().uuid(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const role = session.role as string;
  const isGuideRole = GUIDE_EXTRA_ROLES.includes(role as (typeof GUIDE_EXTRA_ROLES)[number]);
  const isLeadershipRole = GUIDE_EXTRA_LEADERSHIP_ROLES.includes(role as (typeof GUIDE_EXTRA_LEADERSHIP_ROLES)[number]);
  if (!isGuideRole && !isLeadershipRole) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  const { data: tourMeta, error: tourErr } = await supabase.from("tours").select("id,status").eq("id", tourId).maybeSingle();
  if (tourErr || !tourMeta) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  const tourClosed = String((tourMeta as { status?: string }).status || "").toLowerCase() === "completed";
  if (isGuideRole) {
    const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
    if (!onTour) return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
    if (tourClosed) {
      return NextResponse.json({ error: "Карточка тура закрыта: правки доступны только руководству" }, { status: 403 });
    }
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const actorId = actorUuidOrNull(session.id);
  const guideId = actorId;
  if (!guideId) return NextResponse.json({ error: "Нужен UUID гида" }, { status: 400 });

  const { mode } = parsed.data;
  const whereNoteTrimmed = parsed.data.whereNote?.trim() ?? "";

  const attachmentUrl = (() => {
    if (!("attachmentDataUrl" in parsed.data) || typeof parsed.data.attachmentDataUrl !== "string") return undefined;
    const url = parseExpenseImageDataUrl(parsed.data.attachmentDataUrl);
    if (parsed.data.attachmentDataUrl && !url) return null;
    return url;
  })();

  if (attachmentUrl === null) {
    return NextResponse.json({ error: "Некорректное фото: нужен JPEG/PNG/WebP до ~2 МБ." }, { status: 400 });
  }

  // Требование: фото нужно, когда есть доля офиса (в “магазине” она всегда > 0).
  const requiresAttachment = mode === "shop";
  if (requiresAttachment && !attachmentUrl) {
    return NextResponse.json({ error: "Для бухгалтерии нужно прикрепить фото чека/выплаты" }, { status: 400 });
  }

  const kind = mode === "shop" ? "shop" : "levals";
  let computedGuideVnd = 0;
  let note = "";

  if (mode === "shop") {
    const guideDefinesSplit = !isGuideRole;
    const officePercent = guideDefinesSplit ? Math.round(parsed.data.shopOfficePercent ?? 40) : 100;
    const driverPercent = guideDefinesSplit ? Math.round(parsed.data.shopDriverPercent ?? 20) : 0;
    const guidePercent = guideDefinesSplit ? Math.max(0, 100 - officePercent - driverPercent) : 0;

    const profitVnd = Math.round(parsed.data.shopProfitVnd!);
    if (profitVnd <= 0) return NextResponse.json({ error: "Сумма от магазина равна 0" }, { status: 400 });

    if (officePercent + driverPercent > 100) {
      return NextResponse.json({ error: "Сумма % офиса и водителя не больше 100" }, { status: 400 });
    }
    const officeVnd = Math.round((profitVnd * officePercent) / 100);
    const driverVnd = Math.round((profitVnd * driverPercent) / 100);
    computedGuideVnd = profitVnd - officeVnd - driverVnd;
    if (computedGuideVnd < 0) return NextResponse.json({ error: "Некорректное распределение процентов" }, { status: 400 });

    const settlement = parsed.data.settlement ?? "guide_kept";
    const shopWhere = whereNoteTrimmed || "Официальный магазин";
    note = [
      "[shop-extra]",
      `получено=${profitVnd}`,
      `офис=${officePercent}%(${officeVnd})`,
      `водитель=${driverPercent}%(${driverVnd})`,
      `гид=${guidePercent}%(${computedGuideVnd})`,
      ...(guideDefinesSplit ? [] : ["черновик=await_accountant_split"]),
      `расчет=${settlement}`,
      `где/за что: ${shopWhere}`,
    ].join(" · ");
  } else {
    const levalsTotalVnd = parsed.data.levalsTotalVnd!;
    const driverMode = parsed.data.levalsDriverMode ?? "percent";

    // Вне магазине: офис не участвует, делим только между водителем и гидом.
    let driverPercent = 0;
    let driverVnd = 0;
    if (driverMode === "fixed") {
      const fixedVnd = parsed.data.levalsDriverFixedVnd ?? 0;
      if (fixedVnd > levalsTotalVnd) return NextResponse.json({ error: "Некорректная фикс сумма водителю" }, { status: 400 });
      driverVnd = fixedVnd;
      driverPercent = levalsTotalVnd > 0 ? Math.round((driverVnd * 100) / levalsTotalVnd) : 0;
    } else {
      const levalsDriverPercent = parsed.data.levalsDriverPercent ?? 0;
      driverPercent = levalsDriverPercent;
      driverVnd = Math.round((levalsTotalVnd * driverPercent) / 100);
    }
    computedGuideVnd = levalsTotalVnd - driverVnd;
    if (computedGuideVnd < 0) return NextResponse.json({ error: "Некорректное разделение" }, { status: 400 });
    const guidePercent = 100 - driverPercent;

    note = [
      "[levals-extra]",
      `сумма=${levalsTotalVnd}`,
      `водитель=${driverPercent}%(${driverVnd})`,
      `гид=${guidePercent}%(${computedGuideVnd})`,
      `где/за что: ${whereNoteTrimmed}`,
    ].join(" · ");
  }

  if (mode === "levals" && computedGuideVnd <= 0) {
    return NextResponse.json({ error: "Начисление гиду получилось 0" }, { status: 400 });
  }

  const insert = async (opts: { withNote: boolean; withAttachment: boolean; withKind: boolean; withOutsideFixed: boolean }) => {
    const row: Record<string, unknown> = {
      tour_id: tourId,
      guide_id: guideId,
      amount_vnd: computedGuideVnd,
      ...(opts.withKind ? { kind } : {}),
      status: "pending",
      ...(opts.withNote ? { note } : {}),
      ...(opts.withAttachment ? { attachment_url: attachmentUrl } : {}),
    };

    if (mode === "levals") {
      // Для редактирования сохраняем базу вне магазина.
      const driverMode = parsed.data.levalsDriverMode ?? "percent";
      const levalsTotalVnd = parsed.data.levalsTotalVnd ?? null;
      const fixedVnd = parsed.data.levalsDriverFixedVnd ?? 0;
      row.outside_total_vnd = parsed.data.levalsTotalVnd ?? null;
      if (driverMode === "fixed") {
        if (opts.withOutsideFixed) {
          row.outside_driver_fixed_vnd = fixedVnd;
        }
        row.outside_driver_percent = levalsTotalVnd ? Math.round((fixedVnd * 100) / levalsTotalVnd) : 0;
      } else {
        row.outside_driver_percent = parsed.data.levalsDriverPercent ?? 0;
        // Не передаём поле в payload - иначе PostgREST падает, если колонки нет в БД (схема-кэш).
      }
    }
    return supabase.from("guide_salary_records").insert([row]).select("id").single();
  };

  const wantsOutsideFixed = mode === "levals" && (parsed.data.levalsDriverMode ?? "percent") === "fixed";
  const first = await insert({ withNote: true, withAttachment: Boolean(attachmentUrl), withKind: true, withOutsideFixed: wantsOutsideFixed });
  let rowId: string | null = null;
  let insertErr = first.error;
  if (!first.error && first.data?.id) rowId = String(first.data.id);

  if (insertErr && !rowId && /outside_driver_fixed_vnd/i.test(insertErr.message ?? "")) {
    const second = await insert({ withNote: true, withAttachment: Boolean(attachmentUrl), withKind: true, withOutsideFixed: false });
    insertErr = second.error;
    if (!second.error && second.data?.id) rowId = String(second.data.id);
  }

  if (insertErr && !rowId && isMissingGuideSalaryNoteColumn(insertErr)) {
    const second = await insert({ withNote: false, withAttachment: Boolean(attachmentUrl), withKind: true, withOutsideFixed: wantsOutsideFixed });
    insertErr = second.error;
    if (!second.error && second.data?.id) rowId = String(second.data.id);
  }

  if (insertErr && !rowId && isMissingGuideSalaryAttachmentColumn(insertErr)) {
    const third = await insert({ withNote: true, withAttachment: false, withKind: true, withOutsideFixed: wantsOutsideFixed });
    insertErr = third.error;
    if (!third.error && third.data?.id) rowId = String(third.data.id);
  }

  if (insertErr && !rowId && isMissingGuideSalaryKindColumn(insertErr)) {
    const fourth = await insert({ withNote: true, withAttachment: Boolean(attachmentUrl), withKind: false, withOutsideFixed: wantsOutsideFixed });
    insertErr = fourth.error;
    if (!fourth.error && fourth.data?.id) rowId = String(fourth.data.id);
  }

  if (!rowId) return NextResponse.json({ error: insertErr?.message || "Insert failed" }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: rowId,
    action: "create",
    after: {
      tour_id: tourId,
      guide_id: guideId,
      amount_vnd: computedGuideVnd,
    },
  });

  return NextResponse.json({ ok: true, id: rowId });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const role = session.role as string;
  const isGuideRole = GUIDE_EXTRA_ROLES.includes(role as (typeof GUIDE_EXTRA_ROLES)[number]);
  const isLeadershipRole = GUIDE_EXTRA_LEADERSHIP_ROLES.includes(role as (typeof GUIDE_EXTRA_LEADERSHIP_ROLES)[number]);
  if (!isGuideRole && !isLeadershipRole) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  const { data: tourMeta, error: tourErr } = await supabase.from("tours").select("id,status").eq("id", tourId).maybeSingle();
  if (tourErr || !tourMeta) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  const tourClosed = String((tourMeta as { status?: string }).status || "").toLowerCase() === "completed";
  if (isGuideRole) {
    const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
    if (!onTour) return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
    if (tourClosed) {
      return NextResponse.json({ error: "Карточка тура закрыта: правки доступны только руководству" }, { status: 403 });
    }
  }

  const json = await request.json();
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const actorId = actorUuidOrNull(session.id);
  const guideId = actorId;
  if (!guideId) return NextResponse.json({ error: "Нужен UUID гида" }, { status: 400 });

  const { recordId, action } = parsed.data;

  type SelRow = {
    tour_id: string;
    guide_id: string;
    kind: string;
    status: string;
    note: string | null;
    outside_total_vnd: number | string | null;
    outside_driver_percent: number | string | null;
    outside_driver_fixed_vnd?: number | string | null;
  };

  let hasOutsideFixedColumn = true;
  let row: SelRow | null = null;
  let selErr: { message?: string } | null = null;

  const selectWithFixed = "id,tour_id,guide_id,kind,status,paid_at,paid_by,amount_vnd,note,outside_total_vnd,outside_driver_percent,outside_driver_fixed_vnd";
  const selectWithoutFixed = "id,tour_id,guide_id,kind,status,paid_at,paid_by,amount_vnd,note,outside_total_vnd,outside_driver_percent";

  {
    const first = await supabase.from("guide_salary_records").select(selectWithFixed).eq("id", recordId).maybeSingle();
    row = (first.data as SelRow) ?? null;
    selErr = (first.error as { message?: string } | null) ?? null;

    if (selErr && /outside_driver_fixed_vnd/i.test(selErr.message ?? "")) {
      hasOutsideFixedColumn = false;
      const second = await supabase.from("guide_salary_records").select(selectWithoutFixed).eq("id", recordId).maybeSingle();
      row = (second.data as SelRow) ?? null;
      selErr = (second.error as { message?: string } | null) ?? null;
    }
  }

  if (selErr || !row) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  if (row.tour_id !== tourId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (isGuideRole && row.guide_id !== guideId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (action === "toggleTaken") {
    if (row.kind !== "levals") return NextResponse.json({ error: "Доступно только для вне-магазин записей" }, { status: 403 });
    const taken = parsed.data.taken;
    if (taken === undefined) return NextResponse.json({ error: "Нужен taken (true/false)" }, { status: 400 });
    if (taken) {
      const { error: upErr } = await supabase
        .from("guide_salary_records")
        .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: actorId })
        .eq("id", recordId);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    } else {
      const { error: upErr } = await supabase
        .from("guide_salary_records")
        .update({ status: "pending", paid_at: null, paid_by: null })
        .eq("id", recordId);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actorId,
      entity: "guide_salary_record",
      entityId: recordId,
      action: "update",
      after: { tour_id: tourId, guide_id: guideId, status: taken ? "paid" : "pending" },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "updateLevals") {
    if (row.kind !== "levals") return NextResponse.json({ error: "Доступно только для вне-магазин записей" }, { status: 403 });
    // Правка возможна только пока запись не отмечена как “забрал”.
    if (row.status === "paid") return NextResponse.json({ error: "Запись уже отмечена как забранная" }, { status: 403 });
    const total = parsed.data.levalsTotalVnd ?? (row.outside_total_vnd != null ? Number(row.outside_total_vnd) : null);
    const effectiveDriverMode = parsed.data.levalsDriverMode ?? (row.outside_driver_fixed_vnd != null ? "fixed" : "percent");
    const storedDriverFixedVnd = row.outside_driver_fixed_vnd != null ? Number(row.outside_driver_fixed_vnd) : null;
    const storedDriverPercent = row.outside_driver_percent != null ? Number(row.outside_driver_percent) : null;
    const whereNote = parsed.data.whereNote ?? row.note ?? "";
    if (!total || total < 1) return NextResponse.json({ error: "Некорректная сумма" }, { status: 400 });
    if (!whereNote.trim()) return NextResponse.json({ error: "Нужен комментарий (где/за что)" }, { status: 400 });

    let driverPercent: number;
    let driverVnd: number;
    if (effectiveDriverMode === "fixed") {
      const fixedVnd = parsed.data.levalsDriverFixedVnd ?? storedDriverFixedVnd ?? 0;
      if (fixedVnd < 0 || fixedVnd > total) return NextResponse.json({ error: "Некорректная фикс сумма водителю" }, { status: 400 });
      driverVnd = fixedVnd;
      driverPercent = total > 0 ? Math.round((driverVnd * 100) / total) : 0;
    } else {
      const driverPercentRaw = parsed.data.levalsDriverPercent ?? storedDriverPercent ?? 0;
      if (driverPercentRaw < 0 || driverPercentRaw > 100) return NextResponse.json({ error: "Некорректный % водителя" }, { status: 400 });
      driverPercent = driverPercentRaw;
      driverVnd = Math.round((total * driverPercent) / 100);
    }
    const guideVnd = total - driverVnd;

    // Обновляем только для вне-магазин.
    const newNote = [
      "[levals-extra]",
      `сумма=${total}`,
      `водитель=${driverPercent}%(${driverVnd})`,
      `гид=${100 - driverPercent}%(${guideVnd})`,
      `где/за что: ${whereNote.trim()}`,
    ].join(" · ");

    const { error: upErr } = await supabase
      .from("guide_salary_records")
      .update({
        amount_vnd: guideVnd,
        note: newNote,
        outside_total_vnd: total,
        outside_driver_percent: Math.round(driverPercent),
        ...(hasOutsideFixedColumn ? { outside_driver_fixed_vnd: effectiveDriverMode === "fixed" ? driverVnd : null } : {}),
        status: "pending",
        paid_at: null,
        paid_by: null,
      })
      .eq("id", recordId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actorId,
      entity: "guide_salary_record",
      entityId: recordId,
      action: "update",
      after: { tour_id: tourId, guide_id: guideId, kind: "levals", amount_vnd: guideVnd },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "setShopDriverPaid") {
    if (row.kind !== "shop") return NextResponse.json({ error: "Доступно только для магазина" }, { status: 403 });
    const v = parsed.data.shopDriverPaidByGuideVnd;
    if (v === undefined) return NextResponse.json({ error: "Нужна сумма" }, { status: 400 });
    const patch = { shop_driver_paid_by_guide_vnd: v };
    const { error: drvErr } = await supabase.from("guide_salary_records").update(patch).eq("id", recordId);
    if (drvErr && /shop_driver_paid_by_guide_vnd|column|does not exist/i.test(String(drvErr.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: shop_driver_paid_by_guide_vnd." }, { status: 503 });
    }
    if (drvErr) return NextResponse.json({ error: drvErr.message }, { status: 500 });
    await writeAuditLog(supabase, {
      actorId,
      entity: "guide_salary_record",
      entityId: recordId,
      action: "update",
      after: { shop_driver_paid_by_guide_vnd: v },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateShop") {
    if (row.kind !== "shop") return NextResponse.json({ error: "Доступно только для записей официального магазина" }, { status: 403 });

    const profitVnd = Math.round(parsed.data.shopProfitVnd!);
    if (profitVnd < 1) return NextResponse.json({ error: "Некорректная сумма" }, { status: 400 });

    const guideDefinesSplit = !isGuideRole;
    const officePercent = guideDefinesSplit ? Math.round(parsed.data.shopOfficePercent ?? 40) : 100;
    const driverPercent = guideDefinesSplit ? Math.round(parsed.data.shopDriverPercent ?? 20) : 0;
    const guidePercent = guideDefinesSplit ? Math.max(0, 100 - officePercent - driverPercent) : 0;
    if (officePercent + driverPercent > 100) {
      return NextResponse.json({ error: "Сумма % офиса и водителя не больше 100" }, { status: 400 });
    }
    const officeVnd = Math.round((profitVnd * officePercent) / 100);
    const driverVnd = Math.round((profitVnd * driverPercent) / 100);
    const computedGuideVnd = profitVnd - officeVnd - driverVnd;
    if (computedGuideVnd < 0) return NextResponse.json({ error: "Некорректное распределение процентов" }, { status: 400 });

    const whereFromPatch = parsed.data.whereNote?.trim();
    const prevWhere = (() => {
      const n = row.note ?? "";
      const idx = n.indexOf("где/за что:");
      if (idx < 0) return "";
      return n.slice(idx + "где/за что:".length).trim();
    })();
    const shopWhere = ((whereFromPatch ?? prevWhere) || "Официальный магазин").trim();
    const settlementFromPatch = parsed.data.settlement;
    const prevSettlement = (() => {
      const m = (row.note ?? "").match(/расчет=(guide_kept|office_received)/i);
      return m ? String(m[1]).toLowerCase() : "";
    })();
    const settlement = (settlementFromPatch ?? (prevSettlement || "guide_kept")).trim();

    const newNote = [
      "[shop-extra]",
      `получено=${profitVnd}`,
      `офис=${officePercent}%(${officeVnd})`,
      `водитель=${driverPercent}%(${driverVnd})`,
      `гид=${guidePercent}%(${computedGuideVnd})`,
      ...(guideDefinesSplit ? [] : ["черновик=await_accountant_split"]),
      `расчет=${settlement}`,
      `где/за что: ${shopWhere}`,
    ].join(" · ");

    let newAttachment: string | null | undefined = undefined;
    if ("attachmentDataUrl" in parsed.data && typeof parsed.data.attachmentDataUrl === "string") {
      const raw = parsed.data.attachmentDataUrl.trim();
      if (raw.length > 0) {
        const url = parseExpenseImageDataUrl(parsed.data.attachmentDataUrl);
        if (!url) return NextResponse.json({ error: "Некорректное фото: нужен JPEG/PNG/WebP до ~2 МБ." }, { status: 400 });
        newAttachment = url;
      }
    }

    const sel = await supabase.from("guide_salary_records").select("attachment_url").eq("id", recordId).maybeSingle();
    const currentUrl = (sel.data as { attachment_url?: string | null } | null)?.attachment_url ?? null;
    if (newAttachment === undefined && !currentUrl) {
      return NextResponse.json({ error: "Нужно фото чека или оставьте существующее (ошибка записи без вложения)" }, { status: 400 });
    }

    const baseUpdate: Record<string, unknown> = {
      amount_vnd: computedGuideVnd,
      note: newNote,
      ...(newAttachment !== undefined ? { attachment_url: newAttachment } : {}),
      shop_accountant_confirmed_at: null,
      shop_accountant_guide_vnd: null,
      shop_accountant_office_vnd: null,
    };
    let { error: upErr } = await supabase.from("guide_salary_records").update(baseUpdate).eq("id", recordId);
    if (upErr && /shop_accountant|column|does not exist/i.test(String(upErr.message))) {
      const legacy = { ...baseUpdate };
      delete legacy.shop_accountant_confirmed_at;
      delete legacy.shop_accountant_guide_vnd;
      delete legacy.shop_accountant_office_vnd;
      ({ error: upErr } = await supabase.from("guide_salary_records").update(legacy).eq("id", recordId));
    }
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actorId,
      entity: "guide_salary_record",
      entityId: recordId,
      action: "update",
      after: { tour_id: tourId, guide_id: guideId, kind: "shop", amount_vnd: computedGuideVnd },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const role = session.role as string;
  const isGuideRole = GUIDE_EXTRA_ROLES.includes(role as (typeof GUIDE_EXTRA_ROLES)[number]);
  const isLeadershipRole = GUIDE_EXTRA_LEADERSHIP_ROLES.includes(role as (typeof GUIDE_EXTRA_LEADERSHIP_ROLES)[number]);
  if (!isGuideRole && !isLeadershipRole) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  const { data: tourMeta, error: tourErr } = await supabase.from("tours").select("id,status").eq("id", tourId).maybeSingle();
  if (tourErr || !tourMeta) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
  const tourClosed = String((tourMeta as { status?: string }).status || "").toLowerCase() === "completed";
  if (isGuideRole) {
    const onTour = await isUserAssignedGuideOnTour(tourId, session.id);
    if (!onTour) return NextResponse.json({ error: "Вы не назначены гидом на этот тур" }, { status: 403 });
    if (tourClosed) {
      return NextResponse.json({ error: "Карточка тура закрыта: правки доступны только руководству" }, { status: 403 });
    }
  }

  const json = await request.json();
  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const actorId = actorUuidOrNull(session.id);
  const guideId = actorId;
  if (!guideId) return NextResponse.json({ error: "Нужен UUID гида" }, { status: 400 });

  const { recordId } = parsed.data;
  const { data: row, error: selErr } = await supabase
    .from("guide_salary_records")
    .select("id,tour_id,guide_id,kind,status")
    .eq("id", recordId)
    .maybeSingle();

  if (selErr || !row) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  if (row.tour_id !== tourId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (isGuideRole && row.guide_id !== guideId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (row.kind !== "levals" && row.kind !== "shop") {
    return NextResponse.json({ error: "Удаление доступно только для магазина или вне-магазина" }, { status: 403 });
  }
  if (row.status === "paid" && row.kind !== "shop") {
    return NextResponse.json(
      { error: "Удаление запрещено: запись уже отмечена выплаченной / забранной" },
      { status: 403 },
    );
  }

  const { error: delErr } = await supabase.from("guide_salary_records").delete().eq("id", recordId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: recordId,
    action: "delete",
    after: { tour_id: tourId, guide_id: guideId, kind: row.kind },
  });

  return NextResponse.json({ ok: true });
}
