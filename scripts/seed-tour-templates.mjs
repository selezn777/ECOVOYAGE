/**
 * Seed tour templates for EcoVoyage CRM
 * Run: node scripts/seed-tour-templates.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")]; })
);

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], { auth: { persistSession: false } });

// Курс USD/VND по умолчанию
const RATE = 26000;
const usd = (price) => ({ currency: "USD", usd_price: price, vnd_price: Math.round(price * RATE) });

// ─── ШАБЛОНЫ ──────────────────────────────────────────────────────────────────

const TEMPLATES = [

  // ━━━━━━━━━━━━━━━━ ПЛЕЙСХОЛДЕРЫ (минимальный старт, заполнить через UI) ━━━━━━━━━━━━━━━━

  {
    name: "Эко-тур: Горный маршрут",
    pickup_from: "06:00",
    locations: usd(50),
    description: `ЭКО-ТУР: ГОРНЫЙ МАРШРУТ — 1 день
Выезд: 06:00–06:30 / Возвращение: ~18:00

Плейсхолдер-описание маршрута. Заполните реальную программу тура через карточку шаблона в CRM (директор → туры → шаблоны).`,
    tourist_send_copy: `Тур: Эко-тур: Горный маршрут
Выезд: 06:00–06:30 из вашего отеля`,
  },

  {
    name: "Городская экскурсия",
    pickup_from: "08:00",
    locations: usd(35),
    description: `ГОРОДСКАЯ ЭКСКУРСИЯ — 1 день
Выезд: 08:00–08:30 / Возвращение: ~16:00

Плейсхолдер-описание маршрута. Заполните реальную программу тура через карточку шаблона в CRM (директор → туры → шаблоны).`,
    tourist_send_copy: `Тур: Городская экскурсия
Выезд: 08:00–08:30 из вашего отеля`,
  },

  {
    name: "Морская прогулка",
    pickup_from: "07:00",
    locations: usd(65),
    description: `МОРСКАЯ ПРОГУЛКА — 1 день
Выезд: 07:00–07:30 / Возвращение: ~17:30

Плейсхолдер-описание маршрута. Заполните реальную программу тура через карточку шаблона в CRM (директор → туры → шаблоны).`,
    tourist_send_copy: `Тур: Морская прогулка
Выезд: 07:00–07:30 из вашего отеля`,
  },

];

// ─── ВСТАВКА ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nВставляем ${TEMPLATES.length} шаблонов туров...\n`);

  let ok = 0, skip = 0, err = 0;

  for (const t of TEMPLATES) {
    process.stdout.write(`  ${t.name}... `);

    const pickupFrom = t.pickup_from || null;
    const pickupTo = pickupFrom ? (() => {
      const [h, m] = pickupFrom.split(":").map(Number);
      const d = new Date(2000, 0, 1, h, m);
      d.setMinutes(d.getMinutes() + 30);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })() : null;

    const { error } = await supabase.from("tour_templates").insert([{
      name: t.name,
      description: t.description || null,
      tourist_send_copy: t.tourist_send_copy || null,
      pickup_mode: "range",
      pickup_from: pickupFrom,
      pickup_to: pickupTo,
      default_price_vnd: Math.round((t.locations.usd_price || 0) * RATE),
      locations: t.locations,
      active: true,
    }]);

    if (error) {
      if (error.code === "23505") {
        console.log("⚠️  уже существует");
        skip++;
      } else {
        console.log(`❌ ${error.message}`);
        err++;
      }
    } else {
      console.log("✓");
      ok++;
    }
  }

  console.log(`\n✅ Готово: ${ok} создано, ${skip} уже было, ${err} ошибок\n`);
}

await main();
