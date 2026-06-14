import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-session";
import { canCreateTemplateTour, canCreateTour } from "@/lib/role-policy";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { actorUuidOrNull } from "@/lib/actor-id";
import { writeAuditLog } from "@/lib/audit";
import { buildTemplateDescription, type TourTemplateLocation } from "@/lib/tour-description-share";

function add30Minutes(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(2000, 0, 1, h || 0, m || 0);
  dt.setMinutes(dt.getMinutes() + 30);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

const payloadSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().optional(),
  shopLabels: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  templateLocations: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(400).optional().or(z.literal("")),
        mapUrl: z.string().trim().max(500).optional().or(z.literal("")),
        recommendedTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        plusVnd: z.coerce.number().min(0).max(2_000_000_000).optional(),
      }),
    )
    .max(30)
    .optional(),
  shopLabel: z.string().trim().max(60).optional().or(z.literal("")),
  pickupFrom: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  tourType: z.enum(["group", "private"]),
  defaultPrice: z.coerce.number().min(0).optional(),
  currency: z.enum(["VND", "USD"]).optional(),
  usdToVndRate: z.coerce.number().min(1).optional(),
  /** Текст для туриста: время выезда, что взять — копия и предзаполнение WhatsApp на карточке брони. */
  touristSendCopy: z.string().max(8000).optional().or(z.literal("")),
});

