import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canEditCashLedger } from "@/lib/role-policy";
import { getBookingDueVndBreakdown } from "@/lib/data";

const bodySchema = z
  .object({
    direction: z.enum(["in", "out"]),
    amountVnd: z.number().int().positive().max(9_999_999_999),
    title: z.string().min(2).max(200),
    note: z.string().max(2000).optional(),
    attachmentUrl: z.string().url().max(2048).optional(),
    /** Необязательно: тур, к которому относится операция */
    tourId: z.union([z.string().uuid(), z.literal("")]).optional(),
    /** Поступление в кассу офиса по конкретной брони (онлайн-оплата в офисе); только при direction in */
    bookingId: z.union([z.string().uuid(), z.literal("")]).optional(),
    categoryId: z.union([z.string().uuid(), z.literal("")]).optional(),
    currencyCode: z
      .string()
      .min(3)
      .max(3)
      .transform((s) => s.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)),
    paymentKind: z.enum(["cash", "bank_transfer"]),
    amountForeign: z.number().positive().max(9_999_999_999).optional(),
    fxRateToVnd: z.number().positive().max(1e15).optional(),
    /** Привязка к сотруднику (карточка, отчёты) */
    employeeId: z.union([z.string().uuid(), z.literal("")]).optional(),
    /** Если сотрудник указан: зачислять ли в доход сотрудника в CRM (иначе только расход/метка) */
    employeeIncomeIncluded: z.boolean().optional(),
    /** Опционально: арендная точка (турист. офис / турточка) */
    rentalPointId: z.union([z.string().uuid(), z.literal("")]).optional(),
  })
  .superRefine((data, ctx) => {
    if (!/^[A-Z]{3}$/.test(data.currencyCode)) {
      ctx.addIssue({ code: "custom", path: ["currencyCode"], message: "Некорректный код валюты (ISO 4217, 3 буквы)." });
    }
    if (data.currencyCode === "VND") return;
    if (data.amountForeign == null || data.fxRateToVnd == null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountForeign"],
        message: "Для валюты не VND укажите сумму в валюте и курс (₫ за 1 единицу валюты).",
      });
    } else {
      const implied = Math.round(data.amountForeign * data.fxRateToVnd);
      const tol = Math.max(5000, Math.round(0.02 * data.amountVnd));
      if (Math.abs(data.amountVnd - implied) > tol) {
        ctx.addIssue({
          code: "custom",
          path: ["amountVnd"],
          message: `Сумма в ₫ не сходится с суммой в валюте × курс (ожидалось ≈ ${implied.toLocaleString("ru-RU")} ₫, допуск ±${tol.toLocaleString("ru-RU")} ₫).`,
        });
      }
    }
  });

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  }
  if (!canEditCashLedger(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  }

  const {
    direction,
    amountVnd,
    title,
    note,
    attachmentUrl,
    tourId: tourIdRaw,
    bookingId: bookingIdRaw,
    categoryId: categoryIdRaw,
    currencyCode,
    paymentKind,
    amountForeign,
    fxRateToVnd,
    employeeId: employeeIdRaw,
    employeeIncomeIncluded,
    rentalPointId: rentalPointIdRaw,
  } = parsed.data;
  const actorId = actorUuidOrNull(session.id);
  const att = attachmentUrl?.trim() || null;
  const tourIdTrim = tourIdRaw?.trim() || "";
  const bookingIdTrim = bookingIdRaw?.trim() || "";
  const categoryIdTrim = categoryIdRaw?.trim() || "";
  let categoryId: string | null = null;
  if (categoryIdTrim) {
    const { data: catRow } = await supabase
      .from("cash_manual_ledger_categories")
      .select("id")
      .eq("id", categoryIdTrim)
      .maybeSingle();
    if (!catRow) {
      return NextResponse.json({ error: "Категория не найдена" }, { status: 400 });
    }
    categoryId = categoryIdTrim;
  }
  let tourId: string | null = null;
  if (tourIdTrim) {
    const { data: tourRow } = await supabase
      .from("tours")
      .select("id")
      .eq("id", tourIdTrim)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .maybeSingle();
    if (!tourRow) {
      return NextResponse.json({ error: "Тур не найден или недоступен" }, { status: 400 });
    }
    tourId = tourIdTrim;
  }

  let bookingId: string | null = null;
  let bookingNoteSuffix = "";
  if (bookingIdTrim) {
    if (direction !== "in") {
      return NextResponse.json({ error: "Привязка к брони допустима только для поступления в кассу." }, { status: 400 });
    }
    const { data: bRow, error: bErr } = await supabase
      .from("bookings")
      .select("id,tour_id,customer_name,online_code")
      .eq("id", bookingIdTrim)
      .is("deleted_at", null)
      .maybeSingle();
    if (bErr) {
      return NextResponse.json({ error: bErr.message || "Ошибка брони" }, { status: 500 });
    }
    if (!bRow) {
      return NextResponse.json({ error: "Бронь не найдена" }, { status: 400 });
    }
    const bTour = String((bRow as { tour_id: string }).tour_id);
    if (tourId && tourId !== bTour) {
      return NextResponse.json({ error: "Выбранный тур не совпадает с туром брони" }, { status: 400 });
    }
    if (!tourId) {
      const { data: tourOk } = await supabase
        .from("tours")
        .select("id")
        .eq("id", bTour)
        .is("deleted_at", null)
        .neq("status", "deleted")
        .maybeSingle();
      if (!tourOk) {
        return NextResponse.json({ error: "Тур брони недоступен" }, { status: 400 });
      }
      tourId = bTour;
    }
    const dueRow = await getBookingDueVndBreakdown(bookingIdTrim);
    if (!dueRow) {
      return NextResponse.json({ error: "Не удалось проверить долг по брони" }, { status: 500 });
    }
    if (amountVnd > dueRow.dueVnd) {
      return NextResponse.json(
        {
          error: `Сумма не больше долга по брони: ${dueRow.dueVnd.toLocaleString("ru-RU")} ₫`,
        },
        { status: 400 },
      );
    }
    bookingId = bookingIdTrim;
    const cn = String((bRow as { customer_name?: string }).customer_name || "").trim() || "турист";
    const on = String((bRow as { online_code?: string | null }).online_code || "").trim();
    bookingNoteSuffix = on ? `Бронь: ${cn} (${on})` : `Бронь: ${cn}`;
  }

  const employeeIdTrim = employeeIdRaw?.trim() || "";
  let employeeId: string | null = null;
  if (employeeIdTrim) {
    const { data: empRow } = await supabase.from("users").select("id").eq("id", employeeIdTrim).maybeSingle();
    if (!empRow) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 400 });
    }
    employeeId = employeeIdTrim;
  }

  const incomeIncluded = employeeId ? (employeeIncomeIncluded ?? false) : null;

  const rentalPointTrim = rentalPointIdRaw?.trim() || "";
  let rentalPointId: string | null = null;
  if (rentalPointTrim) {
    const { data: rpRow } = await supabase.from("rental_points").select("id").eq("id", rentalPointTrim).maybeSingle();
    if (!rpRow) {
      return NextResponse.json({ error: "Арендная точка не найдена" }, { status: 400 });
    }
    rentalPointId = rentalPointTrim;
  }

  const isBank = paymentKind === "bank_transfer";
  const nowIso = new Date().toISOString();
  let noteBase =
    note?.trim() && bookingNoteSuffix
      ? `${note.trim()}\n${bookingNoteSuffix}`
      : note?.trim()
        ? note.trim()
        : bookingNoteSuffix || null;
  if (employeeId && incomeIncluded === false) {
    const tag = "[Операция не зачисляется в доход сотрудника в CRM]";
    noteBase = noteBase ? `${noteBase}\n${tag}` : tag;
  }

  const noteCombined = noteBase;

  const rowInsert: Record<string, unknown> = {
    direction,
    amount_vnd: amountVnd,
    title: title.trim(),
    note: noteCombined,
    ...(att ? { attachment_url: att } : {}),
    ...(tourId ? { tour_id: tourId } : {}),
    ...(bookingId ? { booking_id: bookingId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    created_by: actorId,
    currency_code: currencyCode,
    payment_kind: paymentKind,
    ...(currencyCode !== "VND" && amountForeign != null && fxRateToVnd != null
      ? { amount_foreign: amountForeign, fx_rate_to_vnd: fxRateToVnd }
      : { amount_foreign: null, fx_rate_to_vnd: null }),
    ledger_bucket: isBank ? "instrumented" : "standard",
    ledger_bucket_ok_at: isBank ? null : nowIso,
    ledger_bucket_ok_by: isBank ? null : actorId,
    ...(employeeId ? { employee_id: employeeId, employee_income_included: incomeIncluded } : {}),
    ...(rentalPointId ? { rental_point_id: rentalPointId } : {}),
  };

  let { data, error } = await supabase.from("cash_manual_ledger_entries").insert([rowInsert])
    .select("id")
    .maybeSingle();

  if (error && /ledger_bucket/i.test(String(error.message))) {
    const rowLegacy = { ...rowInsert };
    delete rowLegacy.ledger_bucket;
    delete rowLegacy.ledger_bucket_ok_at;
    delete rowLegacy.ledger_bucket_ok_by;
    const retry = await supabase.from("cash_manual_ledger_entries").insert([rowLegacy]).select("id").maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error && /employee_income_included|column|does not exist/i.test(String(error.message))) {
    const noInc = { ...rowInsert };
    delete noInc.employee_income_included;
    const retryInc = await supabase.from("cash_manual_ledger_entries").insert([noInc]).select("id").maybeSingle();
    data = retryInc.data;
    error = retryInc.error;
  }

  if (error && /employee_id|column|does not exist/i.test(String(error.message))) {
    const noEmp = { ...rowInsert };
    delete noEmp.employee_id;
    delete noEmp.employee_income_included;
    const retryEmp = await supabase.from("cash_manual_ledger_entries").insert([noEmp]).select("id").maybeSingle();
    data = retryEmp.data;
    error = retryEmp.error;
  }

  if (error && /rental_point_id|column|does not exist/i.test(String(error.message))) {
    const noRp = { ...rowInsert };
    delete noRp.rental_point_id;
    const retryRp = await supabase.from("cash_manual_ledger_entries").insert([noRp]).select("id").maybeSingle();
    data = retryRp.data;
    error = retryRp.error;
  }

  if (error) {
    const msg = String(error.message || "");
    if (/cash_manual_ledger|relation|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Таблица ручных операций ещё не создана в БД. Выполните миграцию cash_manual_ledger." },
        { status: 503 },
      );
    }
    if (/attachment_url|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонка attachment_url в cash_manual_ledger_entries." },
        { status: 500 },
      );
    }
    if (/tour_id|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонка tour_id в cash_manual_ledger_entries." },
        { status: 500 },
      );
    }
    if (/booking_id|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонка booking_id в cash_manual_ledger_entries." },
        { status: 500 },
      );
    }
    if (/category_id|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: категории ручных операций (cash_manual_ledger_categories, category_id)." },
        { status: 500 },
      );
    }
    if (/rental_point_id|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: колонка rental_point_id в cash_manual_ledger_entries." },
        { status: 500 },
      );
    }
    if (/currency_code|payment_kind|amount_foreign|fx_rate|column|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: currency_code, payment_kind, amount_foreign, fx_rate_to_vnd в cash_manual_ledger_entries." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg || "Не удалось сохранить" }, { status: 500 });
  }

  const rowId = (data as { id?: string } | null)?.id ?? null;

  if (bookingId && rowId) {
    const payRow: Record<string, unknown> = {
      booking_id: bookingId,
      amount: amountVnd,
      currency: "VND",
      rate_to_vnd: 1,
      amount_vnd: amountVnd,
      kind: "office_cash",
      actor_id: actorId,
      remitted_to_cash_at: nowIso,
      remitted_to_cash_by: actorId,
    };
    let { error: payErr } = await supabase.from("payments").insert([payRow]);
    if (payErr && /remitted_to_cash_at|column|does not exist/i.test(String(payErr.message))) {
      const { remitted_to_cash_at: _a, remitted_to_cash_by: _b, ...legacy } = payRow;
      ({ error: payErr } = await supabase.from("payments").insert([legacy]));
    }
    if (payErr) {
      const pe = String(payErr.message || "");
      if (/office_cash|invalid input value for enum|payment_kind/i.test(pe)) {
        await supabase.from("cash_manual_ledger_entries").delete().eq("id", rowId);
        return NextResponse.json(
          { error: "Выполните миграцию БД: значение payment_kind office_cash." },
          { status: 503 },
        );
      }
      await supabase.from("cash_manual_ledger_entries").delete().eq("id", rowId);
      return NextResponse.json({ error: pe || "Не удалось записать платёж по брони" }, { status: 500 });
    }
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "cash_manual_ledger_entry",
    entityId: rowId ?? "unknown",
    action: "create",
    after: {
      direction,
      amount_vnd: amountVnd,
      title: title.trim(),
      note: noteCombined,
      attachment_url: att,
      tour_id: tourId,
      booking_id: bookingId,
      category_id: categoryId,
      rental_point_id: rentalPointId,
      currency_code: currencyCode,
      payment_kind: paymentKind,
      amount_foreign: currencyCode !== "VND" ? amountForeign ?? null : null,
      fx_rate_to_vnd: currencyCode !== "VND" ? fxRateToVnd ?? null : null,
    },
  });

  return NextResponse.json({ ok: true, id: rowId });
}
