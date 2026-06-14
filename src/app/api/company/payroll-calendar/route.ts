import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { COMPANY_PAYROLL_CALENDAR_EDIT_ROLES } from "@/lib/role-policy";
import { getCompanyPayrollCalendar } from "@/lib/data";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const cal = await getCompanyPayrollCalendar();
  return NextResponse.json(cal ?? { managerSalaryPayoutDay: 5 });
}

const patchSchema = z.object({
  managerSalaryPayoutDay: z.number().int().min(1).max(30),
});

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!COMPANY_PAYROLL_CALENDAR_EDIT_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { error } = await supabase.from("company_payroll_calendar").upsert(
    {
      id: 1,
      manager_salary_payout_day: parsed.data.managerSalaryPayoutDay,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    if (/company_payroll_calendar|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: company_payroll_calendar." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, managerSalaryPayoutDay: parsed.data.managerSalaryPayoutDay });
}
