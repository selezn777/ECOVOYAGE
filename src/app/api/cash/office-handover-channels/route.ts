import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";

const postSchema = z.object({
  label: z.string().min(1).max(120),
  expectsUsdAmount: z.boolean().optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("office_cash_handover_channels")
    .select("id,slug,label,sort_order,is_system,expects_usd_amount")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    const msg = String(error.message || "");
    if (/office_cash_handover_channels|does not exist/i.test(msg)) {
      return NextResponse.json({ channels: [] });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    channels: ((data as Record<string, unknown>[] | null) || []).map((r) => ({
      id: String(r.id),
      slug: r.slug != null ? String(r.slug) : null,
      label: String(r.label || "").trim(),
      sortOrder: Number(r.sort_order ?? 0),
      isSystem: Boolean(r.is_system),
      expectsUsdAmount: Boolean(r.expects_usd_amount),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const label = parsed.data.label.trim();
  if (!label) return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  const expectsUsdAmount = parsed.data.expectsUsdAmount === true;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: maxRow } = await supabase
    .from("office_cash_handover_channels")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    maxRow && typeof (maxRow as { sort_order?: number }).sort_order === "number"
      ? Number((maxRow as { sort_order: number }).sort_order) + 10
      : 100;

  const { data, error } = await supabase
    .from("office_cash_handover_channels")
    .insert([
      {
        label,
        sort_order: nextOrder,
        is_system: false,
        expects_usd_amount: expectsUsdAmount,
      },
    ])
    .select("id,slug,label,sort_order,is_system,expects_usd_amount")
    .maybeSingle();

  if (error) {
    const msg = String(error.message || "");
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "Такой канал уже есть" }, { status: 409 });
    }
    if (/office_cash_handover_channels|does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: "Выполните миграцию БД: office_cash_handover_channels." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, channel: data });
}

export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Укажите id канала" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data: row, error: selErr } = await supabase
    .from("office_cash_handover_channels")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  if ((row as { is_system?: boolean }).is_system === true) {
    return NextResponse.json({ error: "Системный канал нельзя удалить" }, { status: 400 });
  }

  const { error } = await supabase.from("office_cash_handover_channels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
