/**
 * Надёжный накат миграций для Supabase:
 * - всегда использует явный --db-url;
 * - ПРИОРИТЕТНО использует pooler-host (IPv4 friendly);
 * - не требует глобального supabase CLI (запускает через npx);
 * - очищает конфликтные env-переменные;
 * - может запросить пароль интерактивно (не сохраняет его в файлы).
 *
 * Примеры:
 *   npm run db:push:env
 *   npm run db:push:env -- --include-all
 *   SUPABASE_DB_PASSWORD=... SUPABASE_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com npm run db:push:env -- --include-all
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseDotEnv(content) {
  const env = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fromFile = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, "utf8")) : {};
const pwdFromEnv = process.env.SUPABASE_DB_PASSWORD || fromFile.SUPABASE_DB_PASSWORD;
const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fromFile.NEXT_PUBLIC_SUPABASE_URL || "";
const poolerHost = process.env.SUPABASE_POOLER_HOST || fromFile.SUPABASE_POOLER_HOST || "";
const poolerPortRaw = process.env.SUPABASE_POOLER_PORT || fromFile.SUPABASE_POOLER_PORT || "6543";
const defaultPoolerHost = "aws-1-us-east-1.pooler.supabase.com";

function escapePasswordForUrl(raw) {
  return encodeURIComponent(String(raw));
}

function projectRefFromAppUrl(url) {
  try {
    const u = new URL(url);
    const first = (u.hostname || "").split(".")[0] || "";
    return first.trim();
  } catch {
    return "";
  }
}

function maskConnectionUrl(url) {
  return url.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/i, "$1***@");
}

function askHidden(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      char = `${char}`;
      if (char === "\n" || char === "\r" || char === "\u0004") return;
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${promptText}${"*".repeat(rl.line.length)}`);
    };
    process.stdin.on("data", onData);
    rl.question(promptText, (value) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(value.trim());
    });
  });
}

function normalizePoolerPort(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "6543";
  if (n < 1 || n > 65535) return "6543";
  return String(Math.round(n));
}

function buildPoolerUrl(ref, pwd, host, port) {
  const encodedPwd = escapePasswordForUrl(pwd);
  return `postgresql://postgres.${ref}:${encodedPwd}@${host}:${port}/postgres?sslmode=require&pgbouncer=true`;
}

function getDbInputFromInputs() {
  const explicitDbUrl = process.env.SUPABASE_DB_URL || fromFile.SUPABASE_DB_URL;
  if (explicitDbUrl && /^postgres(ql)?:\/\//i.test(explicitDbUrl.trim())) {
    return { kind: "explicit_url", dbUrl: explicitDbUrl.trim() };
  }

  const ref = projectRefFromAppUrl(appUrl) || process.env.SUPABASE_PROJECT_REF || fromFile.SUPABASE_PROJECT_REF;
  if (ref) {
    return {
      kind: "project_ref",
      ref: String(ref).trim(),
      poolerHost: String(poolerHost).trim() || defaultPoolerHost,
      poolerPort: normalizePoolerPort(poolerPortRaw),
    };
  }

  const fallbackDbUrl = process.env.DATABASE_URL || fromFile.DATABASE_URL;
  if (fallbackDbUrl && /^postgres(ql)?:\/\//i.test(fallbackDbUrl.trim())) {
    return { kind: "explicit_url", dbUrl: fallbackDbUrl.trim() };
  }
  return null;
}

async function main() {
  const extraArgs = process.argv.slice(2);
  const dbInput = getDbInputFromInputs();
  let dbUrlFinal = null;

  if (dbInput?.kind === "explicit_url") {
    dbUrlFinal = dbInput.dbUrl;
  } else if (dbInput?.kind === "project_ref") {
    const pwd =
      pwdFromEnv ||
      (await askHidden(`Введите пароль БД Supabase для ${dbInput.ref} (ввод скрыт): `));
    if (!pwd) {
      console.error("Пароль пустой. Операция отменена.");
      process.exit(1);
    }
    dbUrlFinal = buildPoolerUrl(dbInput.ref, pwd, dbInput.poolerHost, dbInput.poolerPort);
  }

  if (!dbUrlFinal) {
    console.error("Не удалось собрать подключение к БД.");
    console.error("Добавьте в .env.local:");
    console.error('  NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"');
    console.error('  SUPABASE_POOLER_HOST="aws-1-us-east-1.pooler.supabase.com"');
    console.error('  SUPABASE_POOLER_PORT="6543"');
    console.error("или передайте SUPABASE_DB_URL / DATABASE_URL.");
    process.exit(1);
  }

  console.log(`Запуск: supabase db push --db-url ${maskConnectionUrl(dbUrlFinal)} ${extraArgs.join(" ")}`.trim());

  const cleanEnv = { ...process.env };
  delete cleanEnv.DATABASE_URL;
  delete cleanEnv.SUPABASE_DB_PASSWORD;

  const r = spawnSync("npx", ["supabase", "db", "push", "--db-url", dbUrlFinal, "--yes", ...extraArgs], {
    cwd: root,
    stdio: "inherit",
    env: cleanEnv,
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

await main();
