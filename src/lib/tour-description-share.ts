import type { Role } from "@/lib/types";

export type LocationRef = { url: string; name: string };
export type TourTemplateLocation = {
  name: string;
  description: string;
  mapUrl: string;
  /** Рекомендуемое время на точке (HH:MM), опционально. */
  recommendedTime?: string;
  /** Доп. апселл/плюсик на локации в VND, опционально. */
  plusVnd?: number;
  /** Кто платит на этой локации: гид или офис. */
  paidBy?: "guide" | "office";
};

const LOCATIONS_JSON_MARKER = "[[AMX_LOCATIONS_V1]]";

function stripGoogleMapUrls(raw: string): string {
  const urls = extractGoogleMapsUrls(raw).map((u) => u.url);
  let t = String(raw || "");
  for (const u of urls) {
    t = t.split(u).join("");
  }
  return t.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractLocationNameFromGoogleMapsUrl(url: string): string {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("destination") || "";
    if (q) return decodeURIComponent(q).trim();
  } catch {
    // ignore
  }
  return "Локация";
}

export function extractGoogleMapsUrls(text: string): LocationRef[] {
  const re =
    /(https?:\/\/(?:www\.)?google\.com\/maps\/[^\s)]+|https?:\/\/maps\.google\.com\/[^\s)]+)/gi;
  const out = new Map<string, LocationRef>();
  for (const m of String(text || "").matchAll(re)) {
    const url = m[1] || m[0];
    if (!url) continue;
    if (out.has(url)) continue;
    out.set(url, { url, name: extractLocationNameFromGoogleMapsUrl(url) });
  }
  return [...out.values()];
}

export function parseTemplateDescription(raw: string): { description: string; locations: TourTemplateLocation[] } {
  const txt = String(raw || "");
  const idx = txt.indexOf(LOCATIONS_JSON_MARKER);
  if (idx < 0) {
    const fallback = extractGoogleMapsUrls(txt).map((u, i) => ({
      name: u.name || `Локация ${i + 1}`,
      description: "",
      mapUrl: u.url,
      recommendedTime: "",
      plusVnd: 0,
    }));
    return { description: stripGoogleMapUrls(txt), locations: fallback };
  }
  const base = txt.slice(0, idx).trimEnd();
  const jsonPart = txt.slice(idx + LOCATIONS_JSON_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as unknown;
    if (!Array.isArray(parsed)) return { description: base, locations: [] };
    const locations = parsed
      .map((r) => {
        const row = r as {
          name?: unknown;
          description?: unknown;
          mapUrl?: unknown;
          recommendedTime?: unknown;
          plusVnd?: unknown;
          paidBy?: unknown;
        };
        const name = String(row.name ?? "").trim();
        const description = String(row.description ?? "").trim();
        const mapUrl = String(row.mapUrl ?? "").trim();
        const recommendedTime = String(row.recommendedTime ?? "").trim();
        const plusVndRaw = Number(row.plusVnd ?? 0);
        const plusVnd = Number.isFinite(plusVndRaw) ? Math.max(0, Math.round(plusVndRaw)) : 0;
        if (!name) return null;
        const paidByRaw = String(row.paidBy ?? "").trim();
        const paidBy = paidByRaw === "guide" || paidByRaw === "office" ? paidByRaw : undefined;
        const out: TourTemplateLocation = {
          name,
          description,
          mapUrl,
          ...(recommendedTime ? { recommendedTime } : {}),
          ...(plusVnd > 0 ? { plusVnd } : {}),
          ...(paidBy ? { paidBy } : {}),
        };
        return out;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return { description: base, locations };
  } catch {
    return { description: stripGoogleMapUrls(base), locations: [] };
  }
}

export function buildTemplateDescription(baseDescription: string, locations: TourTemplateLocation[]): string {
  const base = String(baseDescription || "").trim();
  const cleanLocations = locations
    .map((l) => {
      const paidBy = l.paidBy === "guide" || l.paidBy === "office" ? l.paidBy : undefined;
      return {
        name: String(l.name || "").trim(),
        description: String(l.description || "").trim(),
        mapUrl: String(l.mapUrl || "").trim(),
        recommendedTime: String(l.recommendedTime || "").trim(),
        plusVnd: Math.max(0, Math.round(Number(l.plusVnd || 0))),
        ...(paidBy ? { paidBy } : {}),
      };
    })
    .filter((l) => l.name);
  if (cleanLocations.length === 0) return base;
  const payload = JSON.stringify(cleanLocations);
  return `${base}${base ? "\n\n" : ""}${LOCATIONS_JSON_MARKER}\n${payload}`;
}

export function canSeeLocationLinks(role?: Role): boolean {
  if (!role) return true;
  return role !== "manager";
}

export function sanitizeDescriptionForDisplay(raw: string): string {
  const parsed = parseTemplateDescription(raw);
  return stripGoogleMapUrls(parsed.description);
}

export function buildWhatsappText(opts: {
  tourName: string;
  tourDate: string;
  pickupWindow?: string;
  description: string;
  urls: LocationRef[];
  includeUrls?: boolean;
}): string {
  const desc = String(opts.description || "").trim();
  const header = `${opts.tourName} | ${opts.tourDate}`;
  const pickupLine = opts.pickupWindow ? `\nЛучшее время чтобы приезжать: ${opts.pickupWindow}` : "";
  const locs =
    opts.includeUrls !== false && opts.urls.length > 0
      ? `\n\nЛокации:\n${opts.urls
          .map((l, i) => `${i + 1}. ${l.name}\n${l.url}`)
          .join("\n\n")}`
      : "";
  return `${header}${pickupLine}\n\n${desc ? desc : "Описание не указано"}` + locs;
}
