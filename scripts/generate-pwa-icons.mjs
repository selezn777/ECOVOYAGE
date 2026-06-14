/**
 * Собирает PNG для PWA / apple-touch-icon из public/asiamix-logo.svg
 * Запуск: npm run pwa:icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public/asiamix-logo.svg");
const svg = readFileSync(svgPath);

function writePng(size, filename) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: size,
    },
  });
  const out = resvg.render();
  const buf = out.asPng();
  const dest = join(root, "public", filename);
  writeFileSync(dest, buf);
  console.log("Wrote", dest, `(${size}px)`);
}

writePng(180, "pwa-icon-180.png");
writePng(192, "pwa-icon-192.png");
writePng(512, "pwa-icon-512.png");
