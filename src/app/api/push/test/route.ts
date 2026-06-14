import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendWebPush } from "@/lib/push-server";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", session.id)
    .eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data as { id: string; endpoint: string; p256dh: string; auth: string }[] | null) || [];
  if (!rows.length) return NextResponse.json({ error: "Нет активных подписок" }, { status: 400 });

  let sent = 0;
  for (const s of rows) {
    try {
      await sendWebPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        {
          title: "Тест уведомлений",
          body: "Push работает. Вы получаете уведомления в PWA.",
          url: "/dashboard",
        },
      );
      sent += 1;
    } catch (e) {
      const message = String((e as { message?: unknown })?.message ?? "");
      if (message.includes("410") || message.includes("404")) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return NextResponse.json({ ok: true, sent });
}

