import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncAccountantTourSalaryGuideRecord } from "@/lib/sync-accountant-tour-salary-record";

const salaryField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((val): number | null | undefined => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === "number") {
      if (!Number.isFinite(val)) return null;
      return Math.max(0, Math.round(val));
    }
    const s = String(val).replace(/[^\d]/g, "");
    if (s === "") return null;
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  });

const bodySchema = z.object({
  accountantGuideSalaryVnd: salaryField,
  accountantSalarySheetJson: z.string().nullable().optional(),
  accountantDispatchExpensesNote: z.string().max(4000).nullable().optional(),
  /** true = зафиксировать время проверки блока; false = снять отметку */
  accountantDispatchExpensesReviewed: z.boolean().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "accountant") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id: tourId } = await ctx.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data: tour, error: selErr } = await supabase.from("tours").select("id").eq("id", tourId).is("deleted_at", null).maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!tour) return NextResponse.json({ error: "Тур не найден" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.accountantGuideSalaryVnd !== undefined) {
    const v = parsed.data.accountantGuideSalaryVnd;
    if (v === null || v === 0) patch.accountant_guide_salary_vnd = null;
    else patch.accountant_guide_salary_vnd = v;
  }
  if (parsed.data.accountantSalarySheetJson !== undefined) {
    const s = parsed.data.accountantSalarySheetJson;
    patch.accountant_salary_sheet_json = s == null || s.trim() === "" ? null : s.trim();
  }
  if (parsed.data.accountantDispatchExpensesNote !== undefined) {
    const s = parsed.data.accountantDispatchExpensesNote;
    patch.accountant_dispatch_expenses_note = s == null || s.trim() === "" ? null : s.trim();
  }
  if (parsed.data.accountantDispatchExpensesReviewed === true) {
    patch.accountant_dispatch_expenses_reviewed_at = new Date().toISOString();
  } else if (parsed.data.accountantDispatchExpensesReviewed === false) {
    patch.accountant_dispatch_expenses_reviewed_at = null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
  }

  const { error: upErr } = await supabase.from("tours").update(patch).eq("id", tourId);
  if (upErr) {
    if (
      /accountant_guide_salary_vnd|accountant_salary_sheet_json|accountant_dispatch_expenses_note|accountant_dispatch_expenses_reviewed_at/i.test(
        String(upErr.message),
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Выполните миграцию БД: колонки accountant_* в tours (в т.ч. accountant_dispatch_expenses_*).",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const actorId = actorUuidOrNull(session.id);

  // Salary sheet is global for all tours: one table, shared everywhere.
  if (parsed.data.accountantSalarySheetJson !== undefined) {
    const globalSheetValue = patch.accountant_salary_sheet_json ?? null;
    const { error: globalErr } = await supabase
      .from("tours")
      .update({ accountant_salary_sheet_json: globalSheetValue })
      .is("deleted_at", null);
    if (globalErr && !/accountant_salary_sheet_json|column|does not exist/i.test(String(globalErr.message))) {
      return NextResponse.json({ error: globalErr.message }, { status: 500 });
    }
  }

  if (parsed.data.accountantGuideSalaryVnd !== undefined && actorId) {
    const sync = await syncAccountantTourSalaryGuideRecord(
      supabase,
      tourId,
      parsed.data.accountantGuideSalaryVnd,
      actorId,
    );
    if (!sync.ok) {
      return NextResponse.json(
        { error: `Тур обновлён, но запись для гида не создана: ${sync.message}` },
        { status: 500 },
      );
    }
    revalidatePath("/team");
    revalidatePath("/dashboard");
    if (sync.affectedGuideId) revalidatePath(`/team/${sync.affectedGuideId}`);
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour",
    entityId: tourId,
    action: "accountant_fields",
    after: patch,
  });

  revalidatePath(`/tours/${tourId}/accounting`);
  revalidatePath(`/tours/${tourId}`);
  revalidatePath("/tours");
  revalidatePath("/dashboard");
  revalidatePath("/accounting");

  const out: {
    ok: true;
    accountantGuideSalaryVnd?: number | null;
  } = { ok: true };
  if (parsed.data.accountantGuideSalaryVnd !== undefined) {
    const v = parsed.data.accountantGuideSalaryVnd;
    out.accountantGuideSalaryVnd = v === null || v === 0 ? null : v;
  }

  return NextResponse.json(out);
}
