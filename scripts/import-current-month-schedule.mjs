/**
 * Import a pasted Центр Туризма tour schedule into a target month.
 *
 * Example:
 *   node scripts/import-current-month-schedule.mjs --file /path/pasted-text.txt --month 2026-07
 *   node scripts/import-current-month-schedule.mjs --file /path/pasted-text.txt --month 2026-07 --apply
 *
 * The importer is idempotent by date + tour kind + capacity. Duplicate rows in
 * the pasted schedule are preserved as separate buses, but existing DB rows are
 * counted first so repeated runs do not create extra copies.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RATE = 26000;
const DEFAULT_SLEEP_BUS_CAPACITY = 40;

const TEMPLATE_NAMES = {
  dalat_chudes: "Далат Чудес",
  dalat_light: "Далат Light",
  dalat_vip: "Далат VIP",
  dalat_2day: "Dalat Discovery (2 дня)",
  hon_tam: "Остров Хон Там",
  northern_islands: "Северные острова: Орхидей + Обезьян",
  ba_ho_ttc: "Водопады Ба Хо + пляж ТТС",
  ba_ho_pagoda: "Бахо — джунгли и водопады",
  phan_rang: "Фанранг",
  lighthouse: "Маяк — земля первого рассвета",
  yang_bay: "Янг Бэй",
  asia_mix_islands: "Premium Islands — 3 острова",
  danang_1day: "Дананг 1 день",
  saigon_1day: "Сайгон 1 день",
  saigon_2day: "Сайгон 2 дня",
  fishing_lake: "Рыбалка озёрная",
};

const SLEEP_BUS_SLUGS = new Set(["danang_1day", "saigon_1day", "saigon_2day"]);
const TWO_DAY_SLUGS = new Set(["dalat_2day", ...SLEEP_BUS_SLUGS]);

function readEnv() {
  return Object.fromEntries(
    readFileSync(resolve(__dirname, "../.env.local"), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const eq = line.indexOf("=");
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toIso(ymd, hhmm) {
  return `${ymd}T${hhmm}:00+07:00`;
}

function localYmdFromIso(iso) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[—–]/g, "-")
    .replace(/[^\p{L}\p{N}$>+() ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripScheduleNoise(title) {
  return title
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s*‼️.*$/u, "")
    .replace(/\s*❗️.*$/u, "")
    .replace(/\s*🔥.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWithoutCapacity(title) {
  return stripScheduleNoise(title)
    .replace(/\s*\(max\s*\d+\)\s*/gi, " ")
    .replace(/\s*\(\s*\d+\s*\)\s*/g, " ")
    .replace(/\s*\(>\s*\d+\s*pax\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capacityFromTitle(title) {
  const max = title.match(/\bmax\s*(\d+)/i);
  if (max) return Number(max[1]);
  const simple = title.match(/\((\d+)\)/);
  if (simple) return Number(simple[1]);
  if (/> *\d+ *pax/i.test(title)) return DEFAULT_SLEEP_BUS_CAPACITY;
  return 15;
}

function usdFromTitle(title) {
  const match = title.match(/\((\d+(?:[.,]\d+)?)\s*\$\)/);
  if (!match) return 0;
  return Number(match[1].replace(",", "."));
}

function slugFromTitle(title) {
  const t = normalizeText(title);
  if (t.includes("da lat chudes") || t.includes("далат чудес")) return "dalat_chudes";
  if (t.includes("da lat light") || t.includes("далат light")) return "dalat_light";
  if (t.includes("da lat vip") || t.includes("далат vip")) return "dalat_vip";
  if (t.includes("da lat 2") || t.includes("dalat 2") || t.includes("далат 2")) return "dalat_2day";
  if (t.includes("premium islands") || t.includes("asia mix") || t.includes("азия микс")) return "asia_mix_islands";
  if (t.includes("danang 1") || t.includes("дананг 1")) return "danang_1day";
  if (t.includes("hon tam") || t.includes("хон там")) return "hon_tam";
  if (t.includes("northern islands") || t.includes("северные остров")) return "northern_islands";
  if (t.includes("бахо + ттс") || t.includes("ба хо + ттс")) return "ba_ho_ttc";
  if (t.includes("бахо") || t.includes("ба хо")) return "ba_ho_pagoda";
  if (t.includes("озерная рыбалка") || t.includes("озерн")) return "fishing_lake";
  if (t.includes("маяк")) return "lighthouse";
  if (t.includes("фанранг")) return "phan_rang";
  if (t.includes("янг бей")) return "yang_bay";
  if (t.includes("сайгон 2")) return "saigon_2day";
  if (t.includes("сайгон 1")) return "saigon_1day";
  return null;
}

function displayNameFor(entry, templateName) {
  if (entry.slug === "saigon_1day" || entry.slug === "saigon_2day") {
    return titleWithoutCapacity(entry.rawTitle);
  }
  return templateName;
}

function parseSchedule(text, targetMonth) {
  const entries = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const match = line.match(/(?:^|[^\d])(\d{2})\/(\d{2})\s+(.+?)(?:\s+[—-]\s*.*)?$/u);
    if (!match) continue;
    const day = Number(match[1]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;

    const rawTitle = stripScheduleNoise(match[3]);
    const slug = slugFromTitle(rawTitle);
    if (!slug) {
      entries.push({ skipped: true, reason: "unknown-title", rawTitle, sourceLine: line });
      continue;
    }

    const targetDate = `${targetMonth}-${String(day).padStart(2, "0")}`;
    const dateProbe = new Date(`${targetDate}T12:00:00+07:00`);
    if (Number.isNaN(dateProbe.getTime()) || dateProbe.toISOString().slice(0, 7) !== targetMonth) {
      entries.push({ skipped: true, reason: "invalid-date", rawTitle, sourceLine: line });
      continue;
    }

    entries.push({
      date: targetDate,
      rawTitle,
      slug,
      capacity: capacityFromTitle(rawTitle),
      days: TWO_DAY_SLUGS.has(slug) ? 2 : 1,
      explicitUsd: usdFromTitle(rawTitle),
      sourceLine: line,
    });
  }
  return entries;
}

function keyFor(date, slug, capacity) {
  return `${date}|${slug}|${capacity}`;
}

function countMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = keyFor(item.date, item.slug, item.capacity);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function monthBounds(month) {
  const start = `${month}-01`;
  const d = new Date(`${start}T12:00:00+07:00`);
  d.setMonth(d.getMonth() + 1);
  const next = d.toISOString().slice(0, 7);
  return {
    startIso: `${month}-01T00:00:00+07:00`,
    endIso: `${next}-01T00:00:00+07:00`,
  };
}

async function main() {
  const file = argValue("--file");
  const targetMonth = argValue("--month", "2026-07");
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Передайте --file /path/to/pasted-text.txt");
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) throw new Error("Передайте --month в формате YYYY-MM");

  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const text = readFileSync(file, "utf8");
  const parsed = parseSchedule(text, targetMonth);
  const skippedParse = parsed.filter((x) => x.skipped);
  const desired = parsed.filter((x) => !x.skipped);

  const { data: templates, error: tmplErr } = await supabase
    .from("tour_templates")
    .select("id,name,pickup_from,pickup_to,default_price_vnd,locations")
    .eq("active", true);
  if (tmplErr) throw new Error(`Templates fetch: ${tmplErr.message}`);

  const tmplByName = new Map((templates ?? []).map((t) => [t.name, t]));
  const slugByTemplateId = new Map();
  for (const [slug, name] of Object.entries(TEMPLATE_NAMES)) {
    const tmpl = tmplByName.get(name);
    if (tmpl?.id) slugByTemplateId.set(tmpl.id, slug);
  }

  const missingTemplates = [...new Set(desired.map((x) => x.slug))]
    .filter((slug) => !tmplByName.get(TEMPLATE_NAMES[slug]));
  if (missingTemplates.length > 0) {
    throw new Error(`Не найдены шаблоны: ${missingTemplates.map((s) => `${s} => ${TEMPLATE_NAMES[s]}`).join(", ")}`);
  }

  const { startIso, endIso } = monthBounds(targetMonth);
  const { data: existingRows, error: exErr } = await supabase
    .from("tours")
    .select("id,name,template_id,start_at,capacity")
    .gte("start_at", startIso)
    .lt("start_at", endIso)
    .is("deleted_at", null);
  if (exErr) throw new Error(`Existing tours fetch: ${exErr.message}`);

  const existingNormalized = (existingRows ?? [])
    .map((row) => {
      const date = localYmdFromIso(row.start_at);
      const slug = slugByTemplateId.get(row.template_id) ?? slugFromTitle(row.name);
      if (!slug) return null;
      return { date, slug, capacity: Number(row.capacity || 0) };
    })
    .filter(Boolean);

  const desiredCounts = countMap(desired);
  const existingCounts = countMap(existingNormalized);
  const toCreate = [];
  const usedCounts = new Map(existingCounts);
  for (const entry of desired) {
    const key = keyFor(entry.date, entry.slug, entry.capacity);
    const used = usedCounts.get(key) ?? 0;
    const wanted = desiredCounts.get(key) ?? 0;
    const existing = existingCounts.get(key) ?? 0;
    if (used - existing < Math.max(0, wanted - existing)) {
      toCreate.push(entry);
      usedCounts.set(key, used + 1);
    }
  }

  const { data: directorRows } = await supabase.from("users").select("id").eq("role", "director").eq("is_active", true).limit(1);
  const createdBy = directorRows?.[0]?.id ?? null;

  const rows = toCreate.map((entry) => {
    const tmpl = tmplByName.get(TEMPLATE_NAMES[entry.slug]);
    const startTime = String(tmpl.pickup_from ?? "08:00").slice(0, 5);
    const endTime = String(tmpl.pickup_to ?? addMinutes(startTime, 30)).slice(0, 5);
    const dateTo = entry.days > 1 ? addDays(entry.date, entry.days - 1) : entry.date;
    const explicitUsd = entry.explicitUsd > 0 ? entry.explicitUsd : 0;
    const locs = tmpl.locations;
    const templateUsd = locs && typeof locs === "object" && Number(locs.usd_price) > 0 ? Number(locs.usd_price) : 0;
    const templateVnd = Number(tmpl.default_price_vnd || 0);
    const finalUsd = explicitUsd || templateUsd || (templateVnd > 0 ? templateVnd / RATE : 0);
    const finalVnd = explicitUsd ? Math.round(explicitUsd * RATE) : templateVnd || Math.round(finalUsd * RATE);

    return {
      template_id: tmpl.id,
      name: displayNameFor(entry, tmpl.name),
      tour_type: "group",
      start_at: toIso(entry.date, startTime),
      end_at: toIso(dateTo, endTime),
      capacity: entry.capacity,
      default_offer_usd: Math.round(finalUsd * 10000) / 10000,
      default_offer_rate_to_vnd: RATE,
      default_offer_vnd: finalVnd,
      created_by: createdBy,
    };
  });

  const summaryByDate = new Map();
  for (const row of rows) {
    const date = String(row.start_at).slice(0, 10);
    summaryByDate.set(date, (summaryByDate.get(date) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        targetMonth,
        apply,
        parsed: parsed.length,
        desired: desired.length,
        skippedParse: skippedParse.length,
        existingInMonth: existingRows?.length ?? 0,
        toCreate: rows.length,
        byDate: Object.fromEntries([...summaryByDate.entries()].sort()),
        skippedTitles: skippedParse.slice(0, 20).map((x) => ({ reason: x.reason, title: x.rawTitle })),
      },
      null,
      2,
    ),
  );

  if (!apply || rows.length === 0) return;

  const chunkSize = 100;
  let created = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("tours").insert(chunk).select("id");
    if (error) throw new Error(`Insert chunk ${i / chunkSize + 1}: ${error.message}`);
    created += data?.length ?? chunk.length;
  }
  console.log(`Создано туров: ${created}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
