import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitRaw) ? Math.min(80, Math.max(1, Math.round(limitRaw))) : 40;

  const listRes = await supabase
    .from("in_app_notifications")
    .select("id,kind,title,body,link_url,meta,read_at,created_at")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (listRes.error) {
    if (/in_app_notifications|does not exist/i.test(String(listRes.error.message))) {
      return NextResponse.json({ items: [], unreadCount: 0, migrationNeeded: true });
    }
    return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  }

  const countRes = await supabase
    .from("in_app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.id)
    .is("read_at", null);

  const unreadFallback = ((listRes.data as { read_at?: string | null }[] | null) ?? []).filter((r) => !r.read_at).length;
  const unreadCount =
    !countRes.error && typeof countRes.count === "number" ? countRes.count : unreadFallback;

  const rows = (listRes.data as Record<string, unknown>[] | null) ?? [];

  return NextResponse.json({
    items: rows.map((r) => ({
      id: String(r.id ?? ""),
      kind: String(r.kind ?? ""),
      title: String(r.title ?? ""),
      body: String(r.body ?? ""),
      linkUrl: r.link_url != null ? String(r.link_url) : null,
      meta: (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>,
      readAt: r.read_at != null ? String(r.read_at) : null,
      createdAt: String(r.created_at ?? ""),
    })),
    unreadCount,
  });
}
