import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  }
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role as Role)) {
    return NextResponse.json({ error: "Нет доступа (только бухгалтерия)" }, { status: 403 });
  }

  const { id: employeeId, rid: bonusId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^[0-9a-f-]{36}$/i.test(bonusId)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  }

  const { data: bonus, error: bErr } = await supabase
    .from("employee_bonus_records")
    .select("id,employee_id,amount_vnd,note,paid_at")
    .eq("id", bonusId)
    .maybeSingle();

  if (bErr) {
    const msg = String(bErr.message || "");
    if (/employee_bonus|relation|does not exist/i.test(msg)) {
      return NextResponse.json({ error: "Выполните миграцию БД: employee_bonus_records." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const b = bonus as {
    id: string;
    employee_id: string;
    amount_vnd: number | string;
    note: string | null;
    paid_at: string | null;
  } | null;

  if (!b || b.employee_id !== employeeId) {
    return NextResponse.json({ error: "Начисление не найдено" }, { status: 404 });
  }
  if (b.paid_at) {
    return NextResponse.json({ error: "Премия уже выплачена" }, { status: 400 });
  }

  const amountVnd = Math.round(Number(b.amount_vnd || 0));
  if (amountVnd <= 0) {
    return NextResponse.json({ error: "Некорректная сумма" }, { status: 400 });
  }

  const { data: userRow } = await supabase.from("users").select("full_name").eq("id", employeeId).maybeSingle();
  const employeeName = String((userRow as { full_name?: string } | null)?.full_name || "Сотрудник");

  const actorId = actorUuidOrNull(session.id);
  const nowIso = new Date().toISOString();
  const noteExtra = b.note?.trim()
    ? `${b.note.trim()}\n`
    : "";
  const noteCombined = `${noteExtra}Начисление премии (id): ${bonusId}\nСотрудник: ${employeeName} (${employeeId})`;

  const rowInsert: Record<string, unknown> = {
    direction: "out",
    amount_vnd: amountVnd,
    title: `Премия: ${employeeName}`,
    note: noteCombined,
    created_by: actorId,
    currency_code: "VND",
    payment_kind: "cash",
    amount_foreign: null,
    fx_rate_to_vnd: null,
    employee_id: employeeId,
    ledger_bucket: "standard",
    ledger_bucket_ok_at: nowIso,
    ledger_bucket_ok_by: actorId,
  };

  let { data: ledgerIns, error: insErr } = await supabase
    .from("cash_manual_ledger_entries")
    .insert([rowInsert])
    .select("id")
    .maybeSingle();

  if (insErr && /employee_id|column|does not exist/i.test(String(insErr.message))) {
    const noEmp = { ...rowInsert };
    delete noEmp.employee_id;
    const retryEmp = await supabase.from("cash_manual_ledger_entries").insert([noEmp]).select("id").maybeSingle();
    ledgerIns = retryEmp.data;
    insErr = retryEmp.error;
  }

  if (insErr && /ledger_bucket/i.test(String(insErr.message))) {
    const legacy = { ...rowInsert };
    delete legacy.ledger_bucket;
    delete legacy.ledger_bucket_ok_at;
    delete legacy.ledger_bucket_ok_by;
    const retry = await supabase.from("cash_manual_ledger_entries").insert([legacy]).select("id").maybeSingle();
    ledgerIns = retry.data;
    insErr = retry.error;
  }

  if (insErr) {
    const msg = String(insErr.message || "");
    if (/employee_id|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: employee_id в cash_manual_ledger_entries." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg || "Не удалось записать в кассу" }, { status: 500 });
  }

  const ledgerId = (ledgerIns as { id?: string } | null)?.id ?? null;
  if (!ledgerId) {
    return NextResponse.json({ error: "Не получен id проводки" }, { status: 500 });
  }

  const { error: upErr } = await supabase
    .from("employee_bonus_records")
    .update({
      paid_at: nowIso,
      cash_manual_ledger_entry_id: ledgerId,
    })
    .eq("id", bonusId)
    .is("paid_at", null);

  if (upErr) {
    await supabase.from("cash_manual_ledger_entries").delete().eq("id", ledgerId);
    return NextResponse.json({ error: upErr.message || "Не удалось отметить выплату" }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "employee_bonus_record",
    entityId: bonusId,
    action: "pay",
    after: { cash_manual_ledger_entry_id: ledgerId, amount_vnd: amountVnd, employee_id: employeeId },
  });

  return NextResponse.json({ ok: true, ledgerEntryId: ledgerId });
}
