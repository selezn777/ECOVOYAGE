export type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string;
  mapsUrl: string;
};

export function isGoogleGeocodingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/** Геокодирует адрес (например адрес отеля или точки сбора) в координаты + ссылку Google Maps. */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Не настроен GOOGLE_MAPS_API_KEY");
  const trimmed = address.trim();
  if (!trimmed) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding API: HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Geocoding API: ${data.status}`);
  }

  const top = data.results[0];
  const { lat, lng } = top.geometry.location;
  return {
    lat,
    lng,
    formattedAddress: top.formatted_address,
    placeId: top.place_id,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${top.place_id}`,
  };
}
