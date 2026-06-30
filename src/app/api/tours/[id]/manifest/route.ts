import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { isUserAssignedGuideOnTour } from "@/lib/data";
import { localDateString } from "@/lib/scheduling";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isMissingNeedsAccountantReviewColumnError } from "@/lib/tour-manifest-db";

const absenceSchema = z.object({
  bookingId: z.string().uuid(),
  absentAdults: z.number().int().min(0),
  absentChildren: z.number().int().min(0),
  absentInfants: z.number().int().min(0),
  note: z.string().max(500).optional().nullable(),
});

const qty = z.number().int().min(0).max(999);

const warehouseOnlyBody = z.object({
  warehouseOnly: z.literal(true),
  rumBottles: qty,
  colaBottles: qty,
  waterBottles: qty,
  raincoatsQty: qty,
  comment: z.string().max(1000).optional().nullable(),
});

const fullBody = z.object({
  warehouseOnly: z.literal(false).optional(),
  actualPax: z.number().int().min(0),
  rumBottles: qty,
  colaBottles: qty,
  waterBottles: qty,
  raincoatsQty: qty,
  comment: z.string().max(1000).optional().nullable(),
  absences: z.array(absenceSchema),
});

async function canSaveManifest(session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, tourId: string) {
  if (session.role === "director" || session.role === "chief_manager") return true;
  if (session.role !== "guide" && session.role !== "chief_guide") return false;
  return isUserAssignedGuideOnTour(tourId, session.id);
}

function tourYmdFromStartAt(startAt: string): string {
  return String(startAt).slice(0, 10);
}

