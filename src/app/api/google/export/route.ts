import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { ACCOUNTING_PANEL_ROLES } from "@/lib/role-policy";
import { buildGoogleSheetsExportPayload } from "@/lib/google-sheets-export";
import { postGoogleSheetsPayload } from "@/lib/google-sheets-sync";

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { mode?: "preview" | "push"; reason?: string };
  const mode = body.mode === "push" ? "push" : "preview";
  const reason = body.reason || "manual_export";
  const payload = await buildGoogleSheetsExportPayload();

  if (mode === "push") {
    const ok = await postGoogleSheetsPayload(payload, reason);
    if (!ok) {
      return NextResponse.json({ error: "Webhook не настроен или недоступен (GOOGLE_SHEETS_WEBHOOK_URL)." }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, mode, payload });
}

