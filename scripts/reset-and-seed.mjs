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

// ─── STAFF LIST (минимальный стартовый набор EcoVoyage) ────────────────────────
const STAFF = [
  { fullName: "Директор",              login: "director",       password: "EcoVoyage01!", role: "director" },
  { fullName: "Старший менеджер",      login: "chief.manager",   password: "EcoVoyage02!", role: "chief_manager" },
  { fullName: "Менеджер 1",            login: "manager1",        password: "EcoVoyage03!", role: "manager" },
  { fullName: "Менеджер 2",            login: "manager2",        password: "EcoVoyage04!", role: "manager" },
  { fullName: "Старший гид",           login: "chief.guide",     password: "EcoVoyage05!", role: "chief_guide" },
  { fullName: "Гид 1",                 login: "guide1",          password: "EcoVoyage06!", role: "guide" },
  { fullName: "Гид 2",                 login: "guide2",          password: "EcoVoyage07!", role: "guide" },
  { fullName: "Бухгалтер",             login: "accountant",      password: "EcoVoyage08!", role: "accountant" },
  { fullName: "Диспетчер",             login: "dispatcher",      password: "EcoVoyage09!", role: "dispatcher" },
  { fullName: "Диспетчер броней",      login: "booking.dispatcher", password: "EcoVoyage10!", role: "booking_dispatcher" },
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
    director:          "Директор",
    chief_manager:     "Старший менеджер",
    manager:           "Менеджер",
    chief_guide:       "Старший гид",
    guide:             "Гид",
    accountant:        "Бухгалтер",
    dispatcher:        "Операционка",
    booking_dispatcher: "Диспетчер броней",
  };

  const byRole = {};
  for (const r of results.filter((x) => x.status !== "error")) {
    const label = roleLabels[r.role] ?? r.role;
    if (!byRole[label]) byRole[label] = [];
    byRole[label].push(r);
  }

  let doc = `ECOVOYAGE CRM — АККАУНТЫ СОТРУДНИКОВ
Сгенерировано: ${new Date().toLocaleString("ru-RU")}
${"═".repeat(60)}

АДРЕС СИСТЕМЫ: https://eco.vercel.app (уточнить после настройки Vercel)
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

  const outPath = resolve(homedir(), "Desktop", "ecovoyage-crm-accounts.txt");
  writeFileSync(outPath, doc, "utf8");
  console.log(`\n📄 Документ с аккаунтами сохранён:\n   ${outPath}\n`);
  console.log(`✅ Создано ${results.filter((r) => r.status === "ok").length} аккаунтов\n`);
}
