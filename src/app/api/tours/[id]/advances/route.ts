import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { triggerGoogleSheetsAutoSync } from "@/lib/google-sheets-sync";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(["issue", "return"]),
  currency: z.enum(["VND", "USD"]).optional(),
  amount: z.number().min(0.01).optional(),
  fxRateToVnd: z.number().min(0.0001).optional(),
  amountVnd: z.number().int().min(1).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (!isUuidSessionUser(session.id)) return NextResponse.json({ error: "Нужен UUID-пользователь" }, { status: 400 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id: tourId } = await ctx.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  const actorId = actorUuidOrNull(session.id);
  const currency = parsed.data.currency ?? "VND";
  const amountInput = parsed.data.amount ?? parsed.data.amountVnd ?? 0;
  const fxRateToVnd = currency === "VND" ? 1 : Number(parsed.data.fxRateToVnd ?? 0);
  if (amountInput <= 0) return NextResponse.json({ error: "Сумма должна быть больше 0" }, { status: 400 });
  if (currency === "USD" && fxRateToVnd <= 0) {
    return NextResponse.json({ error: "Для USD нужен курс > 0" }, { status: 400 });
  }
  const amountVnd =
    parsed.data.amountVnd && parsed.data.amountVnd > 0
      ? Math.round(parsed.data.amountVnd)
      : currency === "VND"
        ? Math.round(amountInput)
        : Math.round(amountInput * fxRateToVnd);

  const row = {
    tour_id: tourId,
    employee_id: parsed.data.employeeId,
    created_by: actorId,
    kind: parsed.data.kind,
    amount_vnd: amountVnd,
    currency,
    fx_rate_to_vnd: fxRateToVnd,
    status: "approved",
    note: parsed.data.note?.trim() || null,
  };

  const { data, error } = await supabase.from("tour_advances").insert([row]).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const advanceId = String(data.id);
  const ledgerTitle = parsed.data.kind === "issue" ? "Депозит выдан тургиду" : "Возврат депозита от тургида";
  const ledgerDirection = parsed.data.kind === "issue" ? "out" : "in";
  const ledgerNote = [parsed.data.note?.trim() || "", `Подотчёт по туру #${tourId}`, `advance:${advanceId}`]
    .filter(Boolean)
    .join(" · ");
  const ledgerBase: Record<string, unknown> = {
    direction: ledgerDirection,
    amount_vnd: amountVnd,
    title: ledgerTitle,
    note: ledgerNote || null,
    tour_id: tourId,
    created_by: actorId,
    currency_code: currency,
    payment_kind: "cash",
    amount_foreign: currency === "USD" ? Number(amountInput) : null,
    fx_rate_to_vnd: currency === "USD" ? fxRateToVnd : null,
    ledger_bucket: "standard",
    ledger_bucket_ok_at: new Date().toISOString(),
    ledger_bucket_ok_by: actorId,
  };

  let { error: ledgerErr } = await supabase.from("cash_manual_ledger_entries").insert([ledgerBase]);
  if (ledgerErr && /ledger_bucket|column|does not exist/i.test(String(ledgerErr.message))) {
    const legacy = { ...ledgerBase };
    delete legacy.ledger_bucket;
    delete legacy.ledger_bucket_ok_at;
    delete legacy.ledger_bucket_ok_by;
    ({ error: ledgerErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
  }
  if (ledgerErr && /currency_code|payment_kind|amount_foreign|fx_rate_to_vnd|column|does not exist/i.test(String(ledgerErr.message))) {
    const legacy = { ...ledgerBase };
    delete legacy.currency_code;
    delete legacy.payment_kind;
    delete legacy.amount_foreign;
    delete legacy.fx_rate_to_vnd;
    ({ error: ledgerErr } = await supabase.from("cash_manual_ledger_entries").insert([legacy]));
  }
  if (ledgerErr) {
    await supabase.from("tour_advances").delete().eq("id", advanceId);
    if (/cash_manual_ledger_entries|relation|does not exist/i.test(String(ledgerErr.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: cash_manual_ledger_entries." }, { status: 503 });
    }
    return NextResponse.json({ error: `Не удалось записать движение в кассу: ${ledgerErr.message}` }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_advance",
    entityId: advanceId,
    action: "create",
    after: row,
  });
  void triggerGoogleSheetsAutoSync("tour_advance_create");

  return NextResponse.json({ ok: true, id: data.id });
}

