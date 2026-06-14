import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { clearSheetRange, ensureSheetTab, readSheetRange, writeSheetRange } from "@/lib/google-sheets-client";

/** Категория «Отели» — справочник отелей, двусторонняя синхронизация с вкладкой таблицы. */
export const HOTELS_SHEET_TITLE = "Отели";

const HOTELS_HEADERS = ["Город", "Название", "Адрес", "Maps URL", "Активен"];

type HotelDirectoryRow = { name: string; address: string | null; maps_url: string | null; city: string; active: boolean };

/** CRM → Таблица: полностью перезаписывает вкладку «Отели» текущим справочником. */
export async function pushHotelsToSheet(): Promise<{ rows: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase не настроен");

  const { data, error } = await supabase
    .from("hotels")
    .select("name,address,maps_url,city,active")
    .order("city", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as HotelDirectoryRow[];

  await ensureSheetTab(HOTELS_SHEET_TITLE);
  await clearSheetRange(`${HOTELS_SHEET_TITLE}!A1:Z`);
  await writeSheetRange(`${HOTELS_SHEET_TITLE}!A1`, [
    HOTELS_HEADERS,
    ...rows.map((h) => [h.city, h.name, h.address ?? "", h.maps_url ?? "", h.active ? "Да" : "Нет"]),
  ]);

  return { rows: rows.length };
}

function parseActive(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return !["нет", "no", "false", "0"].includes(v);
}

/** Таблица → CRM: добавляет новые отели и обновляет существующие (поиск по городу+названию). */
export async function pullHotelsFromSheet(actorId: string): Promise<{ created: number; updated: number; skipped: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase не настроен");

  const values = await readSheetRange(`${HOTELS_SHEET_TITLE}!A2:E`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of values) {
    const city = (row[0] ?? "").trim();
    const name = (row[1] ?? "").trim();
    if (!city || !name) {
      skipped++;
      continue;
    }
    const address = (row[2] ?? "").trim();
    const mapsUrl = (row[3] ?? "").trim();
    const active = parseActive(row[4]);

    const { data: existing, error: findErr } = await supabase
      .from("hotels")
      .select("id,address,maps_url,active")
      .eq("city", city)
      .ilike("name", name)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (existing) {
      const ex = existing as { id: string; address: string | null; maps_url: string | null; active: boolean };
      if ((ex.address ?? "") !== address || (ex.maps_url ?? "") !== mapsUrl || ex.active !== active) {
        const { error: updErr } = await supabase
          .from("hotels")
          .update({ address, maps_url: mapsUrl, active })
          .eq("id", ex.id);
        if (updErr) throw new Error(updErr.message);
        updated++;
      } else {
        skipped++;
      }
    } else {
      const { error: insErr } = await supabase
        .from("hotels")
        .insert([{ name, address, maps_url: mapsUrl, city, active, created_by: actorId }]);
      if (insErr) throw new Error(insErr.message);
      created++;
    }
  }

  return { created, updated, skipped };
}
