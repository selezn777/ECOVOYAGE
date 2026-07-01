/**
 * Generates PWA icons, iOS startup images, and Android launch splash bitmaps
 * from the transparent EcoVoyage mark.
 *
 * Run: npm run pwa:icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");
const androidResDir = join(root, "android", "app", "src", "main", "res");

const brandGreen = "#a8ce40";
const splashBackground = "#ffffff";
const markPng = readFileSync(join(publicDir, "ecovoyage-mark.png")).toString("base64");
const markHref = `data:image/png;base64,${markPng}`;

function renderSvgToPng(svg, dest) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "original",
    },
  });
  writeFileSync(dest, resvg.render().asPng());
  console.log("Wrote", dest);
}

function markMaskSvg({ width, height, markWidth, y, background = splashBackground, includeWordmark = false }) {
  const markHeight = markWidth * (201 / 187);
  const x = (width - markWidth) / 2;
  const wordmark = includeWordmark
    ? `<text x="${width / 2}" y="${y + markHeight + width * 0.08}" text-anchor="middle"
        font-family="Georgia, serif" font-size="${Math.max(22, width * 0.115)}"
        font-weight="700" letter-spacing="${Math.max(2, width * 0.012)}" fill="${brandGreen}">ECO VOYAGE</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <mask id="markMask" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${markWidth}" height="${markHeight}">
    <image href="${markHref}" x="${x}" y="${y}" width="${markWidth}" height="${markHeight}" preserveAspectRatio="xMidYMid meet"/>
  </mask>
  <rect x="${x}" y="${y}" width="${markWidth}" height="${markHeight}" fill="${brandGreen}" mask="url(#markMask)"/>
  ${wordmark}
</svg>`;
}

function writeIcon(size, filename) {
  renderSvgToPng(
    markMaskSvg({
      width: size,
      height: size,
      markWidth: Math.round(size * 0.58),
      y: Math.round(size * 0.18),
      includeWordmark: size >= 180,
    }),
    join(publicDir, filename),
  );
}

function writeSplash(width, height, filename, baseDir = publicDir) {
  const portrait = height >= width;
  const markWidth = Math.round(width * (portrait ? 0.56 : 0.3));
  const markHeight = markWidth * (201 / 187);
  const y = Math.round((height - markHeight) * (portrait ? 0.45 : 0.44));
  renderSvgToPng(markMaskSvg({ width, height, markWidth, y }), join(baseDir, filename));
}

writeIcon(180, "pwa-icon-180.png");
writeIcon(192, "pwa-icon-192.png");
writeIcon(512, "pwa-icon-512.png");

for (const [w, h] of [
  [640, 1136],
  [750, 1334],
  [1125, 2436],
  [828, 1792],
  [1242, 2688],
  [1170, 2532],
  [1284, 2778],
  [1179, 2556],
  [1290, 2796],
  [1206, 2622],
  [1320, 2868],
]) {
  writeSplash(w, h, `apple-splash-${w}x${h}.png`);
}

for (const [dir, w, h] of [
  ["drawable", 480, 320],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
]) {
  writeSplash(w, h, "splash.png", join(androidResDir, dir));
}
