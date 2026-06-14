import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireRoles } from "@/lib/auth-session";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  rate: z.number().positive().min(1000).max(500_000),
});

export async function POST(req: Request) {
  const user = await requireRoles(["accountant"]);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "rate должен быть от 1000 до 500000" }, { status: 400 });

  const rate = Math.round(parsed.data.rate);

  const { error } = await supabase.from("currency_rates").insert({
    base_currency: "USD",
    quote_currency: "VND",
    rate,
    active: true,
    set_by: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rate });
}
