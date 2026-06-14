/**
 * Полный сброс системы + создание аккаунтов из документа.
 * Запуск: node scripts/reset-and-seed.mjs [--dry-run] [--show-users] [--do-reset] [--create-accounts]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

// ─── ENV ──────────────────────────────────────────────────────────────────────
const envPath = resolve(import.meta.dirname, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")];
    })
);

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SHOW_USERS = args.includes("--show-users");
const DO_RESET = args.includes("--do-reset");
const CREATE_ACCOUNTS = args.includes("--create-accounts");

// ─── STAFF LIST ───────────────────────────────────────────────────────────────
const STAFF = [
  // Chief manager
  { fullName: "Ушмодина Александра",   login: "aleksandra",     password: "AsiaMix01!", role: "chief_manager" },
  // Managers
  { fullName: "Торкайло Катерина",     login: "katerina.t",     password: "AsiaMix02!", role: "manager" },
  { fullName: "Иванькова Анастасия",   login: "anastasia.i",    password: "AsiaMix03!", role: "manager" },
  { fullName: "Никулин Данила",        login: "danila.n",       password: "AsiaMix04!", role: "manager" },
  { fullName: "Сулейманов Рустам",     login: "rustam.s",       password: "AsiaMix05!", role: "manager" },
  { fullName: "Брайчевская Наталья",   login: "natalia.b",      password: "AsiaMix06!", role: "manager" },
  { fullName: "Ковярова Юлия",         login: "julia.k",        password: "AsiaMix07!", role: "manager" },
  { fullName: "Федорова Светлана",     login: "svetlana.f",     password: "AsiaMix08!", role: "manager" },
  { fullName: "Бак Александр",         login: "aleksander.b",   password: "AsiaMix09!", role: "manager" },
  { fullName: "Просветов Илья",        login: "ilya.p",         password: "AsiaMix10!", role: "manager" },
  { fullName: "Смоляков Захар",        login: "zakhar.s",       password: "AsiaMix11!", role: "manager" },
  { fullName: "Иванькова Станислава",  login: "stanislava.i",   password: "AsiaMix12!", role: "manager" },
  { fullName: "Агеева Дарья",          login: "darya.a",        password: "AsiaMix13!", role: "manager" },
  { fullName: "Дильмурат Камал",       login: "dilmurad.k",     password: "AsiaMix14!", role: "manager" },
  { fullName: "Миллер Иван",           login: "ivan.m",         password: "AsiaMix15!", role: "manager" },
  // Online managers
  { fullName: "Лубягина Дарья",        login: "darya.l",        password: "AsiaMix16!", role: "manager" },
  { fullName: "Масловский Владлен",    login: "vladlen.m",      password: "AsiaMix17!", role: "manager" },
  { fullName: "Татьяна (TianaTours)", login: "tatiana.tt",     password: "AsiaMix18!", role: "manager" },
  { fullName: "Верещагина Анастасия",  login: "anastasiia.v",   password: "AsiaMix19!", role: "manager" },
  { fullName: "Айя",                   login: "aiya",           password: "AsiaMix20!", role: "manager" },
  // Chief guide
  { fullName: "Верховодов Руслан",     login: "ruslan.v",       password: "AsiaMix21!", role: "chief_guide" },
  // Guides
  { fullName: "Антонов Артур",         login: "artur.a",        password: "AsiaMix22!", role: "guide" },
  { fullName: "Котков Вячеслав",       login: "viacheslav.k",   password: "AsiaMix23!", role: "guide" },
  { fullName: "Хамов Роман",           login: "roman.kh",       password: "AsiaMix24!", role: "guide" },
  { fullName: "Ознобихин Ярослав",     login: "yaroslav.o",     password: "AsiaMix25!", role: "guide" },
  { fullName: "Васильева Анна",        login: "anna.v",         password: "AsiaMix26!", role: "guide" },
  { fullName: "Грешнов Валерий",       login: "valery.g",       password: "AsiaMix27!", role: "guide" },
  { fullName: "Дубровский Александр",  login: "aleksander.d",   password: "AsiaMix28!", role: "guide" },
  { fullName: "Селезнев Виктор",       login: "viktor.s",       password: "AsiaMix29!", role: "guide" },
  { fullName: "Васильченко Юрий",      login: "yury.v",         password: "AsiaMix30!", role: "guide" },
  { fullName: "Singaevskii Ivan",      login: "ivan.sg",        password: "AsiaMix31!", role: "guide" },
  { fullName: "Илья (гид)",            login: "ilya.g",         password: "AsiaMix32!", role: "guide" },
  { fullName: "Бакиева Елена",         login: "elena.b",        password: "AsiaMix33!", role: "guide" },
  { fullName: "Кандаурова Анна",       login: "anna.k",         password: "AsiaMix34!", role: "guide" },
  { fullName: "София",                 login: "sofia",          password: "AsiaMix35!", role: "guide" },
  // Accountant
  { fullName: "Сыдыкова Мария",        login: "maria.s",        password: "AsiaMix36!", role: "accountant" },
  // Operations / dispatcher
  { fullName: "Le Viet Vong",          login: "le.vong",        password: "AsiaMix37!", role: "dispatcher" },
  { fullName: "Бин (операционка)",     login: "bin",            password: "AsiaMix38!", role: "dispatcher" },
  // Тестовый аккаунт (только для демо — потенциальные покупатели)
  { fullName: "Тест (демо)",           login: "test",           password: "AsiaMix_Demo!", role: "guide", _isTest: true },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function wipe(table, marker = "id") {
  if (DRY_RUN) { console.log(`  [dry] DELETE FROM ${table}`); return; }
  const { error } = await supabase.from(table).delete().not(marker, "is", null);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(`${table}: ${error.message}`);
  }
}

// ─── SHOW CURRENT USERS ───────────────────────────────────────────────────────
if (SHOW_USERS || (!DO_RESET && !CREATE_ACCOUNTS)) {
  const { data, error } = await supabase.from("users").select("id,full_name,login,role,is_active").order("role");
  if (error) { console.error("❌", error.message); process.exit(1); }
  console.log("\n📋 ТЕКУЩИЕ ПОЛЬЗОВАТЕЛИ В БД:\n");
  console.log("Роль".padEnd(18) + "Логин".padEnd(22) + "Имя");
  console.log("─".repeat(70));
  for (const u of data) {
    console.log(String(u.role).padEnd(18) + String(u.login).padEnd(22) + u.full_name);
  }
  console.log(`\nВсего: ${data.length} аккаунт(ов)\n`);
}

// ─── FULL DATA RESET ──────────────────────────────────────────────────────────
if (DO_RESET) {
  console.log("\n🗑️  УДАЛЕНИЕ ВСЕХ ОПЕРАЦИОННЫХ ДАННЫХ...\n");

  const tables = [
    "booking_commission_shares", "booking_prices", "payments", "receipts",
    "tour_manifest_absences", ["tour_manifests", "tour_id"],
    "tour_office_cash_handovers", "guide_salary_records", "expenses",
    "bus_assignments", "tour_guides", "tour_booking_intents", "bookings",
    "tours", "ticket_sales", "guide_salary_templates", "manager_days_off",
    "guide_days_off", "employee_visa_runs", "in_app_notifications",
    "push_subscriptions", "deleted_items", "audit_logs",
    "cash_manual_ledger_entries", "cash_manual_ledger_categories",
    "rental_point_expenses", "rental_point_closed_days", "rental_point_rent_payments",
    "rental_points", "staff_reviews", "manager_reviews", "guide_reviews",
    "tour_templates", "ticket_templates", "currency_rates",
    "office_cash_handover_channels", "employee_bonus_records",
    "employee_monthly_payroll", "manager_point_openings",
    "rental_point_expense_requests", "booking_cancellation_requests",
  ];

  for (const t of tables) {
    const [table, marker] = Array.isArray(t) ? t : [t, "id"];
    process.stdout.write(`  Очищаю ${table}... `);
    await wipe(table, marker);
    console.log("✓");
  }

  // Удаляем всех пользователей кроме директора и тестового аккаунта
  console.log("\n👥 УДАЛЕНИЕ ВСЕХ СОТРУДНИКОВ...\n");
  const { data: allUsers } = await supabase.from("users").select("id,full_name,login,role");

  const toKeep = (allUsers ?? []).filter(
    (u) => u.role === "director"
  );
  const toDelete = (allUsers ?? []).filter(
    (u) => u.role !== "director"
  );

  console.log("  Оставляем:");
  for (const u of toKeep) console.log(`    ✅ [${u.role}] ${u.login} — ${u.full_name}`);

  console.log("\n  Удаляем:");
  for (const u of toDelete) console.log(`    ❌ [${u.role}] ${u.login} — ${u.full_name}`);

  if (!DRY_RUN && toDelete.length > 0) {
    const { error } = await supabase.from("users").delete().in("id", toDelete.map((u) => u.id));
    if (error) { console.error("❌ Ошибка удаления:", error.message); process.exit(1); }
  }

  console.log(`\n✅ Сброс завершён. Осталось ${toKeep.length} аккаунт(ов).\n`);
}

// ─── CREATE ACCOUNTS ─────────────────────────────────────────────────────────
if (CREATE_ACCOUNTS) {
  console.log("\n👤 СОЗДАНИЕ АККАУНТОВ СОТРУДНИКОВ...\n");

  const results = [];
  for (const s of STAFF) {
    process.stdout.write(`  ${s.fullName} [${s.role}]... `);
    if (DRY_RUN) {
      console.log("(dry)");
      results.push({ ...s, status: "dry" });
      continue;
    }
    const { error } = await supabase.from("users").insert([{
      full_name: s.fullName,
      login: s.login,
      password: s.password,
      role: s.role,
      is_active: true,
    }]);
    if (error) {
      if (error.code === "23505") {
        console.log("⚠️  логин занят");
        results.push({ ...s, status: "dup" });
      } else {
        console.log(`❌ ${error.message}`);
        results.push({ ...s, status: "error", err: error.message });
      }
    } else {
      console.log("✓");
      results.push({ ...s, status: "ok" });
    }
  }

  // ─── GENERATE CREDENTIALS DOCUMENT ─────────────────────────────────────────
  const roleLabels = {
    chief_manager: "Старший менеджер",
    manager:       "Менеджер",
    chief_guide:   "Старший гид",
    guide:         "Гид",
    accountant:    "Бухгалтер",
    dispatcher:    "Операционка",
  };

  const byRole = {};
  for (const r of results.filter((x) => x.status !== "error")) {
    const label = roleLabels[r.role] ?? r.role;
    if (!byRole[label]) byRole[label] = [];
    byRole[label].push(r);
  }

  let doc = `ASIA MIX CRM — АККАУНТЫ СОТРУДНИКОВ
Сгенерировано: ${new Date().toLocaleString("ru-RU")}
${"═".repeat(60)}

АДРЕС СИСТЕМЫ: https://asiamixxx-1.vercel.app
ВХОД: логин + пароль (латинскими буквами)

${"═".repeat(60)}
`;

  for (const [label, users] of Object.entries(byRole)) {
    doc += `\n${label.toUpperCase()}\n${"─".repeat(40)}\n`;
    for (const u of users) {
      doc += `\n  ${u.fullName}\n`;
      doc += `  Логин:  ${u.login}\n`;
      doc += `  Пароль: ${u.password}\n`;
    }
  }

  doc += `\n${"═".repeat(60)}\n`;
  doc += `ВАЖНО: После первого входа попросите сотрудников\n`;
  doc += `сменить пароль в настройках профиля.\n`;

  const outPath = resolve(homedir(), "Desktop", "asia-mix-crm-accounts.txt");
  writeFileSync(outPath, doc, "utf8");
  console.log(`\n📄 Документ с аккаунтами сохранён:\n   ${outPath}\n`);
  console.log(`✅ Создано ${results.filter((r) => r.status === "ok").length} аккаунтов\n`);
}
