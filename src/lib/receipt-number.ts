import type { SupabaseClient } from "@supabase/supabase-js";

function buildCandidate(prefix: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yyyy}${mm}${dd}-${rand}`;
}

export async function allocateUniqueReceiptNumber(
  supabase: SupabaseClient,
  prefix: string,
  maxAttempts = 8,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = buildCandidate(prefix);
    const { data, error } = await supabase
      .from("receipts")
      .select("id")
      .eq("receipt_number", candidate)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return candidate;
  }
  throw new Error("Could not allocate unique receipt number");
}
