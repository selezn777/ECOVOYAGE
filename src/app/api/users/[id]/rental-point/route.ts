import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { canAssignManagerSalesPoint } from "@/lib/role-policy";
import { localDateString } from "@/lib/scheduling";

const bodySchema = z.object({
  rentalPointId: z.union([z.string().uuid(), z.null()]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canAssignManagerSalesPoint(session.role)) {
    return apiDenied();
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  const { data: target, error: loadErr } = await supabase
    .from("users")
    .select("id,role,full_name,rental_point_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (target.role !== "manager") {
    return NextResponse.json({ error: "Только для менеджеров по продажам" }, { status: 400 });
  }

  const nextId = parsed.data.rentalPointId;
  if (nextId) {
    const today = localDateString();
    const { data: offToday, error: offErr } = await supabase
      .from("manager_days_off")
      .select("id")
      .eq("manager_id", id)
      .eq("day_off", today)
      .limit(1);
    if (offErr) {
      return NextResponse.json({ error: offErr.message }, { status: 500 });
    }
    if (offToday && offToday.length > 0) {
      return NextResponse.json(
        { error: "Нельзя назначить точку: у сотрудника выходной на сегодня." },
        { status: 409 },
      );
    }
  }
  if (nextId) {
    const { data: pt, error: ptErr } = await supabase.from("rental_points").select("id").eq("id", nextId).maybeSingle();
    if (ptErr || !pt) {
      return NextResponse.json({ error: "Точка не найдена" }, { status: 400 });
    }
  }

  const { error: updErr } = await supabase.from("users").update({ rental_point_id: nextId }).eq("id", id);
  if (updErr) {
    if (/rental_point_id|column|does not exist/i.test(String(updErr.message))) {
      return NextResponse.json({ error: "Выполните миграцию БД: rental_point_id у users." }, { status: 503 });
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);
  await writeAuditLog(supabase, {
    actorId,
    entity: "users",
    entityId: id,
    action: "manager_rental_point",
    before: { rental_point_id: (target as { rental_point_id?: string | null }).rental_point_id ?? null },
    after: { rental_point_id: nextId, full_name: (target as { full_name?: string }).full_name },
  });

  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true, rentalPointId: nextId });
}
