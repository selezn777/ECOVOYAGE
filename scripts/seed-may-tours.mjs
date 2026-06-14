/**
 * Seed May 2026 tour schedule for Asia Mix CRM
 * Run: node scripts/seed-may-tours.mjs
 *
 * Rules encoded (matches API validation):
 *   - Дананг 1d / 2d: no Sat, no Sun
 *   - Сайгон 2d: Mon + Thu only
 *   - Сайгон 1d: Mon/Tue/Thu/Fri only (Cu Chi: Mon+Thu, Mekong: Tue+Fri)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const supabase = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["SUPABASE_SERVICE_ROLE_KEY"],
  { auth: { persistSession: false } },
);

const RATE = 26000;

// ─── Template slug → DB name mapping ─────────────────────────────────────────
const TEMPLATE_NAMES = {
  dalat_chudes:     "Далат Чудес",
  dalat_light:      "Далат Light",
  dalat_vip:        "Далат VIP",
  dalat_2day:       "Dalat Discovery (2 дня)",
  hon_tam:          "Остров Хон Там",
  northern_islands: "Северные острова: Орхидей + Обезьян",
  ba_ho_ttc:        "Водопады Ба Хо + пляж ТТС",
  ba_ho_pagoda:     "Бахо — джунгли и водопады",
  phan_rang:        "Фанранг",
  lighthouse:       "Маяк — земля первого рассвета",
  yang_bay:         "Янг Бэй — водопад и горячие источники",
  asia_mix_islands: "Asia Mix Islands — 3 острова",
  danang_1day:      "Дананг — 1 день (sleep-bus)",
  danang_2day:      "Дананг + Хойан — 2 дня (sleep-bus)",
  saigon_1day:      "Сайгон — 1 день (sleep-bus)",
  saigon_2day:      "Сайгон — 2 дня (sleep-bus)",
  fishing_lake:     "Рыбалка озёрная",
  fishing_sea:      "Рыбалка морская",
  emperor_cruise:   "Круиз Emperor 5★ — закат и ужин",
};

// ─── Schedule (May 13–31, 2026) ───────────────────────────────────────────────
// slug:     key from TEMPLATE_NAMES (or "catamaran" for ad-hoc)
// cap:      max capacity
// days:     1 (default) = single day, 2 = spans 2 calendar days (dateTo = date+1)
// priceUsd: only for catamaran (no template)
const SCHEDULE = [
  // ═══════ 13 мая (ср) ═══════
  { date: "2026-05-13", slug: "dalat_chudes",     cap: 13 },          // bus 1 (full в расписании)
  { date: "2026-05-13", slug: "dalat_chudes",     cap: 13 },          // bus 2
  { date: "2026-05-13", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-13", slug: "northern_islands", cap: 14 },
  { date: "2026-05-13", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-13", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-13", slug: "dalat_2day",       cap: 13, days: 2 },
  { date: "2026-05-13", slug: "fishing_lake",     cap: 15 },
  { date: "2026-05-13", slug: "danang_2day",      cap: 19, days: 2 },
  { date: "2026-05-13", slug: "catamaran",        cap: 12, priceUsd: 75 },

  // ═══════ 14 мая (чт) ═══════
  { date: "2026-05-14", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-14", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-14", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-14", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-14", slug: "ba_ho_pagoda",     cap: 15 },
  { date: "2026-05-14", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-14", slug: "fishing_lake",     cap: 15 },
  { date: "2026-05-14", slug: "danang_1day",      cap: 19, days: 2 },
  { date: "2026-05-14", slug: "saigon_2day",      cap: 40, days: 2 },
  { date: "2026-05-14", slug: "saigon_1day",      cap: 40, days: 2 }, // Cu Chi (чт)

  // ═══════ 15 мая (пт) ═══════
  { date: "2026-05-15", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-15", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-15", slug: "northern_islands", cap: 14 },
  { date: "2026-05-15", slug: "yang_bay",         cap: 15 },
  { date: "2026-05-15", slug: "fishing_sea",      cap: 15 },
  { date: "2026-05-15", slug: "fishing_lake",     cap: 15 },
  { date: "2026-05-15", slug: "saigon_1day",      cap: 40, days: 2 }, // Mekong (пт)

  // ═══════ 16 мая (сб) ═══════
  { date: "2026-05-16", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-16", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-16", slug: "dalat_2day",       cap: 13, days: 2 },
  { date: "2026-05-16", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-16", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-16", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-16", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-16", slug: "fishing_lake",     cap: 15 },

  // ═══════ 17 мая (вс) ═══════
  { date: "2026-05-17", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-17", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-17", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-17", slug: "northern_islands", cap: 14 },
  { date: "2026-05-17", slug: "ba_ho_pagoda",     cap: 15 },
  { date: "2026-05-17", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-17", slug: "fishing_sea",      cap: 15 },
  { date: "2026-05-17", slug: "catamaran",        cap: 12, priceUsd: 75 },

  // ═══════ 18 мая (пн) ═══════
  { date: "2026-05-18", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-18", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-18", slug: "yang_bay",         cap: 15 },
  { date: "2026-05-18", slug: "saigon_2day",      cap: 40, days: 2 },
  { date: "2026-05-18", slug: "saigon_1day",      cap: 40, days: 2 }, // Cu Chi (пн)
  { date: "2026-05-18", slug: "danang_1day",      cap: 19, days: 2 },

  // ═══════ 19 мая (вт) ═══════
  { date: "2026-05-19", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-19", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-19", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-19", slug: "northern_islands", cap: 14 },
  { date: "2026-05-19", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-19", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-19", slug: "saigon_1day",      cap: 40, days: 2 }, // Mekong (вт)

  // ═══════ 20 мая (ср) ═══════
  { date: "2026-05-20", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-20", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-20", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-20", slug: "ba_ho_pagoda",     cap: 15 },
  { date: "2026-05-20", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-20", slug: "yang_bay",         cap: 15 },
  { date: "2026-05-20", slug: "danang_2day",      cap: 19, days: 2 },

  // ═══════ 21 мая (чт) ═══════
  { date: "2026-05-21", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-21", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-21", slug: "northern_islands", cap: 14 },
  { date: "2026-05-21", slug: "saigon_2day",      cap: 40, days: 2 },
  { date: "2026-05-21", slug: "saigon_1day",      cap: 40, days: 2 }, // Cu Chi (чт)

  // ═══════ 22 мая (пт) ═══════
  { date: "2026-05-22", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-22", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-22", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-22", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-22", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-22", slug: "saigon_1day",      cap: 40, days: 2 }, // Mekong (пт)

  // ═══════ 23 мая (сб) ═══════
  { date: "2026-05-23", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-23", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-23", slug: "dalat_2day",       cap: 13, days: 2 },
  { date: "2026-05-23", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-23", slug: "northern_islands", cap: 14 },
  { date: "2026-05-23", slug: "yang_bay",         cap: 15 },

  // ═══════ 24 мая (вс) ═══════
  { date: "2026-05-24", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-24", slug: "asia_mix_islands", cap: 14 },

  // ═══════ 25 мая (пн) ═══════
  { date: "2026-05-25", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-25", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-25", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-25", slug: "northern_islands", cap: 14 },
  { date: "2026-05-25", slug: "ba_ho_pagoda",     cap: 15 },
  { date: "2026-05-25", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-25", slug: "saigon_2day",      cap: 40, days: 2 },
  { date: "2026-05-25", slug: "saigon_1day",      cap: 40, days: 2 }, // Cu Chi (пн)
  { date: "2026-05-25", slug: "danang_1day",      cap: 19, days: 2 },

  // ═══════ 26 мая (вт) ═══════
  { date: "2026-05-26", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-26", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-26", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-26", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-26", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-26", slug: "fishing_lake",     cap: 15 },
  { date: "2026-05-26", slug: "saigon_1day",      cap: 40, days: 2 }, // Mekong (вт)

  // ═══════ 27 мая (ср) ═══════
  { date: "2026-05-27", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-27", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-27", slug: "northern_islands", cap: 14 },
  { date: "2026-05-27", slug: "yang_bay",         cap: 15 },
  { date: "2026-05-27", slug: "dalat_2day",       cap: 13, days: 2 },
  { date: "2026-05-27", slug: "emperor_cruise",   cap: 40 },
  { date: "2026-05-27", slug: "danang_2day",      cap: 19, days: 2 },

  // ═══════ 28 мая (чт) ═══════
  { date: "2026-05-28", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-28", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-28", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-28", slug: "ba_ho_pagoda",     cap: 15 },
  { date: "2026-05-28", slug: "lighthouse",       cap: 15 },
  { date: "2026-05-28", slug: "saigon_2day",      cap: 40, days: 2 },
  { date: "2026-05-28", slug: "saigon_1day",      cap: 40, days: 2 }, // Cu Chi (чт)

  // ═══════ 29 мая (пт) ═══════
  { date: "2026-05-29", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-29", slug: "dalat_vip",        cap: 13 },
  { date: "2026-05-29", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-29", slug: "northern_islands", cap: 14 },
  { date: "2026-05-29", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-29", slug: "phan_rang",        cap: 15 },
  { date: "2026-05-29", slug: "saigon_1day",      cap: 40, days: 2 }, // Mekong (пт)

  // ═══════ 30 мая (сб) ═══════
  { date: "2026-05-30", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-30", slug: "asia_mix_islands", cap: 14 },
  { date: "2026-05-30", slug: "yang_bay",         cap: 15 },

  // ═══════ 31 мая (вс) ═══════
  { date: "2026-05-31", slug: "dalat_chudes",     cap: 13 },
  { date: "2026-05-31", slug: "dalat_light",      cap: 13 },
  { date: "2026-05-31", slug: "hon_tam",          cap: 14 },
  { date: "2026-05-31", slug: "northern_islands", cap: 14 },
  { date: "2026-05-31", slug: "ba_ho_ttc",        cap: 15 },
  { date: "2026-05-31", slug: "phan_rang",        cap: 15 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function toIso(ymd, hhmm) {
  return `${ymd}T${hhmm}:00+07:00`;
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch all active templates
  const { data: templates, error: tmplErr } = await supabase
    .from("tour_templates")
    .select("id, name, pickup_from, default_price_vnd, locations")
    .eq("active", true);

  if (tmplErr) throw new Error(`Templates fetch: ${tmplErr.message}`);

  const tmplByName = Object.fromEntries((templates ?? []).map((t) => [t.name, t]));

  // Verify all slugs resolve
  let missing = false;
  for (const [slug, name] of Object.entries(TEMPLATE_NAMES)) {
    if (!tmplByName[name]) {
      console.warn(`⚠️  Template not found in DB: "${name}" (slug: ${slug})`);
      missing = true;
    }
  }
  if (missing) {
    console.log("Продолжаем — пропускаем туры с ненайденным шаблоном.\n");
  }

  // Director user id for created_by
  const { data: dirRows } = await supabase.from("users").select("id").eq("role", "director").limit(1);
  const createdBy = dirRows?.[0]?.id ?? null;

  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of SCHEDULE) {
    const days = entry.days ?? 1;
    const dateTo = days > 1 ? addDays(entry.date, days - 1) : entry.date;

    let templateId = null;
    let name = "";
    let startTime = "08:00";
    let endTime = "08:30";
    let finalVnd = 0;
    let finalUsd = 0;

    if (entry.slug === "catamaran") {
      name = "Катамаран — закат";
      startTime = "15:30";
      endTime = "16:00";
      finalUsd = entry.priceUsd ?? 75;
      finalVnd = Math.round(finalUsd * RATE);
    } else {
      const tmplName = TEMPLATE_NAMES[entry.slug];
      const tmpl = tmplByName[tmplName];
      if (!tmpl) {
        console.log(`⏭  ${entry.date} ${entry.slug} — шаблон не найден, пропуск`);
        skipped++;
        continue;
      }
      templateId = tmpl.id;
      name = tmpl.name;
      startTime = (tmpl.pickup_from ?? "08:00").slice(0, 5);
      endTime = addMinutes(startTime, 30);

      const locs = tmpl.locations;
      if (locs && typeof locs === "object" && locs.usd_price > 0) {
        finalUsd = locs.usd_price;
        finalVnd = Math.round(finalUsd * RATE);
      } else if (Number(tmpl.default_price_vnd) > 0) {
        finalVnd = Number(tmpl.default_price_vnd);
        finalUsd = finalVnd / RATE;
      }
    }

    if (finalVnd <= 0) {
      console.error(`❌ ${entry.date} ${entry.slug} — нет цены`);
      failed++;
      continue;
    }

    const startAt = toIso(entry.date, startTime);
    const endAt = toIso(dateTo, endTime);

    const { error } = await supabase.from("tours").insert([
      {
        template_id: templateId,
        name,
        tour_type: "group",
        start_at: startAt,
        end_at: endAt,
        capacity: entry.cap,
        default_offer_usd: Math.round(finalUsd * 10000) / 10000,
        default_offer_rate_to_vnd: RATE,
        default_offer_vnd: finalVnd,
        created_by: createdBy,
      },
    ]);

    if (error) {
      console.error(`❌ ${entry.date} ${name}: ${error.message}`);
      failed++;
    } else {
      const range = days > 1 ? `→ ${dateTo}` : "";
      console.log(`✅ ${entry.date}${range}  ${name}  (cap ${entry.cap})`);
      created++;
    }
  }

  console.log(`\n🏁 Итого: создано ${created}, пропущено ${skipped}, ошибок ${failed}`);
}

main().catch(console.error);
