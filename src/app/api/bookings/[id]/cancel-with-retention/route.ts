import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";

const bodySchema = z.object({
  reason: z.string().min(3).max(2000),
  retentionPct: z.number().int().min(0).max(100),
  totalVnd: z.number().int().min(0).optional(),
});

const ALLOWED_ROLES = ["chief_manager", "director"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { reason, retentionPct, totalVnd: totalVndFromBody } = parsed.data;

  const { id: bookingId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  // Получаем бронь (total_vnd не хранится в БД — принимаем из тела запроса)
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id,customer_name,online_code,tour_id,manager_id,deposit_vnd,deleted_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
  }
  if ((booking as { deleted_at?: string | null }).deleted_at) {
    return NextResponse.json({ error: "Бронь уже удалена" }, { status: 400 });
  }

  const depositVnd = Number((booking as { deposit_vnd?: number }).deposit_vnd ?? 0);
  const totalVnd = totalVndFromBody ?? depositVnd;
  const managerId = String((booking as { manager_id: string }).manager_id);
  const tourId = String((booking as { tour_id: string }).tour_id);
  const customerName = String((booking as { customer_name?: string }).customer_name ?? "Турист");
  const onlineCode = String((booking as { online_code?: string | null }).online_code ?? "").trim();

  const retentionVnd = Math.round(totalVnd * retentionPct / 100);
  const shortfallVnd = Math.max(0, retentionVnd - depositVnd);

  const now = new Date().toISOString();
  const actorId = actorUuidOrNull(session.id);

  // 1. Soft-delete брони с полями отмены
  const { error: delErr } = await supabase
    .from("bookings")
    .update({
      deleted_at: now,
      cancellation_reason: reason.trim(),
      retention_pct: retentionPct,
      retention_vnd: retentionVnd,
      manager_shortfall_vnd: shortfallVnd > 0 ? shortfallVnd : null,
      cancelled_by: session.id,
    })
    .eq("id", bookingId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 2. Запись в deleted_items для возможности восстановления (1 час)
  const restoreUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await supabase.from("deleted_items").insert([{
    entity: "booking",
    entity_id: bookingId,
    payload: { customer_name: customerName, tour_id: tourId },
    deleted_by: actorId,
    restore_until: restoreUntil,
  }]);

  // 3. Запись в кассу: поступление удержания (если retention > 0)
  if (retentionVnd > 0) {
    const bookingLabel = onlineCode ? `${customerName} (${onlineCode})` : customerName;
    const cashNote = [
      `Удержание при отмене брони: ${bookingLabel}`,
      `Удержано: ${retentionPct}% от ${totalVnd.toLocaleString("ru-RU")} ₫`,
      `Причина: ${reason.trim()}`,
      shortfallVnd > 0
        ? `⚠️ Депозит ${depositVnd.toLocaleString("ru-RU")} ₫ не покрывает удержание — долг менеджера: ${shortfallVnd.toLocaleString("ru-RU")} ₫`
        : null,
    ].filter(Boolean).join("\n");

    // Вставляем напрямую через admin клиент (системная операция)
    const cashRow: Record<string, unknown> = {
      direction: "in",
      amount_vnd: retentionVnd,
      title: `Удержание отмены: ${bookingLabel}`,
      note: cashNote,
      tour_id: tourId,
      created_by: actorId,
      currency_code: "VND",
      payment_kind: "cash",
    };

    // Пробуем со всеми колонками, при ошибке — без необязательных
    const { error: cashErr } = await supabase.from("cash_manual_ledger_entries").insert([cashRow]);
    if (cashErr && /column|does not exist/i.test(String(cashErr.message))) {
      const { error: cashErr2 } = await supabase.from("cash_manual_ledger_entries").insert([{
        direction: "in",
        amount_vnd: retentionVnd,
        title: `Удержание отмены: ${bookingLabel}`,
        note: cashNote,
        created_by: actorId,
      }]);
      if (cashErr2) {
        // Не критично — уже удалили бронь, пишем в аудит
        await writeAuditLog(supabase, {
          actorId,
          entity: "booking",
          entityId: bookingId,
          action: "cancel_retention_cash_failed",
          after: { retentionVnd, cashError: cashErr2.message },
        });
      }
    }
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "booking",
    entityId: bookingId,
    action: "cancel_with_retention",
    after: {
      reason,
      retention_pct: retentionPct,
      retention_vnd: retentionVnd,
      manager_shortfall_vnd: shortfallVnd > 0 ? shortfallVnd : null,
    },
  });

  return NextResponse.json({ ok: true, retentionVnd, shortfallVnd });
}
