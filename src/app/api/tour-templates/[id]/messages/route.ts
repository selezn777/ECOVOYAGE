import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  touristSendCopy: z.string().max(8000).optional(),
  guideTouristMessage: z.string().max(8000).optional(),
  reviewMessage: z.string().max(8000).optional(),
});

function canEditManagerMessages(role: string): boolean {
  return role === "chief_manager" || role === "director";
}

function canEditGuideMessages(role: string): boolean {
  return role === "chief_guide" || role === "director";
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const update: Record<string, string | null> = {};

  if (parsed.data.touristSendCopy !== undefined) {
    if (!canEditManagerMessages(session.role)) {
      return NextResponse.json({ error: "Нет прав для редактирования менеджерского сообщения" }, { status: 403 });
    }
    update.tourist_send_copy = parsed.data.touristSendCopy.trim() || null;
  }

  if (parsed.data.guideTouristMessage !== undefined) {
    if (!canEditGuideMessages(session.role)) {
      return NextResponse.json({ error: "Нет прав для редактирования сообщения гида" }, { status: 403 });
    }
    update.guide_tourist_message = parsed.data.guideTouristMessage.trim() || null;
  }

  if (parsed.data.reviewMessage !== undefined) {
    if (!canEditGuideMessages(session.role)) {
      return NextResponse.json({ error: "Нет прав для редактирования сообщения отзыва" }, { status: 403 });
    }
    update.review_message = parsed.data.reviewMessage.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("tour_templates").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("tour_templates")
    .select("tourist_send_copy,guide_tourist_message,review_message")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    touristSendCopy: (data as { tourist_send_copy?: string | null } | null)?.tourist_send_copy ?? "",
    guideTouristMessage: (data as { guide_tourist_message?: string | null } | null)?.guide_tourist_message ?? "",
    reviewMessage: (data as { review_message?: string | null } | null)?.review_message ?? "",
  });
}
