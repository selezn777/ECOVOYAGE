import type { SupabaseClient } from "@supabase/supabase-js";

/** Запись из сводки бухгалтера - отдельный kind, чтобы не путать с магазином/levals и уметь перезаписывать одну строку на тур. */
export const ACCOUNTANT_TOUR_SALARY_KIND = "accountant_tour";

/**
 * Держит `guide_salary_records` в соответствии с `tours.accountant_guide_salary_vnd`,
 * чтобы гид видел выплату в «Доходы гида» и на финансовой карточке `/team/[id]`.
 */
export async function syncAccountantTourSalaryGuideRecord(
  supabase: SupabaseClient,
  tourId: string,
  salaryVnd: number | null | undefined,
  paidByUserId: string,
): Promise<{ ok: true; affectedGuideId: string | null } | { ok: false; message: string }> {
  const { error: delErr } = await supabase
    .from("guide_salary_records")
    .delete()
    .eq("tour_id", tourId)
    .eq("kind", ACCOUNTANT_TOUR_SALARY_KIND);
  if (delErr) return { ok: false, message: delErr.message };

  const amount = salaryVnd != null && salaryVnd > 0 ? Math.round(Number(salaryVnd)) : 0;
  if (amount <= 0) return { ok: true, affectedGuideId: null };

  const { data: tg, error: tgErr } = await supabase
    .from("tour_guides")
    .select("guide_id,is_primary")
    .eq("tour_id", tourId);

  if (tgErr) return { ok: false, message: tgErr.message };
  const rows = (tg as { guide_id: string; is_primary: boolean }[] | null) ?? [];
  const primary = rows.find((r) => r.is_primary) ?? rows[0];
  if (!primary) return { ok: true, affectedGuideId: null };

  const { error: insErr } = await supabase.from("guide_salary_records").insert({
    tour_id: tourId,
    guide_id: primary.guide_id,
    amount_vnd: amount,
    kind: ACCOUNTANT_TOUR_SALARY_KIND,
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_by: paidByUserId,
    note: "Зарплата по туру (бухгалтерия)",
  });
  if (insErr) return { ok: false, message: insErr.message };
  return { ok: true, affectedGuideId: primary.guide_id };
}
