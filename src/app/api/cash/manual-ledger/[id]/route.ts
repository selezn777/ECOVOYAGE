import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { actorUuidOrNull, isUuidSessionUser } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canEditCashLedger } from "@/lib/role-policy";

const bucketPatchSchema = z.object({
  ledgerBucket: z.enum(["standard", "instrumented"]),
  confirm: z.boolean().optional(),
});

const editPatchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  note: z.union([z.string().max(2000), z.null()]).optional(),
  amountVnd: z.number().int().positive().max(9_999_999_999).optional(),
});

function canEditInFirstHour(entryCreatedAt: string, sessionId: string, createdBy: string | null): boolean {
  if (!createdBy || createdBy !== sessionId) return false;
  const ts = Date.parse(String(entryCreatedAt || ""));
  if (!Number.isFinite(ts)) return false;
  const diff = Date.now() - ts;
  return diff >= 0 && diff <= 60 * 60 * 1000;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const wantsBucketEdit = body && typeof body === "object" && "ledgerBucket" in body;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: row } = await supabase
    .from("cash_manual_ledger_entries")
    .select("id,created_by,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

  const actorId = actorUuidOrNull(session.id);

  if (wantsBucketEdit) {
    if (!canEditCashLedger(session.role)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    if (!isUuidSessionUser(session.id)) {
      return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
    }
    const parsed = bucketPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const nowIso = new Date().toISOString();
    const confirm = parsed.data.confirm === true;
    const patch: Record<string, unknown> = {
      ledger_bucket: parsed.data.ledgerBucket,
    };
    if (confirm) {
      patch.ledger_bucket_ok_at = nowIso;
      patch.ledger_bucket_ok_by = actorId;
    }

    const { error } = await supabase.from("cash_manual_ledger_entries").update(patch).eq("id", id);
    if (error) {
      if (/ledger_bucket/i.test(String(error.message))) {
        return NextResponse.json({ error: "Выполните миграцию БД: ledger_bucket в cash_manual_ledger_entries." }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actorId,
      entity: "cash_manual_ledger_entry",
      entityId: id,
      action: "update_ledger_bucket",
      after: { ledger_bucket: parsed.data.ledgerBucket, confirm },
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = editPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const mayEdit =
    session.role === "director" || canEditInFirstHour(String(row.created_at || ""), session.id, row.created_by ?? null);
  if (!mayEdit) {
    return NextResponse.json(
      { error: "Редактирование доступно только директору или автору в течение 1 часа после внесения." },
      { status: 403 },
    );
  }
  const d = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let has = false;
  if (d.title !== undefined) {
    patch.title = d.title.trim();
    has = true;
  }
  if (d.note !== undefined) {
    patch.note = d.note?.trim() || null;
    has = true;
  }
  if (d.amountVnd !== undefined) {
    patch.amount_vnd = d.amountVnd;
    has = true;
  }
  if (!has) return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });

  const { error } = await supabase.from("cash_manual_ledger_entries").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditLog(supabase, {
    actorId,
    entity: "cash_manual_ledger_entry",
    entityId: id,
    action: "update",
    after: patch,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "director") {
    return NextResponse.json({ error: "Удаление операции доступно только директору." }, { status: 403 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });
  const { id } = await ctx.params;
  const { error } = await supabase.from("cash_manual_ledger_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditLog(supabase, {
    actorId: actorUuidOrNull(session.id),
    entity: "cash_manual_ledger_entry",
    entityId: id,
    action: "delete",
  });
  return NextResponse.json({ ok: true });
}
