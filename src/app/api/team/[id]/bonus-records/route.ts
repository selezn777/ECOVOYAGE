import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { EMPLOYEE_FINANCE_CARD_ACCESS_ROLES } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

const bodySchema = z.object({
  amountVnd: z.number().int().positive().max(9_999_999_999),
  note: z.string().max(2000).optional(),
  plannedPayDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  }
  if (!EMPLOYEE_FINANCE_CARD_ACCESS_ROLES.includes(session.role as Role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: employeeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  }

  const { data: u } = await supabase.from("users").select("id").eq("id", employeeId).maybeSingle();
  if (!u) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const { amountVnd, note, plannedPayDate } = parsed.data;
  const planned = plannedPayDate?.trim() ? plannedPayDate.trim() : null;
  const actorId = actorUuidOrNull(session.id);

  const row = {
    employee_id: employeeId,
    amount_vnd: amountVnd,
    note: note?.trim() || null,
    planned_pay_date: planned,
    created_by: actorId,
  };

  const { data: ins, error } = await supabase.from("employee_bonus_records").insert([row]).select("id").maybeSingle();

  if (error) {
    const msg = String(error.message || "");
    if (/employee_bonus|relation|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: employee_bonus_records." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg || "Не удалось сохранить" }, { status: 500 });
  }

  const rowId = (ins as { id?: string } | null)?.id ?? null;

  await writeAuditLog(supabase, {
    actorId,
    entity: "employee_bonus_record",
    entityId: rowId ?? "unknown",
    action: "create",
    after: { employee_id: employeeId, amount_vnd: amountVnd, planned_pay_date: planned },
  });

  return NextResponse.json({ ok: true, id: rowId });
}
