import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase не настроен" }, { status: 500 });

  const { data, error } = await supabase
    .from("bookings")
    .select("adults,children,infants")
    .eq("tour_id", id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const booked = (data || []).reduce(
    (s, b) => s + (b as { adults: number; children: number; infants: number }).adults
      + (b as { adults: number; children: number; infants: number }).children
      + (b as { adults: number; children: number; infants: number }).infants,
    0,
  );

  return NextResponse.json({ booked });
}
