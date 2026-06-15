import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/auth-session";
import { isGoogleGeocodingConfigured } from "@/lib/google-geocode";
import { getSpreadsheetTitle, isGoogleSheetsConfigured } from "@/lib/google-sheets-client";

export async function GET() {
  const t = await getTranslations("googleSync");
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: t("errUnauthorized") }, { status: 401 });
  if (session.role !== "director") return NextResponse.json({ error: t("errForbidden") }, { status: 403 });

  const sheets = isGoogleSheetsConfigured();
  const geocoding = isGoogleGeocodingConfigured();

  let spreadsheetTitle: string | null = null;
  let sheetsError: string | null = null;
  if (sheets) {
    try {
      spreadsheetTitle = await getSpreadsheetTitle();
    } catch (e) {
      sheetsError = e instanceof Error ? e.message : t("errSheetsApiError");
    }
  }

  return NextResponse.json({
    sheets: { configured: sheets, spreadsheetTitle, error: sheetsError },
    geocoding: { configured: geocoding },
  });
}
