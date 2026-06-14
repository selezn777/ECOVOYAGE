/**
 * Gemini дизайн-консультант
 * Использование: node bin/gemini.mjs "вопрос по дизайну"
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")]; })
);

const API_KEY = env["GEMINI_API_KEY"];
if (!API_KEY) { console.error("❌ Нет GEMINI_API_KEY в .env.local"); process.exit(1); }

const QUESTION = process.argv.slice(2).join(" ");
if (!QUESTION) { console.error("Использование: node bin/gemini.mjs \"вопрос\""); process.exit(1); }

const SYSTEM = `Ты — эксперт по UI/UX дизайну мобильных приложений.
Контекст: Asia Mix CRM для турагентства. Тёмная тема, мобильный first, Tailwind CSS v4, Next.js 15.
Цветовая система: CSS-переменные (--accent оранжевый, --surface, --text, --muted, --border).
Отвечай конкретно: компоненты, Tailwind-классы, примеры кода если нужно. Без воды.`;

const body = {
  system_instruction: { parts: [{ text: SYSTEM }] },
  contents: [{ role: "user", parts: [{ text: QUESTION }] }],
  generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
};

async function call(model) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return { ok: r.ok, status: r.status, data: await r.json() };
}

// Пробуем 3.1 Pro, при quota/billing-ошибке — 2.5 Flash
let result = await call("gemini-3.1-pro-preview");
let model = "Gemini 3.1 Pro";

if (result.status === 429 || result.status === 403) {
  console.log("⚡ gemini-3.1-pro требует billing — использую gemini-2.5-flash\n");
  result = await call("gemini-2.5-flash");
  model = "Gemini 2.5 Flash";
}

if (!result.ok) {
  console.error("❌ Ошибка:", result.status, JSON.stringify(result.data).slice(0, 400));
  process.exit(1);
}

const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) { console.error("❌ Пустой ответ"); process.exit(1); }

console.log(`\n🤖 ${model}:\n`);
console.log(text);
