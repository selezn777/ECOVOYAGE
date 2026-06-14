import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";

const patchSchema = z.object({ note: z.string().max(2000) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  // Гид может обновлять только свою запись
  const { data: existing } = await supabase
    .from("tour_guides")
    .select("guide_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const isOwner = (existing as { guide_id: string }).guide_id === session.id;
  const isAdmin = ["director", "chief_manager"].includes(session.role);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { error } = await supabase
    .from("tour_guides")
    .update({ note: parsed.data.note.trim() || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
