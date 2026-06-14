import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { CASH_VIEW_ROLES, canEditCashLedger } from "@/lib/role-policy";

const postSchema = z.object({
  label: z.string().min(1).max(120),
});

/** Список категорий ручных операций кассы */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!CASH_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("cash_manual_ledger_categories")
    .select("id,label")
    .order("label", { ascending: true });

  if (error) {
    const msg = String(error.message || "");
    if (/cash_manual_ledger_categories|does not exist/i.test(msg)) {
      return NextResponse.json({ categories: [] });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    categories: ((data as { id: string; label: string }[] | null) || []).map((r) => ({
      id: r.id,
      label: String(r.label || "").trim(),
    })),
  });
}

/** Добавить категорию */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditCashLedger(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const label = parsed.data.label.trim();
  if (!label) return NextResponse.json({ error: "Укажите название" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("cash_manual_ledger_categories")
    .insert([{ label }])
    .select("id,label")
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "");
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "Такая категория уже есть" }, { status: 409 });
    }
    if (/cash_manual_ledger_categories|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: cash_manual_ledger_categories." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, category: data });
}

/** Удалить категорию: ?id=uuid */
export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditCashLedger(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Укажите id категории" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { error } = await supabase.from("cash_manual_ledger_categories").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
