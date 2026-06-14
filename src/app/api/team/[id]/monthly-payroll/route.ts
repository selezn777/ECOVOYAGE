import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canManageEmployeePayrollTaxes } from "@/lib/role-policy";

const ymd = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]);

const bodySchema = z.object({
  periodYm: z.string().regex(/^\d{4}-\d{2}$/),
  calculationDate: ymd.optional(),
  grossSalaryVnd: z.number().int().min(0).max(9_999_999_999),
  personalIncomeTaxVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  socialInsuranceEmployeeVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  socialInsuranceEmployerVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  netSalaryVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  paidDate: ymd.optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageEmployeePayrollTaxes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: u } = await supabase.from("users").select("id").eq("id", employeeId).maybeSingle();
  if (!u) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });

  const d = parsed.data;
  const pit = d.personalIncomeTaxVnd ?? 0;
  const se = d.socialInsuranceEmployeeVnd ?? 0;
  const sm = d.socialInsuranceEmployerVnd ?? 0;
  const net = d.netSalaryVnd ?? 0;
  const calc =
    d.calculationDate === "" || d.calculationDate === null || d.calculationDate === undefined ? null : d.calculationDate;
  const paid = d.paidDate === "" || d.paidDate === null || d.paidDate === undefined ? null : d.paidDate;

  const nowIso = new Date().toISOString();
  const baseRow = {
    calculation_date: calc,
    gross_salary_vnd: d.grossSalaryVnd,
    personal_income_tax_vnd: pit,
    social_insurance_employee_vnd: se,
    social_insurance_employer_vnd: sm,
    net_salary_vnd: net,
    paid_date: paid,
    note: d.note?.trim() || null,
    updated_at: nowIso,
  };

  const { data: existing } = await supabase
    .from("employee_monthly_payroll_records")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("period_ym", d.periodYm)
    .maybeSingle();

  let rowId: string | null = null;
  let error: { message?: string } | null = null;

  if (existing && (existing as { id: string }).id) {
    rowId = (existing as { id: string }).id;
    const up = await supabase.from("employee_monthly_payroll_records").update(baseRow).eq("id", rowId);
    error = up.error;
  } else {
    const ins = await supabase
      .from("employee_monthly_payroll_records")
      .insert([
        {
          employee_id: employeeId,
          period_ym: d.periodYm,
          ...baseRow,
          created_by: actorUuidOrNull(session.id),
        },
      ])
      .select("id")
      .maybeSingle();
    error = ins.error;
    rowId = (ins.data as { id?: string } | null)?.id ?? null;
  }

  if (error) {
    const msg = String(error.message || "");
    if (/employee_monthly_payroll|relation|does not exist/i.test(msg)) {
      return NextResponse.json({ error: "Выполните миграцию БД: employee_monthly_payroll_records." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "employee_monthly_payroll_record",
    entityId: rowId ?? "unknown",
    action: "upsert",
    after: { employee_id: employeeId, period_ym: d.periodYm, gross_salary_vnd: d.grossSalaryVnd },
  });

  return NextResponse.json({ ok: true, id: rowId });
}
