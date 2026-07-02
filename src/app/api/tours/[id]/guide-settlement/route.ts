import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getTourGuideSettlementBreakdownForTour } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ACCOUNTANT_TOUR_SALARY_KIND } from "@/lib/sync-accountant-tour-salary-record";

const proofSchema = z
  .string()
  .max(2048)
  .optional()
  .nullable()
  .transform((s) => (s == null || String(s).trim() === "" ? null : String(s).trim()))
  .refine((s) => s === null || /^https?:\/\//i.test(s), { message: "Ссылка на чек: только http(s) или пусто" });

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm_guide_paid_office"),
    confirm: z.literal(true),
    proofUrl: proofSchema,
  }),
  z.object({
    action: z.literal("confirm_office_paid_guide"),
    confirm: z.literal(true),
    /** Сумма расхода из кассы (₫), не больше долга офиса гиду */
    amountVnd: z.number().int().positive().max(9_999_999_999),
    paymentKind: z.enum(["cash", "bank_transfer"]),
    proofUrl: proofSchema,
    /** Если true - закрыть расчёт по туру (только при полной оплате долга) */
    closeSettlement: z.boolean().optional().default(true),
  }),
]);

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "accountant") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const breakdown = await getTourGuideSettlementBreakdownForTour(tourId);
  if (!breakdown) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const gOwes = breakdown.guideOwesAfterSalaryVnd;
  const oOwes = breakdown.officeOwesAfterSalaryVnd;
  if (parsed.data.action === "confirm_guide_paid_office") {
    if (gOwes <= 0) {
      return NextResponse.json(
        { error: "По расчёту гид не должен офису (или баланс 0). Используйте подтверждение выплаты гиду, если офис должен гиду." },
        { status: 400 },
      );
    }
  } else {
    if (oOwes <= 0) {
      return NextResponse.json(
        { error: "По расчёту офис не должен гиду (или баланс 0). Используйте подтверждение сдачи от гида, если гид должен офису." },
        { status: 400 },
      );
    }
    const amt = parsed.data.action === "confirm_office_paid_guide" ? parsed.data.amountVnd : 0;
    if (amt > Math.round(oOwes)) {
      return NextResponse.json({ error: "Сумма больше долга офиса гиду по расчёту." }, { status: 400 });
    }
  }

  const { data: tourRow, error: selErr } = await supabase
    .from("tours")
    .select(
      "id,guide_settlement_guide_paid_office_at,guide_settlement_office_paid_guide_at",
    )
    .eq("id", tourId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selErr) {
    if (/guide_settlement_|column|does not exist/i.test(String(selErr.message))) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонки guide_settlement_* в tours." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!tourRow) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const tr = tourRow as {
    guide_settlement_guide_paid_office_at: string | null;
    guide_settlement_office_paid_guide_at: string | null;
  };

  const nowIso = new Date().toISOString();
  const proofUrl = parsed.data.proofUrl;

  if (parsed.data.action === "confirm_guide_paid_office") {
    if (tr.guide_settlement_guide_paid_office_at) {
      return NextResponse.json({ error: "Сдача от гида уже зафиксирована. Обратитесь к администратору для сброса." }, { status: 400 });
    }
    if (tr.guide_settlement_office_paid_guide_at) {
      return NextResponse.json({ error: "Сначала снимите подтверждение выплаты гиду (через администратора), либо не смешивайте оба направления." }, { status: 400 });
    }
    const patch = {
      guide_settlement_guide_paid_office_at: nowIso,
      guide_settlement_guide_paid_office_proof_url: proofUrl,
    };
    const { error: upErr } = await supabase.from("tours").update(patch).eq("id", tourId);
    if (upErr) {
      if (/guide_settlement_|column|does not exist/i.test(String(upErr.message))) {
        return NextResponse.json({ error: "Миграция guide_settlement_* не применена." }, { status: 500 });
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    await writeAuditLog(supabase, {
      actorId: actorUuidOrNull(session.id),
      entity: "tour",
      entityId: tourId,
      action: "guide_settlement_guide_paid_office",
      after: patch,
    });
    return NextResponse.json({ ok: true });
  }

  if (tr.guide_settlement_office_paid_guide_at) {
    return NextResponse.json({ error: "Выплата гиду уже зафиксирована." }, { status: 400 });
  }
  if (tr.guide_settlement_guide_paid_office_at) {
    return NextResponse.json({ error: "Уже зафиксирована сдача от гида - противоречие. Обратитесь к администратору." }, { status: 400 });
  }

  const officeData = parsed.data as {
    action: "confirm_office_paid_guide";
    amountVnd: number;
    paymentKind: "cash" | "bank_transfer";
    proofUrl: string | null;
    closeSettlement?: boolean;
  };
  const oweRounded = Math.round(oOwes);
  const wantClose = officeData.closeSettlement !== false;
  if (wantClose && officeData.amountVnd !== oweRounded) {
    return NextResponse.json(
      {
        error: `Чтобы закрыть расчёт по туру, сумма должна равняться остатку к выплате (${oweRounded.toLocaleString("ru-RU")} ₫). Либо снимите закрытие и запишите частичный расход.`,
      },
      { status: 400 },
    );
  }

  const actorId = actorUuidOrNull(session.id);
  const manualRow: Record<string, unknown> = {
    direction: "out",
    amount_vnd: officeData.amountVnd,
    title: "Выплата гиду по расчёту тура",
    note: wantClose ? "Закрытие расчёта с гидом (офис → гид)" : "Частичная выплата гиду по расчёту тура",
    tour_id: tourId,
    created_by: actorId,
    currency_code: "VND",
    payment_kind: officeData.paymentKind,
    amount_foreign: null,
    fx_rate_to_vnd: null,
  };
  if (officeData.proofUrl) manualRow.attachment_url = officeData.proofUrl;

  const { error: manErr } = await supabase.from("cash_manual_ledger_entries").insert([manualRow]);
  if (manErr) {
    if (/cash_manual_ledger|does not exist/i.test(String(manErr.message))) {
      return NextResponse.json({ error: "Таблица ручных операций кассы не найдена." }, { status: 503 });
    }
    return NextResponse.json({ error: manErr.message }, { status: 500 });
  }

  if (!wantClose) {
    await writeAuditLog(supabase, {
      actorId,
      entity: "tour",
      entityId: tourId,
      action: "guide_settlement_office_paid_guide_partial_ledger",
      after: { amount_vnd: officeData.amountVnd, payment_kind: officeData.paymentKind },
    });
    return NextResponse.json({ ok: true, ledgerOnly: true });
  }

  const patch = {
    guide_settlement_office_paid_guide_at: nowIso,
    guide_settlement_office_paid_guide_proof_url: officeData.proofUrl,
  };
  const { error: upErr } = await supabase.from("tours").update(patch).eq("id", tourId);
  if (upErr) {
    if (/guide_settlement_|column|does not exist/i.test(String(upErr.message))) {
      return NextResponse.json({ error: "Миграция guide_settlement_* не применена." }, { status: 500 });
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  await supabase
    .from("guide_salary_records")
    .update({ status: "paid", paid_at: nowIso, paid_by: actorId })
    .eq("tour_id", tourId)
    .eq("kind", ACCOUNTANT_TOUR_SALARY_KIND)
    .neq("status", "paid");
  await writeAuditLog(supabase, {
    actorId,
    entity: "tour",
    entityId: tourId,
    action: "guide_settlement_office_paid_guide",
    after: patch,
  });
  return NextResponse.json({ ok: true });
}
