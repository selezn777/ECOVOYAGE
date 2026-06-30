import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { parseShopExtraNote } from "@/lib/shop-salary-note-parse";

const bodySchema = z
  .object({
    guideVnd: z.number().int().min(0).max(9_999_999_999).optional(),
    guidePercent: z.number().min(0).max(100).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.guideVnd == null && d.guidePercent == null) {
      ctx.addIssue({ code: "custom", message: "Нужна сумма гиду (guideVnd) или процент (guidePercent)" });
    }
    if (d.guideVnd != null && d.guidePercent != null) {
      ctx.addIssue({ code: "custom", message: "Укажите только guideVnd или только guidePercent" });
    }
  });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const { id: recordId } = await ctx.params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  const actorId = actorUuidOrNull(session.id);

  const sel = await supabase
    .from("guide_salary_records")
    .select("id,tour_id,guide_id,kind,status,note,amount_vnd,shop_driver_paid_by_guide_vnd")
    .eq("id", recordId)
    .maybeSingle();
  if (sel.error || !sel.data) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  const row = sel.data as {
    tour_id: string;
    guide_id: string;
    kind: string;
    note: string | null;
    amount_vnd: number | string;
    shop_driver_paid_by_guide_vnd?: number | string | null;
  };
  if (row.kind !== "shop") return NextResponse.json({ error: "Только официальный магазин" }, { status: 400 });

  const parsedNote = parseShopExtraNote(row.note);
  const profitVnd = parsedNote.profitVnd ?? 0;
  if (profitVnd < 1) return NextResponse.json({ error: "В записи нет суммы магазина" }, { status: 400 });

  const driverFromCol =
    row.shop_driver_paid_by_guide_vnd != null && row.shop_driver_paid_by_guide_vnd !== ""
      ? Math.round(Number(row.shop_driver_paid_by_guide_vnd))
      : null;
  const driverPaid =
    driverFromCol != null && Number.isFinite(driverFromCol) && driverFromCol >= 0
      ? driverFromCol
      : Math.max(0, parsedNote.driverVnd ?? 0);

  let guideVnd: number;
  if (parsed.data.guidePercent != null) {
    guideVnd = Math.round((profitVnd * parsed.data.guidePercent) / 100);
  } else {
    guideVnd = Math.round(parsed.data.guideVnd ?? 0);
  }

  const officeVnd = profitVnd - guideVnd - driverPaid;
  if (officeVnd < 0) {
    return NextResponse.json(
      { error: `Офис получится отрицательным (${officeVnd}). Проверьте сумму гиду и водителю (${driverPaid}).` },
      { status: 400 },
    );
  }
  if (guideVnd < 0) return NextResponse.json({ error: "Сумма гиду не может быть отрицательной" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    amount_vnd: guideVnd,
    shop_accountant_guide_vnd: guideVnd,
    shop_accountant_office_vnd: officeVnd,
    shop_accountant_confirmed_at: nowIso,
  };

  const { error } = await supabase.from("guide_salary_records").update(patch).eq("id", recordId);
  if (error && /shop_accountant_guide_vnd|column|does not exist/i.test(String(error.message))) {
    return NextResponse.json({ error: "Выполните миграцию БД: shop_accountant_* в guide_salary_records." }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actorId,
    entity: "guide_salary_record",
    entityId: recordId,
    action: "shop_accountant_split",
    after: { guide_vnd: guideVnd, office_vnd: officeVnd, profit_vnd: profitVnd },
  });

  return NextResponse.json({ ok: true, guideVnd, officeVnd, profitVnd, driverPaid });
}
