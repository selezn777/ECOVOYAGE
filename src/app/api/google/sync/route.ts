import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets-client";
import { pullHotelsFromSheet, pushHotelsToSheet } from "@/lib/google-sync-hotels";
import { pushReportsToSheet } from "@/lib/google-sync-reports";

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (session.role !== "director") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets не настроен (.env)" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string; category?: string };

  try {
    if (body.category === "hotels" && body.action === "push") {
      return NextResponse.json({ ok: true, result: await pushHotelsToSheet() });
    }
    if (body.category === "hotels" && body.action === "pull") {
      return NextResponse.json({ ok: true, result: await pullHotelsFromSheet(session.id) });
    }
    if (body.category === "reports" && body.action === "push") {
      return NextResponse.json({ ok: true, result: await pushReportsToSheet() });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка синхронизации" }, { status: 500 });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
