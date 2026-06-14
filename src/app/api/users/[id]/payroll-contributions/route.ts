import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canManageEmployeePayrollTaxes } from "@/lib/role-policy";

const ymd = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]);

const bodySchema = z.object({
  payrollContributionBaseVnd: z.union([z.number().int().min(0).max(9_999_999_999), z.null()]).optional(),
  payrollPersonalIncomeTaxPercent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  payrollPensionExtraPercent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  payrollSocialEmployeePercent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  payrollSocialEmployerPercent: z.union([z.number().min(0).max(100), z.null()]).optional(),
  vietnamMrotZone: z.union([z.enum(["I", "II", "III", "IV"]), z.null(), z.literal("")]).optional(),
  /** Дата фиксации удержания НДФЛ (YYYY-MM-DD) или пусто/null - сбросить. */
  payrollIncomeTaxWithheldOn: ymd.optional(),
  /** Дата фиксации подачи декларации (YYYY-MM-DD) или пусто/null - сбросить. */
  payrollTaxDeclarationFiledOn: ymd.optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageEmployeePayrollTaxes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const patch: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.payrollContributionBaseVnd !== undefined) {
    patch.payroll_contribution_base_vnd = d.payrollContributionBaseVnd;
  }
  if (d.payrollPersonalIncomeTaxPercent !== undefined) {
    patch.payroll_personal_income_tax_percent = d.payrollPersonalIncomeTaxPercent;
  }
  if (d.payrollPensionExtraPercent !== undefined) {
    patch.payroll_pension_extra_percent = d.payrollPensionExtraPercent;
  }
  if (d.payrollSocialEmployeePercent !== undefined) {
    patch.payroll_social_employee_percent = d.payrollSocialEmployeePercent;
  }
  if (d.payrollSocialEmployerPercent !== undefined) {
    patch.payroll_social_employer_percent = d.payrollSocialEmployerPercent;
  }
  if (d.vietnamMrotZone !== undefined) {
    patch.vietnam_mrot_zone = d.vietnamMrotZone === "" || d.vietnamMrotZone === null ? null : d.vietnamMrotZone;
  }
  if (d.payrollIncomeTaxWithheldOn !== undefined) {
    const v = d.payrollIncomeTaxWithheldOn;
    patch.payroll_income_tax_withheld_at =
      v === null || v === "" ? null : `${v}T12:00:00.000Z`;
  }
  if (d.payrollTaxDeclarationFiledOn !== undefined) {
    const v = d.payrollTaxDeclarationFiledOn;
    patch.payroll_tax_declaration_filed_at =
      v === null || v === "" ? null : `${v}T12:00:00.000Z`;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const { error } = await supabase.from("users").update(patch).eq("id", id);
  if (error) {
    if (/payroll_|vietnam_mrot_zone|payroll_income_tax_withheld|payroll_tax_declaration|column|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: поля payroll в users." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
