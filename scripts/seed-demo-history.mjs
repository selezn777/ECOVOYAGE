/**
 * Demo-наполнение EcoVoyage: рядовые менеджеры/гиды + история туров и продаж
 * за последние N дней, на реальных шаблонах туров, уже созданных в CRM.
 *
 * Без директора, без старших ролей — только manager/guide.
 * Имена туристов, телефоны и WhatsApp — латиницей (демо-клиенты).
 *
 * Run:
 *   node scripts/seed-demo-history.mjs              # создать историю (60 дней)
 *   node scripts/seed-demo-history.mjs --days=90     # за 90 дней
 *   node scripts/seed-demo-history.mjs --undo        # удалить всё, что создал этот скрипт
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const __dir = import.meta.dirname;
const env = Object.fromEntries(
  readFileSync(resolve(__dir, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const UNDO = args.includes("--undo");
const daysArg = args.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.split("=")[1]) : 60;
const RATE = 26000;
const LOG_PATH = resolve(__dir, ".demo-seed-log.json");

// ─── СОТРУДНИКИ (только manager/guide, без директора и старших ролей) ─────────
const MANAGERS = [
  { fullName: "James Carter", login: "james.carter", password: "EcoVoyage11!", phone: "+84901234511" },
  { fullName: "Olivia Bennett", login: "olivia.bennett", password: "EcoVoyage12!", phone: "+84901234512" },
  { fullName: "Daniel Walsh", login: "daniel.walsh", password: "EcoVoyage13!", phone: "+84901234513" },
  { fullName: "Sophie Turner", login: "sophie.turner", password: "EcoVoyage14!", phone: "+84901234514" },
];

const GUIDES = [
  { fullName: "Ryan Mitchell", login: "ryan.mitchell", password: "EcoVoyage15!", phone: "+84901234515" },
  { fullName: "Emma Collins", login: "emma.collins", password: "EcoVoyage16!", phone: "+84901234516" },
  { fullName: "Lucas Reed", login: "lucas.reed", password: "EcoVoyage17!", phone: "+84901234517" },
  { fullName: "Grace Foster", login: "grace.foster", password: "EcoVoyage18!", phone: "+84901234518" },
];

// ─── ПУЛ ТУРИСТОВ (демо, латиница, разные страны) ─────────────────────────────
const TOURIST_NAMES = [
  "John Mitchell", "Sarah Connor", "Michael Brown", "Laura Bennett", "David Wilson",
  "Emily Clark", "Robert King", "Anna Schmidt", "Thomas Müller", "Jessica Adams",
  "Mark Anderson", "Sophie Dubois", "Chris Evans", "Natalie Wood", "Peter Hughes",
  "Lisa Romano", "Andrew Scott", "Victoria Hayes", "Kevin O'Brien", "Megan Foster",
  "Brian Murphy", "Hannah White", "Steven Clarke", "Rachel Green", "Tom Becker",
  "Olga Petrova", "Igor Sokolov", "Maria Ivanova", "Alex Johansson", "Linda Park",
];

const COUNTRY_CODES = ["+1", "+44", "+61", "+49", "+33", "+7", "+82", "+972", "+46"];

const HOTELS = [
  "Sheraton Nha Trang Hotel", "InterContinental Nha Trang", "Mia Resort Nha Trang",
  "Havana Nha Trang Hotel", "Liberty Central Nha Trang", "Vinpearl Discovery Nha Trang",
  "Sunrise Nha Trang Beach Hotel", "Novotel Nha Trang", "Mường Thanh Nha Trang",
  "Citadines Bayfront Nha Trang",
];

const DEMO_MARKER = "[[ECOVOYAGE_DEMO_SEED]]";

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

function randomPhone() {
  const cc = rand(COUNTRY_CODES);
  let digits = "";
  for (let i = 0; i < 9; i++) digits += randInt(0, 9);
  return `${cc}${digits}`;
}

// ─── UNDO ──────────────────────────────────────────────────────────────────────
async function undo() {
  if (!existsSync(LOG_PATH)) {
    console.log("Нет лог-файла предыдущего запуска — нечего откатывать.");
    return;
  }
  const log = JSON.parse(readFileSync(LOG_PATH, "utf8"));

  console.log(`\n🗑️  Откат демо-данных (${log.tourIds.length} туров, ${log.userIds.length} сотрудников)...\n`);

  if (log.bookingIds.length) {
    await supabase.from("booking_prices").delete().in("booking_id", log.bookingIds);
    await supabase.from("bookings").delete().in("id", log.bookingIds);
  }
  if (log.tourIds.length) {
    await supabase.from("tour_guides").delete().in("tour_id", log.tourIds);
    await supabase.from("tours").delete().in("id", log.tourIds);
  }
  if (log.userIds.length) {
    await supabase.from("users").delete().in("id", log.userIds);
  }

  writeFileSync(LOG_PATH, JSON.stringify({ tourIds: [], bookingIds: [], userIds: [] }, null, 2));
  console.log("✅ Откат завершён.\n");
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  if (UNDO) return undo();

  console.log(`\n🌱 Демо-наполнение EcoVoyage: история за ${DAYS} дней\n`);

  // 1) Шаблоны туров — берём то, что уже создано в CRM (директором, через UI)
  const { data: templates, error: tmplErr } = await supabase
    .from("tour_templates")
    .select("id, name, locations, default_price_vnd")
    .eq("active", true);
  if (tmplErr) throw new Error(`Templates: ${tmplErr.message}`);
  if (!templates?.length) {
    console.error("❌ В tour_templates нет активных шаблонов. Сначала создайте хотя бы один тур-шаблон через CRM (директор → туры → шаблоны), затем запустите скрипт снова.");
    process.exit(1);
  }

  // 2) Сотрудники: manager / guide (без директора и старших ролей)
  const userIds = [];
  const managerIds = [];
  const guideIds = [];

  for (const m of MANAGERS) {
    const { data: existing } = await supabase.from("users").select("id").eq("login", m.login).maybeSingle();
    if (existing) { managerIds.push(existing.id); continue; }
    const { data, error } = await supabase.from("users").insert([{
      full_name: m.fullName, login: m.login, password: m.password, phone: m.phone, role: "manager", is_active: true,
    }]).select("id").single();
    if (error) { console.error(`❌ ${m.fullName}: ${error.message}`); continue; }
    managerIds.push(data.id); userIds.push(data.id);
    console.log(`✅ менеджер  ${m.fullName} (${m.login})`);
  }

  for (const g of GUIDES) {
    const { data: existing } = await supabase.from("users").select("id").eq("login", g.login).maybeSingle();
    if (existing) { guideIds.push(existing.id); continue; }
    const { data, error } = await supabase.from("users").insert([{
      full_name: g.fullName, login: g.login, password: g.password, phone: g.phone, role: "guide", is_active: true,
    }]).select("id").single();
    if (error) { console.error(`❌ ${g.fullName}: ${error.message}`); continue; }
    guideIds.push(data.id); userIds.push(data.id);
    console.log(`✅ гид       ${g.fullName} (${g.login})`);
  }

  if (!managerIds.length || !guideIds.length) {
    console.error("❌ Не удалось создать ни одного менеджера/гида — прерываю.");
    process.exit(1);
  }

  // 3) История туров за последние DAYS дней (1-3 тура/день)
  const tourIds = [];
  const bookingIds = [];
  let totalRevenueUsd = 0;
  let totalPax = 0;

  const now = new Date();

  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const ymd = day.toISOString().slice(0, 10);

    const toursToday = randInt(1, 3);
    for (let t = 0; t < toursToday; t++) {
      const tmpl = rand(templates);
      const startTime = rand(["07:00", "07:30", "08:00", "08:30"]);
      const startAt = `${ymd}T${startTime}:00+07:00`;
      const endAt = `${ymd}T18:00:00+07:00`;

      let finalUsd = tmpl.locations?.usd_price > 0
        ? tmpl.locations.usd_price
        : (Number(tmpl.default_price_vnd) || 0) / RATE;
      if (!finalUsd || finalUsd <= 0) finalUsd = 45;
      const finalVnd = Math.round(finalUsd * RATE);

      const manager = rand(managerIds);
      const { data: tour, error: tourErr } = await supabase.from("tours").insert([{
        template_id: tmpl.id,
        name: tmpl.name,
        tour_type: "group",
        start_at: startAt,
        end_at: endAt,
        capacity: randInt(12, 20),
        default_offer_usd: Math.round(finalUsd * 10000) / 10000,
        default_offer_rate_to_vnd: RATE,
        default_offer_vnd: finalVnd,
        status: "completed",
        created_by: manager,
      }]).select("id").single();
      if (tourErr) { console.error(`❌ tour ${ymd} ${tmpl.name}: ${tourErr.message}`); continue; }
      tourIds.push(tour.id);

      await supabase.from("tour_guides").insert([{ tour_id: tour.id, guide_id: rand(guideIds), is_primary: true }]);

      // 1–5 бронирований на тур
      const bookingsCount = randInt(1, 5);
      for (let b = 0; b < bookingsCount; b++) {
        const adults = randInt(1, 3);
        const children = randInt(0, 1) === 1 ? randInt(1, 2) : 0;
        const customerName = rand(TOURIST_NAMES);
        const phone = randomPhone();
        const whatsapp = randomPhone();

        const { data: booking, error: bErr } = await supabase.from("bookings").insert([{
          tour_id: tour.id,
          manager_id: manager,
          hotel_name: rand(HOTELS),
          customer_name: customerName,
          phone_e164: phone,
          phone_alt_e164: whatsapp,
          adults,
          children,
          infants: 0,
          note: DEMO_MARKER,
        }]).select("id").single();
        if (bErr) { console.error(`❌ booking ${customerName}: ${bErr.message}`); continue; }
        bookingIds.push(booking.id);

        const pax = adults + children;
        const amountUsd = Math.round(finalUsd * pax * 100) / 100;
        const amountVnd = Math.round(amountUsd * RATE);
        await supabase.from("booking_prices").insert([{
          booking_id: booking.id,
          person_label: `${adults} adult(s)${children ? ` + ${children} child(ren)` : ""}`,
          amount: amountUsd,
          currency: "USD",
          rate_to_vnd: RATE,
          amount_vnd: amountVnd,
        }]);

        totalRevenueUsd += amountUsd;
        totalPax += pax;
      }
    }
  }

  writeFileSync(LOG_PATH, JSON.stringify({ tourIds, bookingIds, userIds }, null, 2));

  console.log(`\n🏁 Готово:`);
  console.log(`   Туров создано:      ${tourIds.length}`);
  console.log(`   Бронирований:       ${bookingIds.length}`);
  console.log(`   Туристов (pax):     ${totalPax}`);
  console.log(`   Выручка (демо):     $${totalRevenueUsd.toFixed(2)} (~${Math.round(totalRevenueUsd * RATE).toLocaleString("en-US")} VND)`);
  console.log(`\n   Лог для отката сохранён: ${LOG_PATH}`);
  console.log(`   Откатить: node scripts/seed-demo-history.mjs --undo\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