function splitShopLabels(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/\s*(?:\||,|;|\n)\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateTour(session.role)) return apiDenied();
  const canCreateTemplate = canCreateTemplateTour(session.role);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен. Заполните .env.local." }, { status: 500 });
  }

  /**
   * `select("*")` - если в проде нет колонки `shop_label` (миграция не накатывалась), явный список колонок
   * даёт ошибку PostgREST и фронт получал пустой массив без текста ошибки.
   */
  const { data, error } = await supabase.from("tour_templates").select("*").eq("active", true).order("name");
  if (error) {
    return NextResponse.json({
      templates: [],
      canCreateTemplate,
      loadError: error.message || "Не удалось загрузить шаблоны",
    });
  }
  const rows = (data || []) as Record<string, unknown>[];
  const templates = rows.map((r) => {
    const locations = r.locations;
    const priceCurrency = (() => {
      const locAny = locations as { currency?: unknown } | { currency?: unknown }[] | null;
      const obj = Array.isArray(locAny) ? locAny[0] : locAny;
      const c = obj?.currency;
      if (c === "USD" || c === "VND") return c;
      return "VND" as const;
    })();
    const defaultPriceUsd = (() => {
      const locAny = locations as {
        usd_price?: unknown;
        vnd_price?: unknown;
      } | { usd_price?: unknown; vnd_price?: unknown }[] | null;
      const obj = Array.isArray(locAny) ? locAny[0] : locAny;
      const usd = obj?.usd_price;
      const vnd = obj?.vnd_price;
      const usdNum = usd != null ? Number(usd) : NaN;
      if (Number.isFinite(usdNum) && usdNum > 0) return usdNum;
      const vndNum = vnd != null ? Number(vnd) : NaN;
      if (Number.isFinite(vndNum) && vndNum > 0) return null;
      return null;
    })();
    const pickupMode = String(r.pickup_mode ?? "");
    const pf = r.pickup_from != null ? String(r.pickup_from) : null;
    const pt = r.pickup_to != null ? String(r.pickup_to) : null;
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      description: r.description != null ? String(r.description) : "",
      shopLabel: r.shop_label != null ? String(r.shop_label) : "",
      shopLabels: splitShopLabels(r.shop_label != null ? String(r.shop_label) : ""),
      pickupFrom: pf,
      pickupTo: pt,
      defaultPriceVnd: Number(r.default_price_vnd) || 0,
      tourType: pickupMode === "range" ? ("group" as const) : ("private" as const),
      priceCurrency,
      defaultPriceUsd,
      touristSendCopy:
        r.tourist_send_copy != null && String(r.tourist_send_copy).trim()
          ? String(r.tourist_send_copy)
          : "",
    };
  });
  return NextResponse.json({ templates, canCreateTemplate });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!canCreateTemplateTour(session.role)) return apiDenied();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase не настроен. Заполните .env.local." }, { status: 500 });
  }

  const raw = await request.json();
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите название шаблона." }, { status: 400 });
  }

  const actorId = actorUuidOrNull(session.id);
  const tourType = parsed.data.tourType;
  const pickupFromRaw = parsed.data.pickupFrom || "";
  const pickupFrom = tourType === "group" ? (pickupFromRaw ? pickupFromRaw : null) : null;
  const pickupTo = tourType === "group" && pickupFrom ? add30Minutes(pickupFrom) : null;
  const pickupMode = tourType === "group" ? "range" : "exact";
  const currency = parsed.data.currency === "USD" ? "USD" : "VND";
  const defaultPrice = Number(parsed.data.defaultPrice ?? 0);
  const usdToVndRate = Number(parsed.data.usdToVndRate ?? 0);
  const defaultPriceVnd =
    currency === "USD" ? Math.round(defaultPrice * (usdToVndRate > 0 ? usdToVndRate : 26000)) : Math.round(defaultPrice);
  const defaultPriceUsd =
    currency === "USD"
      ? defaultPrice
      : usdToVndRate > 0
        ? Number((defaultPrice / usdToVndRate).toFixed(4))
        : null;
  const labelsFromArray = (parsed.data.shopLabels || []).map((x) => x.trim()).filter(Boolean);
  const labelsFromSingle = parsed.data.shopLabel ? [parsed.data.shopLabel.trim()] : [];
  const mergedShopLabels = Array.from(new Set([...labelsFromArray, ...labelsFromSingle])).slice(0, 12);
  const shopLabelJoined = mergedShopLabels.length > 0 ? mergedShopLabels.join(" | ") : null;
  const templateLocations: TourTemplateLocation[] = (parsed.data.templateLocations || []).map((l) => ({
    name: l.name.trim(),
    description: (l.description || "").trim(),
    mapUrl: (l.mapUrl || "").trim(),
    recommendedTime: (l.recommendedTime || "").trim(),
    plusVnd: Math.max(0, Math.round(Number(l.plusVnd || 0))),
  }));
  const descriptionWithLocations = buildTemplateDescription(parsed.data.description || "", templateLocations);
  const locations = {
    currency,
    usd_price: defaultPriceUsd,
    vnd_price: currency === "VND" ? Math.round(defaultPrice) : defaultPriceVnd,
  };
  const touristSendCopyTrimmed = (parsed.data.touristSendCopy || "").trim();
  const touristSendCopyDb = touristSendCopyTrimmed ? touristSendCopyTrimmed : null;

  const { data: created, error } = await supabase
    .from("tour_templates")
    .insert([
      {
        name: parsed.data.name,
        description: descriptionWithLocations || null,
        shop_label: shopLabelJoined,
        tourist_send_copy: touristSendCopyDb,
        pickup_mode: pickupMode,
        pickup_from: pickupFrom,
        pickup_to: pickupTo,
        default_price_vnd: defaultPriceVnd,
        locations,
        created_by: actorId,
      },
    ])
    .select(
      "id,name,description,shop_label,tourist_send_copy,default_price_vnd,pickup_from,pickup_to,pickup_mode,locations",
    )
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || "Не удалось создать шаблон." }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actorId,
    entity: "tour_template",
    entityId: created.id,
    action: "create",
    after: {
      name: created.name,
      description: created.description,
      default_price_vnd: created.default_price_vnd,
      pickup_from: created.pickup_from,
      pickup_to: created.pickup_to,
    },
  });

  return NextResponse.json({
    ok: true,
    templateId: created.id,
    template: {
      id: created.id,
      name: created.name,
      description: created.description || "",
      shopLabel: (created as { shop_label?: string | null }).shop_label || "",
      shopLabels: splitShopLabels((created as { shop_label?: string | null }).shop_label || ""),
      pickupFrom: created.pickup_from,
      pickupTo: created.pickup_to,
      defaultPriceVnd: Number(created.default_price_vnd) || 0,
      tourType: created.pickup_mode === "range" ? "group" : "private",
      priceCurrency: currency,
      defaultPriceUsd: defaultPriceUsd,
      touristSendCopy: touristSendCopyTrimmed,
    },
  });
}