function computeNeedsReview(params: {
  isOffice: boolean;
  warehouseOnly: boolean;
  tourYmd: string;
}): boolean {
  if (params.isOffice) return false;
  if (params.warehouseOnly) return true;
  return params.tourYmd < localDateString();
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const { id: tourId } = await ctx.params;
  if (!(await canSaveManifest(session, tourId))) {
    return NextResponse.json({ error: "Нет доступа к сохранению отчёта на этом туре" }, { status: 403 });
  }

  const raw = await request.json();
  const isWhOnly = raw?.warehouseOnly === true;
  const parsed = isWhOnly ? warehouseOnlyBody.safeParse(raw) : fullBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tourRow, error: tourErr } = await supabase
    .from("tours")
    .select("id,start_at")
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();
  if (tourErr || !tourRow) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const tourYmd = tourYmdFromStartAt((tourRow as { start_at: string }).start_at);
  const isOffice = session.role === "director" || session.role === "chief_manager";
  const actorId = actorUuidOrNull(session.id);
  const nowIso = new Date().toISOString();

  if (parsed.data.warehouseOnly === true) {
    const wh = parsed.data;
    if (!isOffice && tourYmd >= localDateString()) {
      return NextResponse.json(
        { error: "Отдельное сохранение только склада доступно после даты тура. Сегодня заполните полный учёт на туре." },
        { status: 400 },
      );
    }

    const { data: existing, error: exErr } = await supabase
      .from("tour_manifests")
      .select("tour_id,comment")
      .eq("tour_id", tourId)
      .maybeSingle();
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    const needsReview = computeNeedsReview({ isOffice, warehouseOnly: true, tourYmd });

    if (!existing) {
      const { data: bookingRows, error: bookErr } = await supabase
        .from("bookings")
        .select("adults,children,infants")
        .eq("tour_id", tourId)
        .is("deleted_at", null);
      if (bookErr) return NextResponse.json({ error: "Не удалось загрузить брони тура" }, { status: 500 });
      const placeholderPax = (bookingRows as { adults: number; children: number; infants: number }[]).reduce(
        (s, r) => s + r.adults + r.children + r.infants,
        0,
      );
      const comment = wh.comment?.trim() || null;
      const insertRow = {
        tour_id: tourId,
        actual_pax: placeholderPax,
        rum_bottles: wh.rumBottles,
        cola_bottles: wh.colaBottles,
        water_bottles: wh.waterBottles,
        raincoats_qty: wh.raincoatsQty,
        comment,
        submitted_by: actorId,
        submitted_at: nowIso,
        needs_accountant_review: needsReview,
      };
      let insErr = (await supabase.from("tour_manifests").insert(insertRow)).error;
      if (insErr && isMissingNeedsAccountantReviewColumnError(insErr.message)) {
        const rest: Record<string, unknown> = { ...insertRow };
        delete rest.needs_accountant_review;
        insErr = (await supabase.from("tour_manifests").insert(rest)).error;
      }
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

      await writeAuditLog(supabase, {
        actorId,
        entity: "tour_manifest",
        entityId: tourId,
        action: "warehouse_bootstrap",
        after: {
          actual_pax: placeholderPax,
          rum_bottles: wh.rumBottles,
          cola_bottles: wh.colaBottles,
          water_bottles: wh.waterBottles,
          raincoats_qty: wh.raincoatsQty,
          needs_accountant_review: needsReview,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const nextComment =
      wh.comment?.trim() != null && wh.comment.trim() !== "" ? wh.comment.trim() : (existing as { comment?: string | null }).comment ?? null;

    const updateRow = {
      rum_bottles: wh.rumBottles,
      cola_bottles: wh.colaBottles,
      water_bottles: wh.waterBottles,
      raincoats_qty: wh.raincoatsQty,
      comment: nextComment,
      submitted_by: actorId,
      submitted_at: nowIso,
      needs_accountant_review: needsReview,
    };
    let upErr = (await supabase.from("tour_manifests").update(updateRow).eq("tour_id", tourId)).error;
    if (upErr && isMissingNeedsAccountantReviewColumnError(upErr.message)) {
      const rest: Record<string, unknown> = { ...updateRow };
      delete rest.needs_accountant_review;
      upErr = (await supabase.from("tour_manifests").update(rest).eq("tour_id", tourId)).error;
    }
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actorId,
      entity: "tour_manifest",
      entityId: tourId,
      action: "warehouse_update",
      after: {
        rum_bottles: wh.rumBottles,
        cola_bottles: wh.colaBottles,
        water_bottles: wh.waterBottles,
        raincoats_qty: wh.raincoatsQty,
        needs_accountant_review: needsReview,
      },
    });

    return NextResponse.json({ ok: true });
  }

  const data = parsed.data as z.infer<typeof fullBody>;
  const { data: bookingRows, error: bookErr } = await supabase
    .from("bookings")
    .select("id,adults,children,infants")
    .eq("tour_id", tourId)
    .is("deleted_at", null);

  if (bookErr || !bookingRows) {
    return NextResponse.json({ error: "Не удалось загрузить брони тура" }, { status: 500 });
  }

  const bookingMap = new Map(
    (bookingRows as { id: string; adults: number; children: number; infants: number }[]).map((b) => [
      b.id,
      { adults: b.adults, children: b.children, infants: b.infants },
    ]),
  );

  const seen = new Set<string>();
  const filtered = data.absences.filter((a) => {
    const t = a.absentAdults + a.absentChildren + a.absentInfants;
    return t > 0;
  });

  for (const a of filtered) {
    if (seen.has(a.bookingId)) {
      return NextResponse.json({ error: "Повтор карточки в списке неявок" }, { status: 400 });
    }
    seen.add(a.bookingId);
    const b = bookingMap.get(a.bookingId);
    if (!b) return NextResponse.json({ error: "Неизвестная карточка в неявках" }, { status: 400 });
    if (a.absentAdults > b.adults || a.absentChildren > b.children || a.absentInfants > b.infants) {
      return NextResponse.json(
        { error: "Невыход больше, чем в брони (взрослые/дети/младенцы)" },
        { status: 400 },
      );
    }
  }

  const comment = data.comment?.trim() || null;
  const needsReview = computeNeedsReview({ isOffice, warehouseOnly: false, tourYmd });

  type PrevAbs = {
    booking_id: string;
    refund_not_required: boolean;
    refund_vnd: number;
    manager_refund_acknowledged_at: string | null;
  };
  let prevByBooking = new Map<string, PrevAbs>();
  {
    const prevSel = await supabase
      .from("tour_manifest_absences")
      .select("booking_id,refund_not_required,refund_vnd,manager_refund_acknowledged_at")
      .eq("tour_id", tourId);
    if (!prevSel.error && prevSel.data) {
      prevByBooking = new Map(
        (prevSel.data as PrevAbs[]).map((r) => [
          r.booking_id,
          {
            booking_id: r.booking_id,
            refund_not_required: Boolean(r.refund_not_required),
            refund_vnd: Math.max(0, Math.round(Number(r.refund_vnd ?? 0))),
            manager_refund_acknowledged_at: r.manager_refund_acknowledged_at ?? null,
          },
        ]),
      );
    }
  }

  const { error: delErr } = await supabase.from("tour_manifest_absences").delete().eq("tour_id", tourId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const upsertRow = {
    tour_id: tourId,
    actual_pax: data.actualPax,
    rum_bottles: data.rumBottles,
    cola_bottles: data.colaBottles,
    water_bottles: data.waterBottles,
    raincoats_qty: data.raincoatsQty,
    submitted_by: actorId,
    submitted_at: nowIso,
    comment,
    needs_accountant_review: needsReview,
  };
  let manErr = (await supabase.from("tour_manifests").upsert(upsertRow, { onConflict: "tour_id" })).error;
  if (manErr && isMissingNeedsAccountantReviewColumnError(manErr.message)) {
    const rest: Record<string, unknown> = { ...upsertRow };
    delete rest.needs_accountant_review;
    manErr = (await supabase.from("tour_manifests").upsert(rest, { onConflict: "tour_id" })).error;
  }
  if (manErr) return NextResponse.json({ error: manErr.message }, { status: 500 });

  if (filtered.length > 0) {
    const insertRows = filtered.map((a) => {
      const prev = prevByBooking.get(a.bookingId);
      return {
        tour_id: tourId,
        booking_id: a.bookingId,
        absent_adults: a.absentAdults,
        absent_children: a.absentChildren,
        absent_infants: a.absentInfants,
        refund_not_required: prev?.refund_not_required ?? false,
        refund_vnd: prev?.refund_vnd ?? 0,
        manager_refund_acknowledged_at: prev?.manager_refund_acknowledged_at ?? null,
        note: a.note?.trim() || null,
      };
    });
    const { error: insErr } = await supabase.from("tour_manifest_absences").insert(insertRows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_manifest",
    entityId: tourId,
    action: "upsert",
    after: {
      actual_pax: data.actualPax,
      rum_bottles: data.rumBottles,
      cola_bottles: data.colaBottles,
      water_bottles: data.waterBottles,
      raincoats_qty: data.raincoatsQty,
      absences: filtered.length,
      needs_accountant_review: needsReview,
    },
  });

  return NextResponse.json({ ok: true });
}
