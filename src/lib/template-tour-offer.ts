/**
 * Прайс из строки tour_templates (как на странице новой брони).
 */

export type TemplateOfferResolved = { usd: number; vnd: number };

type TemplateRow = {
  default_price_vnd?: unknown;
  locations?: unknown;
};

export function resolveOfferFromTemplateRow(
  tmpl: TemplateRow | null | undefined,
  usdToVndRate: number,
): TemplateOfferResolved | null {
  if (!tmpl) return null;
  const rate = usdToVndRate > 0 ? usdToVndRate : 26000;
  const defaultPriceVnd = Number((tmpl as { default_price_vnd?: unknown }).default_price_vnd) || 0;
  const locAny = tmpl.locations as
    | { currency?: unknown; usd_price?: unknown; vnd_price?: unknown }
    | { currency?: unknown; usd_price?: unknown; vnd_price?: unknown }[]
    | null
    | undefined;
  const obj = Array.isArray(locAny) ? locAny[0] : locAny;
  const locCurrency = obj?.currency;
  const locUsd = obj?.usd_price != null ? Number(obj.usd_price) : null;
  const locVnd = obj?.vnd_price != null ? Number(obj.vnd_price) : null;

  if (locCurrency === "USD" && locUsd != null && Number.isFinite(locUsd) && locUsd > 0) {
    const adultUsd = locUsd;
    return { usd: adultUsd, vnd: Math.round(adultUsd * rate) };
  }
  if (locVnd != null && Number.isFinite(locVnd) && locVnd > 0) {
    return { usd: locVnd / rate, vnd: Math.round(locVnd) };
  }
  if (defaultPriceVnd > 0) {
    return { usd: defaultPriceVnd / rate, vnd: Math.round(defaultPriceVnd) };
  }
  return null;
}
