import type { GoogleSheetsExportPayload } from "@/lib/google-sheets-export";
import { buildGoogleSheetsExportPayload } from "@/lib/google-sheets-export";

export async function postGoogleSheetsPayload(payload: GoogleSheetsExportPayload, reason: string): Promise<boolean> {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return false;
  const token = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Webhook-Token": token } : {}),
      },
      body: JSON.stringify({ reason, payload }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Авто-синк: безопасно, best-effort, не ломает основной флоу при ошибке webhook. */
export async function triggerGoogleSheetsAutoSync(reason: string): Promise<void> {
  try {
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) return;
    const payload = await buildGoogleSheetsExportPayload();
    await postGoogleSheetsPayload(payload, reason);
  } catch {
    // best-effort
  }
}

