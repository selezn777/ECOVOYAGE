import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z
  .object({
    bookingId: z.string().uuid(),
    noRefund: z.boolean().optional(),
    refundVnd: z.number().int().min(0).optional(),
    refundUsd: z.number().min(0).optional(),
    usdToVndRate: z.number().min(1).max(1_000_000).optional(),
    note: z.string().max(8000).optional(),
    certificateUrl: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.string().url().optional(),
    ),
  })
  .superRefine((d, ctx) => {
    if (d.noRefund === true) {
      const extra = (d.refundVnd != null && d.refundVnd > 0) || (d.refundUsd != null && d.refundUsd > 0);
      if (extra) {
        ctx.addIssue({ code: "custom", message: "При «без возврата» не указывайте сумму." });
      }
      return;
    }
    const hasVnd = d.refundVnd != null && d.refundVnd > 0;
    const hasUsd = d.refundUsd != null && d.refundUsd > 0;
    if (!hasVnd && !hasUsd) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите noRefund: true или сумму возврата (₫ или $).",
      });
      return;
    }
    if (hasVnd && hasUsd) {
      ctx.addIssue({ code: "custom", message: "Укажите сумму только в одной валюте." });
      return;
    }
    if (hasUsd && !(d.usdToVndRate != null && d.usdToVndRate > 0)) {
      ctx.addIssue({ code: "custom", path: ["usdToVndRate"], message: "Укажите курс USD → VND." });
    }
    const noteLen = (d.note ?? "").trim().length;
    if (noteLen < 15) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Опишите причину возврата (не короче 15 символов).",
      });
    }
  });

/** Строка неявки: без новых колонок миграции запрос с refund_vnd падает - тогда читаем только базовые поля. */
async function fetchManifestAbsenceRow(
  supabase: SupabaseClient,
  tourId: string,
  bookingId: string,
): Promise<{
  row: {
    id: string;
    absent_adults: number;
    absent_children: number;
    absent_infants: number;
    refund_vnd: number;
  } | null;
  fetchError: string | null;
}> {
  const full = await supabase
    .from("tour_manifest_absences")
    .select("id,absent_adults,absent_children,absent_infants,refund_vnd")
    .eq("tour_id", tourId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!full.error && full.data) {
    const r = full.data as {
      id: string;
      absent_adults: number;
      absent_children: number;
      absent_infants: number;
      refund_vnd?: number | null;
    };
    return {
      row: {
        id: r.id,
        absent_adults: r.absent_adults,
        absent_children: r.absent_children,
        absent_infants: r.absent_infants,
        refund_vnd: Math.max(0, Math.round(Number(r.refund_vnd ?? 0))),
      },
      fetchError: null,
    };
  }

  if (
    full.error &&
    /refund_vnd|column|does not exist|schema cache|42703|PGRST204/i.test(String(full.error.message))
  ) {
    const minimal = await supabase
      .from("tour_manifest_absences")
      .select("id,absent_adults,absent_children,absent_infants")
      .eq("tour_id", tourId)
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (minimal.error) return { row: null, fetchError: minimal.error.message };
    if (!minimal.data) return { row: null, fetchError: null };
    const r = minimal.data as {
      id: string;
      absent_adults: number;
      absent_children: number;
      absent_infants: number;
    };
    return {
      row: {
        id: r.id,
        absent_adults: r.absent_adults,
        absent_children: r.absent_children,
        absent_infants: r.absent_infants,
        refund_vnd: 0,
      },
      fetchError: null,
    };
  }

  if (full.error) return { row: null, fetchError: full.error.message };
  return { row: null, fetchError: null };
}

async function sumBookingPricesVnd(supabase: SupabaseClient, bookingId: string): Promise<number> {
  const { data: rows } = await supabase.from("booking_prices").select("amount_vnd").eq("booking_id", bookingId);
  if (!rows?.length) return 0;
  return rows.reduce((s, r) => s + Number((r as { amount_vnd: number }).amount_vnd), 0);
}

