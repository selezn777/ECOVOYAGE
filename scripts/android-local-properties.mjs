#!/usr/bin/env node
/**
 * Создаёт android/local.properties с sdk.dir, если известен путь к Android SDK.
 * Приоритет: ANDROID_HOME → macOS ~/Library/Android/sdk → ~/Android/Sdk
 */
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const androidDir = resolve(root, "android");
const outFile = resolve(androidDir, "local.properties");

function pickSdk() {
  const fromEnv = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "").trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const mac = resolve(homedir(), "Library/Android/sdk");
  if (existsSync(mac)) return mac;
  const alt = resolve(homedir(), "Android/Sdk");
  if (existsSync(alt)) return alt;
  return null;
}

const sdk = pickSdk();
if (!sdk) {
  console.error(
    "[android] Не найден Android SDK.\n" +
      "  1) Установите Android Studio: https://developer.android.com/studio\n" +
      "  2) В Studio: Settings → Languages & Frameworks → Android SDK — путь к «Android SDK Location».\n" +
      "  3) Либо: export ANDROID_HOME=\"/путь/к/sdk\"\n" +
      "  4) Либо скопируйте android/local.properties.example → android/local.properties и задайте sdk.dir=...\n" +
      "  Ожидаемые пути на macOS: ~/Library/Android/sdk"
  );
  process.exit(1);
}

const line = `sdk.dir=${sdk.replace(/\\/g, "/")}\n`;
writeFileSync(outFile, line, "utf8");
console.log("[android] Записано %s", outFile);
console.log("[android] sdk.dir=%s", sdk);
