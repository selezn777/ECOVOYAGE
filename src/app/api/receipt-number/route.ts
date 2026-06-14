import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { allocateUniqueReceiptNumber } from "@/lib/receipt-number";

function buildFallbackCandidate(prefix: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yyyy}${mm}${dd}-${rand}`;
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });

  const prefix = process.env.RECEIPT_PREFIX || "AMX";
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ receiptNumber: buildFallbackCandidate(prefix), source: "fallback" });
  }

  try {
    const receiptNumber = await allocateUniqueReceiptNumber(supabase, prefix);
    return NextResponse.json({ receiptNumber, source: "db-checked" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Allocation failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
