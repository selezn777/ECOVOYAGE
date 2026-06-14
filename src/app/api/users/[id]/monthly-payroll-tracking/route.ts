import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canManageEmployeePayrollTaxes } from "@/lib/role-policy";

const bodySchema = z.object({
  enabled: z.boolean(),
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

  const { error } = await supabase
    .from("users")
    .update({ monthly_payroll_tracking_enabled: parsed.data.enabled })
    .eq("id", id);

  if (error) {
    const msg = String(error.message || "");
    if (/monthly_payroll_tracking_enabled|column|does not exist/i.test(msg)) {
      return NextResponse.json({ error: "Выполните миграцию БД: monthly_payroll_tracking_enabled в users." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
