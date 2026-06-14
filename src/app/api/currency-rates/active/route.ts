import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireRoles } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireRoles(["accountant", "director", "chief_manager", "manager", "guide", "chief_guide", "dispatcher"]);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ rate: 26000, setAt: null, setByName: null });

  const { data } = await supabase
    .from("currency_rates")
    .select("rate, set_at, set_by")
    .eq("active", true)
    .eq("base_currency", "USD")
    .eq("quote_currency", "VND")
    .order("set_at", { ascending: false })
    .limit(1);

  const row = data?.[0] as { rate: unknown; set_at: string | null; set_by: string | null } | undefined;
  if (!row) return NextResponse.json({ rate: 26000, setAt: null, setByName: null });

  const rate = Number.isFinite(Number(row.rate)) && Number(row.rate) > 0 ? Number(row.rate) : 26000;

  let setByName: string | null = null;
  if (row.set_by) {
    const { data: uData } = await supabase.from("users").select("full_name").eq("id", row.set_by).maybeSingle();
    setByName = (uData as { full_name?: string } | null)?.full_name?.trim() || null;
  }

  return NextResponse.json({ rate, setAt: row.set_at, setByName });
}
