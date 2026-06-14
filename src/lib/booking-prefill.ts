import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Role } from "@/lib/types";

export type BookingSalesPrefill = {
  bookingId: string;
  tourId: string;
  managerId: string;
  managerName: string;
  customerName: string;
  phoneE164: string;
  telegramUsername: string | null;
  hotelName: string;
  hotelAddress: string | null;
  hotelMapsUrl: string | null;
  room: string | null;
  adults: number;
  children: number;
  infants: number;
  note: string | null;
  passportPhotoUrls: string[];
};

const selectPrefillWithTg =
  "id,tour_id,manager_id,customer_name,phone_e164,telegram_username,hotel_name,hotel_address,hotel_maps_url,room,adults,children,infants,note,passport_photo_urls,users!bookings_manager_id_fkey(full_name)";
const selectPrefillNoAddress =
  "id,tour_id,manager_id,customer_name,phone_e164,telegram_username,hotel_name,hotel_maps_url,room,adults,children,infants,note,passport_photo_urls,users!bookings_manager_id_fkey(full_name)";
const selectPrefillLegacy =
  "id,tour_id,manager_id,customer_name,phone_e164,hotel_name,hotel_maps_url,room,adults,children,infants,note,passport_photo_urls,users!bookings_manager_id_fkey(full_name)";

export async function getBookingSalesPrefill(bookingId: string): Promise<BookingSalesPrefill | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  let res = await supabase
    .from("bookings")
    .select(selectPrefillWithTg)
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();
  if (
    res.error &&
    /telegram_username|hotel_address|column|does not exist|schema cache/i.test(String(res.error.message ?? ""))
  ) {
    res = await supabase
      .from("bookings")
      .select(selectPrefillNoAddress)
      .eq("id", bookingId)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      res.error &&
      /telegram_username|column|does not exist|schema cache/i.test(String(res.error.message ?? ""))
    ) {
      res = await supabase
        .from("bookings")
        .select(selectPrefillLegacy)
        .eq("id", bookingId)
        .is("deleted_at", null)
        .maybeSingle();
    }
  }
  const { data, error } = res;
  if (error || !data) return null;
  const row = data as {
    id: string;
    tour_id: string;
    manager_id: string;
    customer_name: string;
    phone_e164: string;
    telegram_username?: string | null;
    hotel_name: string;
    hotel_address?: string | null;
    hotel_maps_url: string | null;
    room: string | null;
    adults: number;
    children: number;
    infants: number;
    note: string | null;
    passport_photo_urls?: unknown;
    users?: { full_name?: string } | { full_name?: string }[] | null;
  };
  const u = row.users;
  const managerName = Array.isArray(u) ? u[0]?.full_name : u?.full_name;
  return {
    bookingId: row.id,
    tourId: row.tour_id,
    managerId: row.manager_id,
    managerName: String(managerName || "").trim() || "Менеджер",
    customerName: row.customer_name,
    phoneE164: row.phone_e164,
    telegramUsername: row.telegram_username?.trim() || null,
    hotelName: row.hotel_name,
    hotelAddress: row.hotel_address ?? null,
    hotelMapsUrl: row.hotel_maps_url,
    room: row.room,
    adults: Number(row.adults) || 0,
    children: Number(row.children) || 0,
    infants: Number(row.infants) || 0,
    note: row.note,
    passportPhotoUrls: Array.isArray(row.passport_photo_urls) ? (row.passport_photo_urls as string[]) : [],
  };
}

/** Данные брони в мастере «Изменить» / дубликат: кто может видеть состав и контакты (как на карточке). */
export function canPrefillBookingForEdit(role: Role, sessionUserId: string, row: BookingSalesPrefill, isDuplicate: boolean = false): boolean {
  if (role === "director" || role === "chief_manager") return true;
  if (role === "manager" && row.managerId === sessionUserId) return true;
  if (role === "manager" && isDuplicate) return true;
  if (role === "chief_guide") return true;
  if (role === "accountant") return true;
  return false;
}
