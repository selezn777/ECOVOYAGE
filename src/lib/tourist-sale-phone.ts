import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Менеджер продаж по номеру: первый создатель активной брони с этим телефоном.
 */
export async function getSalesManagerIdForPhone(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<string | null> {
  const phone = String(phoneE164 ?? "").trim();
  if (phone.length < 8) return null;
  const { data, error } = await supabase
    .from("bookings")
    .select("manager_id")
    .eq("phone_e164", phone)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as { manager_id: string }).manager_id);
}

/** rental_point_id менеджера из таблицы users (постоянное назначение на точку). */
export async function getManagerRentalPointId(
  supabase: SupabaseClient,
  managerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("rental_point_id")
    .eq("id", managerId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { rental_point_id?: string | null }).rental_point_id ?? null;
}

/** Маска телефона для публичного отображения: +XX *** *** X12 */
export function maskPhone(phone: string): string {
  const s = String(phone ?? "").trim();
  if (!s) return "—";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 4) return s;
  const last3 = digits.slice(-3);
  const prefix = s.startsWith("+") ? "+" : "";
  const countryDigits = digits.slice(0, Math.min(3, digits.length - 3));
  return `${prefix}${countryDigits} *** *** ${last3}`;
}
