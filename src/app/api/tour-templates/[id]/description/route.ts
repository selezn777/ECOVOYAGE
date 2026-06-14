import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canEditTemplateDescription } from "@/lib/role-policy";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const patchSchema = z.object({
  description: z.string().max(12000),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен. Заполните .env.local." }, { status: 500 });
  }

  const { data, error } = await supabase.from("tour_templates").select("description").eq("id", id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || "Не удалось загрузить описание" }, { status: 500 });
  }

  const description = data?.description != null ? String(data.description) : "";
  return NextResponse.json({ description });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canEditTemplateDescription(session.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен. Заполните .env.local." }, { status: 500 });
  }
  const { error } = await supabase.from("tour_templates").update({ description: parsed.data.description }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message || "Не удалось сохранить описание" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
