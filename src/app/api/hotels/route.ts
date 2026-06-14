import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canManageHotelDirectory } from "@/lib/role-policy";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ hotels: [] });

  const { data, error } = await supabase
    .from("hotels")
    .select("id,name,address,maps_url")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return NextResponse.json({ hotels: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hotels = ((data ?? []) as { id: string; name: string; address: string | null; maps_url: string | null }[]).map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address ?? "",
    mapsUrl: h.maps_url ?? "",
  }));
  return NextResponse.json({ hotels });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional().default(""),
  mapsUrl: z.string().trim().max(2000).optional().default(""),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canManageHotelDirectory(session.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("hotels")
    .insert([
      {
        name: parsed.data.name,
        address: parsed.data.address,
        maps_url: parsed.data.mapsUrl,
        created_by: session.id,
      },
    ])
    .select("id,name,address,maps_url")
    .single();

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return NextResponse.json({ error: "Выполните миграцию БД: hotels." }, { status: 503 });
    }
    if (/duplicate key|unique constraint/i.test(error.message)) {
      return NextResponse.json({ error: "Такой отель уже есть в справочнике." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as { id: string; name: string; address: string | null; maps_url: string | null };
  return NextResponse.json({
    ok: true,
    hotel: { id: row.id, name: row.name, address: row.address ?? "", mapsUrl: row.maps_url ?? "" },
  });
}