/** Пересчитать сумму по прайсу (пропорционально строкам), чтобы итог = targetTotal. */
async function setBookingPricesTotalVnd(
  supabase: SupabaseClient,
  bookingId: string,
  targetTotal: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rows } = await supabase.from("booking_prices").select("id,amount_vnd").eq("booking_id", bookingId);
  if (!rows?.length) return { ok: false, error: "Нет строк в booking_prices" };
  const list = rows as { id: string; amount_vnd: number }[];
  const sum = list.reduce((s, r) => s + Number(r.amount_vnd), 0);
  if (sum <= 0) {
    const { error } = await supabase
      .from("booking_prices")
      .update({ amount_vnd: targetTotal, amount: targetTotal })
      .eq("id", list[0].id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  const factor = targetTotal / sum;
  let allocated = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const nv =
      i === list.length - 1 ? Math.max(0, targetTotal - allocated) : Math.round(Number(r.amount_vnd) * factor);
    allocated += nv;
    const { error } = await supabase.from("booking_prices").update({ amount_vnd: nv, amount: nv }).eq("id", r.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "manager") {
    return NextResponse.json({ error: "Только для менеджера" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  const raw = await request.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors ?? parsed.error.message }, { status: 400 });
  }

  const { bookingId, noRefund, refundVnd: refundVndRaw, refundUsd, usdToVndRate, note, certificateUrl } = parsed.data;
  const certUrl = certificateUrl?.trim() || null;
  const noteTrim = (note ?? "").trim() || null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (bErr || !booking) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  const b = booking as { id: string; tour_id: string; manager_id: string };
  if (b.tour_id !== tourId) return NextResponse.json({ error: "Бронь не с этого тура" }, { status: 400 });
  if (b.manager_id !== session.id) return NextResponse.json({ error: "Нет доступа к чужой брони" }, { status: 403 });

  const { row: absRow, fetchError: absenceFetchErr } = await fetchManifestAbsenceRow(supabase, tourId, bookingId);
  if (absenceFetchErr) {
    return NextResponse.json({ error: `Не удалось загрузить неявку: ${absenceFetchErr}` }, { status: 500 });
  }
  if (!absRow) {
    return NextResponse.json(
      { error: "Нет данных о неявке (гид должен сохранить учёт на туре)." },
      { status: 400 },
    );
  }

  const absentTotal = absRow.absent_adults + absRow.absent_children + absRow.absent_infants;
  if (absentTotal <= 0) {
    return NextResponse.json({ error: "По брони не указано неявок" }, { status: 400 });
  }

  const oldRefundVnd = absRow.refund_vnd;
  const currentSum = await sumBookingPricesVnd(supabase, bookingId);
  const conceptualOriginal = currentSum + oldRefundVnd;

  const actorId = actorUuidOrNull(session.id);
  const nowIso = new Date().toISOString();

  const patchAbsence = async (patch: Record<string, unknown>) => {
    const { error: upErr } = await supabase.from("tour_manifest_absences").update(patch).eq("id", absRow.id);
    if (!upErr) return { ok: true as const };
    if (/manager_refund_note|manager_refund_certificate_url|column|does not exist/i.test(String(upErr.message))) {
      const rest = { ...patch };
      delete rest.manager_refund_note;
      delete rest.manager_refund_certificate_url;
      const { error: e2 } = await supabase.from("tour_manifest_absences").update(rest).eq("id", absRow.id);
      if (e2) return { ok: false as const, error: e2.message };
      return { ok: true as const };
    }
    return { ok: false as const, error: upErr.message };
  };

  if (noRefund) {
    const up = await patchAbsence({
      refund_not_required: true,
      refund_vnd: 0,
      manager_refund_acknowledged_at: nowIso,
      manager_refund_note: null,
      manager_refund_certificate_url: null,
    });
    if (!up.ok) return NextResponse.json({ error: up.error }, { status: 500 });
    if (oldRefundVnd > 0) {
      const r = await setBookingPricesTotalVnd(supabase, bookingId, conceptualOriginal);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    }
    await writeAuditLog(supabase, {
      actorId,
      entity: "tour_manifest_absence",
      entityId: absRow.id,
      action: "manager_no_refund",
      after: { bookingId, tourId },
    });
    return NextResponse.json({ ok: true });
  }

  let newR = refundVndRaw ?? 0;
  if (refundUsd != null && refundUsd > 0) {
    const rate = usdToVndRate ?? 26000;
    newR = Math.round(refundUsd * rate);
  }
  if (newR > conceptualOriginal) {
    return NextResponse.json(
      {
        error: `Сумма возврата не больше стоимости по прайсу (${conceptualOriginal.toLocaleString("ru-RU")} ₫).`,
      },
      { status: 400 },
    );
  }
  const newTotal = Math.max(0, conceptualOriginal - newR);
  const pr = await setBookingPricesTotalVnd(supabase, bookingId, newTotal);
  if (!pr.ok) return NextResponse.json({ error: pr.error }, { status: 500 });

  const up2 = await patchAbsence({
    refund_not_required: false,
    refund_vnd: newR,
    manager_refund_acknowledged_at: nowIso,
    manager_refund_note: noteTrim,
    manager_refund_certificate_url: certUrl,
  });
  if (!up2.ok) return NextResponse.json({ error: up2.error }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_manifest_absence",
    entityId: absRow.id,
    action: "manager_refund_vnd",
    after: { bookingId, tourId, refundVnd: newR },
  });

  return NextResponse.json({ ok: true });
}
