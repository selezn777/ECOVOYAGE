import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const CONFIRM_TEXT = "RESET ALL DATA";
const keepLeadershipRoles = ["director", "chief_manager", "chief_guide", "accountant", "dispatcher"] as const;

const bodySchema = z.object({
  confirmText: z.string(),
});

async function wipeAllRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  markerColumn = "id",
) {
  const { error } = await supabase.from(table).delete().not(markerColumn, "is", null);
  if (!error) return;
  if (/relation .* does not exist|column .* does not exist/i.test(String(error.message))) return;
  throw new Error(`${table}: ${error.message}`);
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.baseRole !== "director") return NextResponse.json({ error: "Доступно только директору" }, { status: 403 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success || parsed.data.confirmText.trim() !== CONFIRM_TEXT) {
    return NextResponse.json({ error: `Подтверждение должно быть: ${CONFIRM_TEXT}` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  // 1) Полностью очищаем операционные данные (в порядке от зависимых к базовым)
  const deletePlan: Array<{ table: string; marker?: string }> = [
    { table: "booking_commission_shares" },
    { table: "booking_prices" },
    { table: "payments" },
    { table: "receipts" },
    { table: "tour_manifest_absences" },
    { table: "tour_manifests", marker: "tour_id" },
    { table: "tour_office_cash_handovers" },
    { table: "guide_salary_records" },
    { table: "expenses" },
    { table: "bus_assignments" },
    { table: "tour_guides" },
    { table: "tour_booking_intents" },
    { table: "bookings" },
    { table: "tours" },
    { table: "ticket_sales" },
    { table: "guide_salary_templates" },
    { table: "manager_days_off" },
    { table: "guide_days_off" },
    { table: "employee_visa_runs" },
    { table: "in_app_notifications" },
    { table: "push_subscriptions" },
    { table: "deleted_items" },
    { table: "audit_logs" },
    { table: "cash_manual_ledger_entries" },
    { table: "cash_manual_ledger_categories" },
    { table: "rental_point_expenses" },
    { table: "rental_point_closed_days" },
    { table: "rental_point_rent_payments" },
    { table: "rental_points" },
    { table: "staff_reviews" },
    { table: "manager_reviews" },
    { table: "guide_reviews" },
    { table: "tour_templates" },
    { table: "ticket_templates" },
    { table: "currency_rates" },
  ];

  for (const step of deletePlan) {
    await wipeAllRows(supabase, step.table, step.marker ?? "id");
  }

  // 2) Удаляем сотрудников, оставляя только руководство
  const removableRoles = ["manager", "guide", "booking_dispatcher"] as const;
  const { error: usersDeleteErr } = await supabase.from("users").delete().in("role", [...removableRoles]);
  if (usersDeleteErr) {
    return NextResponse.json({ error: usersDeleteErr.message }, { status: 500 });
  }

  // На случай нестандартных ролей: оставляем только whitelist + текущего директора
  const { data: allUsers, error: usersErr } = await supabase.from("users").select("id,role");
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const toDelete = (allUsers ?? [])
    .filter((u) => u.id !== session.id)
    .filter((u) => !keepLeadershipRoles.includes(String(u.role) as (typeof keepLeadershipRoles)[number]))
    .map((u) => u.id);
  if (toDelete.length > 0) {
    const { error: deleteExtraErr } = await supabase.from("users").delete().in("id", toDelete);
    if (deleteExtraErr) return NextResponse.json({ error: deleteExtraErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Система очищена. Оставлены только аккаунты руководства.",
    keptRoles: keepLeadershipRoles,
  });
}
