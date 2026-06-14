#!/usr/bin/env node
/**
 * Запускает `cap sync android` с подхватом CAP_SERVER_URL из .env.mobile или .env.local.
 * См. .env.mobile.example
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function mergeEnvFromFile(relPath) {
  const p = resolve(root, relPath);
  if (!existsSync(p)) return;
  const parsed = parseEnv(readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || v === "") continue;
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
}

mergeEnvFromFile(".env.mobile");
mergeEnvFromFile(".env.local");

const url = (process.env.CAP_SERVER_URL || "").trim();
if (!url) {
  console.error(
    "[cap] Нет CAP_SERVER_URL.\n" +
      "  Скопируйте .env.mobile.example → .env.mobile и укажите URL прод-сайта (Vercel),\n" +
      "  либо добавьте CAP_SERVER_URL в .env.local, либо в shell: export CAP_SERVER_URL=https://...\n" +
      "  Затем: npm run mobile:sync"
  );
  process.exit(1);
}
if (!/^https:\/\//i.test(url)) {
  console.error("[cap] CAP_SERVER_URL должен начинаться с https:// (получено: %s)", url);
  process.exit(1);
}

const r = spawnSync("npx", ["cap", "sync", "android"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
