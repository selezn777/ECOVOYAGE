import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { canSetManagerSalesCommission } from "@/lib/role-policy";

const bodySchema = z.object({
  percent: z.union([z.number().min(0).max(100), z.null()]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canSetManagerSalesCommission(session.role)) {
    return apiDenied();
  }

  const { id } = await params;
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  let { data: target, error: loadErr } = await supabase
    .from("users")
    .select("id,role,manager_mode,full_name,manager_sales_commission_percent")
    .eq("id", id)
    .maybeSingle();
  if (loadErr && /manager_mode|column|does not exist/i.test(String(loadErr.message))) {
    const legacy = await supabase
      .from("users")
      .select("id,role,full_name,manager_sales_commission_percent")
      .eq("id", id)
      .maybeSingle();
    target = legacy.data as typeof target;
    loadErr = legacy.error;
  }

  if (loadErr || !target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const targetRole = target.role;
  const targetManagerMode = target.manager_mode === true;
  const targetCanHaveManagerPct =
    targetRole === "manager" ||
    targetRole === "chief_manager" ||
    ((targetRole === "guide" || targetRole === "chief_guide") && targetManagerMode);
  if (!targetCanHaveManagerPct) {
    return NextResponse.json({ error: "Процент доступен для менеджеров и гидов в режиме менеджера" }, { status: 400 });
  }

  if (
    session.role === "chief_manager" &&
    !(
      targetRole === "manager" ||
      ((targetRole === "guide" || targetRole === "chief_guide") && targetManagerMode)
    )
  ) {
    return NextResponse.json(
      { error: "Главный менеджер задаёт процент только менеджерам по продажам и гидам в режиме менеджера." },
      { status: 403 },
    );
  }

  const next =
    parsed.data.percent === null ? null : Math.round(parsed.data.percent * 100) / 100;

  const { error: updErr } = await supabase
    .from("users")
    .update({ manager_sales_commission_percent: next })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "users",
    entityId: id,
    action: "manager_sales_commission",
    before: { manager_sales_commission_percent: target.manager_sales_commission_percent },
    after: { manager_sales_commission_percent: next, full_name: target.full_name },
  });

  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true, percent: next });
}
