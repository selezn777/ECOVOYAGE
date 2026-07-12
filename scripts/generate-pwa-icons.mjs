/**
 * Generates PWA icons, iOS startup images, and Android launch splash bitmaps
 * from the Tourism Center logo.
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

const brandRed = "#e30613";
const splashBackground = "#ffffff";
const logoPng = readFileSync(join(publicDir, "tourism-center-logo.png")).toString("base64");
const logoHref = `data:image/png;base64,${logoPng}`;

function renderSvgToPng(svg, dest) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "original",
    },
  });
  writeFileSync(dest, resvg.render().asPng());
  console.log("Wrote", dest);
}

function logoSvg({ width, height, logoWidth, y, background = splashBackground }) {
  const logoHeight = logoWidth;
  const x = (width - logoWidth) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <circle cx="${width / 2}" cy="${y + logoHeight / 2}" r="${logoWidth * 0.43}" fill="${brandRed}" opacity="0.06"/>
  <image href="${logoHref}" x="${x}" y="${y}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

function writeIcon(size, filename) {
  renderSvgToPng(
    logoSvg({
      width: size,
      height: size,
      logoWidth: Math.round(size * 0.86),
      y: Math.round(size * 0.07),
    }),
    join(publicDir, filename),
  );
}

function writeSplash(width, height, filename, baseDir = publicDir) {
  const portrait = height >= width;
  const logoWidth = Math.round(width * (portrait ? 0.52 : 0.28));
  const y = Math.round((height - logoWidth) * (portrait ? 0.44 : 0.42));
  renderSvgToPng(logoSvg({ width, height, logoWidth, y }), join(baseDir, filename));
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
