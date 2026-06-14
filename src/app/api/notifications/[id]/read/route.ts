import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { id } = await params;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("in_app_notifications")
    .update({ read_at: nowIso })
    .eq("id", id)
    .eq("user_id", session.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (/in_app_notifications|does not exist/i.test(String(error.message))) {
      return NextResponse.json({ error: "Миграция БД: in_app_notifications." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
