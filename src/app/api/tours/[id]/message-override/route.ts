import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { z } from "zod";

const VALID_TYPES = ["tourist", "guide", "review"] as const;
type OverrideType = (typeof VALID_TYPES)[number];

const patchSchema = z.object({
  text: z.string().max(8000),
  type: z.enum(VALID_TYPES).default("tourist"),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const typeRaw = url.searchParams.get("type") ?? "tourist";
  const type: OverrideType = VALID_TYPES.includes(typeRaw as OverrideType)
    ? (typeRaw as OverrideType)
    : "tourist";

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data } = await supabase
    .from("tour_message_overrides")
    .select("text")
    .eq("tour_id", id)
    .eq("user_id", session.id)
    .eq("type", type)
    .maybeSingle();

  return NextResponse.json({ text: (data as { text?: string | null } | null)?.text ?? "" });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const allowedRoles = ["manager", "chief_manager", "director", "guide", "chief_guide"];
  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const text = parsed.data.text.trim() || null;

  if (text === null) {
    await supabase
      .from("tour_message_overrides")
      .delete()
      .eq("tour_id", id)
      .eq("user_id", session.id)
      .eq("type", parsed.data.type);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("tour_message_overrides")
    .upsert(
      { tour_id: id, user_id: session.id, type: parsed.data.type, text, updated_at: new Date().toISOString() },
      { onConflict: "tour_id,user_id,type" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
