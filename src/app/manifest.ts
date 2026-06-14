import type { MetadataRoute } from "next";

/** PWA: установка «на экран домой» без App Store (Chrome/Android; Safari — «На экран Домой»). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Asia Mix — туры и CRM",
    short_name: "Asia Mix",
    description: "Туры, брони, финансы и команда",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    orientation: "portrait",
    background_color: "#f4f5f8",
    theme_color: "#e9492d",
    lang: "ru",
    icons: [
      {
        src: "/pwa-icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/asiamix-logo.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
