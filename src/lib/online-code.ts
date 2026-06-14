import type { SupabaseClient } from "@supabase/supabase-js";

function parseOnlineCode(raw: string | null | undefined): number {
  const s = String(raw ?? "").trim();
  const m = /^ON(\d+)$/.exec(s);
  return m ? Number(m[1]) : 0;
}

function formatOnlineCode(n: number): string {
  return `ON${String(Math.max(1, Math.floor(n))).padStart(6, "0")}`;
}

/** Максимум по числовой части ON - лексикографический order в Postgres даёт неверный «макс» (ON000010 < ON000009). */
async function fetchMaxOnlineCodeNumeric(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("bookings")
    .select("online_code")
    .not("online_code", "is", null)
    .limit(40000);
  if (error || !data?.length) return 0;
  let max = 0;
  for (const row of data as { online_code?: string | null }[]) {
    max = Math.max(max, parseOnlineCode(row.online_code));
  }
  return max;
}

export async function ensureBookingOnlineCode(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const currentRes = await supabase.from("bookings").select("id,online_code").eq("id", bookingId).maybeSingle();
  if (currentRes.error || !currentRes.data) return null;
  const current = (currentRes.data as { online_code?: string | null }).online_code?.trim();
  if (current) return current;

  const maxCode = await fetchMaxOnlineCodeNumeric(supabase);
  const next = formatOnlineCode(maxCode + 1);

  const upd = await supabase
    .from("bookings")
    .update({ online_code: next })
    .eq("id", bookingId)
    .is("deleted_at", null);
  if (upd.error) return null;
  return next;
}

export async function backfillMissingOnlineCodes(
  supabase: SupabaseClient,
  limit: number = 300,
): Promise<void> {
  const half = Math.ceil(limit / 2);
  const [nullRes, emptyRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id")
      .is("deleted_at", null)
      .is("online_code", null)
      .order("created_at", { ascending: true })
      .limit(half),
    supabase
      .from("bookings")
      .select("id")
      .is("deleted_at", null)
      .eq("online_code", "")
      .order("created_at", { ascending: true })
      .limit(half),
  ]);

  const seen = new Set<string>();
  const miss: { id: string }[] = [];
  for (const row of [...(nullRes.data || []), ...(emptyRes.data || [])] as { id: string }[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    miss.push(row);
    if (miss.length >= limit) break;
  }
  if (miss.length === 0) return;

  let cur = await fetchMaxOnlineCodeNumeric(supabase);
  for (const row of miss) {
    cur += 1;
    const code = formatOnlineCode(cur);
    const upd = await supabase.from("bookings").update({ online_code: code }).eq("id", row.id).is("deleted_at", null);
    if (upd.error) {
      // best-effort; колонка может отсутствовать или строка уже получила код
    }
  }
}
