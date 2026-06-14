import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canManageEmployeePayrollTaxes } from "@/lib/role-policy";
import { actorUuidOrNull } from "@/lib/actor-id";

const ymd = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]);

const patchSchema = z.object({
  calculationDate: ymd.optional(),
  grossSalaryVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  personalIncomeTaxVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  socialInsuranceEmployeeVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  socialInsuranceEmployerVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  netSalaryVnd: z.number().int().min(0).max(9_999_999_999).optional(),
  paidDate: ymd.optional(),
  note: z.union([z.string().max(2000), z.null()]).optional(),
});

function mapPatchToRow(d: z.infer<typeof patchSchema>): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.calculationDate !== undefined) {
    patch.calculation_date =
      d.calculationDate === "" || d.calculationDate === null ? null : d.calculationDate;
  }
  if (d.grossSalaryVnd !== undefined) patch.gross_salary_vnd = d.grossSalaryVnd;
  if (d.personalIncomeTaxVnd !== undefined) patch.personal_income_tax_vnd = d.personalIncomeTaxVnd;
  if (d.socialInsuranceEmployeeVnd !== undefined) patch.social_insurance_employee_vnd = d.socialInsuranceEmployeeVnd;
  if (d.socialInsuranceEmployerVnd !== undefined) patch.social_insurance_employer_vnd = d.socialInsuranceEmployerVnd;
  if (d.netSalaryVnd !== undefined) patch.net_salary_vnd = d.netSalaryVnd;
  if (d.paidDate !== undefined) {
    patch.paid_date = d.paidDate === "" || d.paidDate === null ? null : d.paidDate;
  }
  if (d.note !== undefined) patch.note = d.note?.trim() || null;
  return patch;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageEmployeePayrollTaxes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: employeeId, rid } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const patch = mapPatchToRow(parsed.data);
  const meaningfulKeys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (meaningfulKeys.length === 0) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const { error } = await supabase
    .from("employee_monthly_payroll_records")
    .update(patch)
    .eq("id", rid)
    .eq("employee_id", employeeId);

  if (error) {
    const msg = String(error.message || "");
    if (/employee_monthly_payroll|relation|does not exist/i.test(msg)) {
      return NextResponse.json({ error: "Выполните миграцию БД." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "employee_monthly_payroll_record",
    entityId: rid,
    action: "update",
    after: patch,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageEmployeePayrollTaxes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id: employeeId, rid } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { error } = await supabase
    .from("employee_monthly_payroll_records")
    .delete()
    .eq("id", rid)
    .eq("employee_id", employeeId);

  if (error) {
    const msg = String(error.message || "");
    if (/employee_monthly_payroll|relation|does not exist/i.test(msg)) {
      return NextResponse.json({ error: "Выполните миграцию БД." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "employee_monthly_payroll_record",
    entityId: rid,
    action: "delete",
    after: { employee_id: employeeId },
  });

  return NextResponse.json({ ok: true });
}
