import { z } from "zod";
import type { ReceiptVerifyIssue } from "@/lib/receipt-verify-types";

const geminiJsonSchema = z.object({
  extracted: z
    .object({
      totalVnd: z.number().nullable().optional(),
      receiptDateYmd: z.string().nullable().optional(),
      paxInReceipt: z.number().int().nullable().optional(),
    })
    .optional(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["danger", "warn", "info"]),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
});

export type GeminiReceiptVerifyInput = {
  tourDateYmd: string;
  expectedPax: number;
  amountVndLine: number;
  apiKey: string;
  model?: string;
  imageMime: "image/jpeg" | "image/png" | "image/webp";
  imageBase64: string;
};

function extractGeminiText(data: unknown): string {
  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = d?.candidates?.[0]?.content?.parts;
  if (!parts?.length) return "";
  return parts.map((p) => String(p.text ?? "")).join("\n").trim();
}

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

/**
 * Разбор изображения чека через Gemini (только сервер, ключ в env).
 */
export async function verifyReceiptWithGemini(input: GeminiReceiptVerifyInput): Promise<{
  ok: true;
  issues: ReceiptVerifyIssue[];
  extracted: { totalVnd: number | null; receiptDateYmd: string | null; paxInReceipt: number | null };
} | { ok: false; error: string }> {
  const model = input.model?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  const prompt = `Ты помощник бухгалтера тура во Вьетнаме. По изображению чека (может быть на вьетнамском или английском) извлеки факты и сравни с данными системы.

Данные тура в CRM:
- Календарный день тура (YYYY-MM-DD): ${input.tourDateYmd}
- Число туристов по всем броням тура: ${input.expectedPax}
- Сумма в строке расхода в системе: ${input.amountVndLine} VND

Задача:
1) Определи итог к оплате на чеке в VND (целое число). Игнорируй валюты, не VND - не подставляй как VND.
2) Дату на чеке в формате YYYY-MM-DD если видна (иначе null).
3) Количество гостей/pax/số người на чеке если явно указано (иначе null).
4) Сформируй issues - только реальные расхождения и важные риски. severity:
   - danger: явное несовпадение суммы (>3% или >50000 ₫), дата чека дальше чем на 1 календарный день от дня тура, явно другое число людей
   - warn: сумма близка но не совпадает, дата на 1 день от тура, нечитаемый фрагмент, несколько возможных итогов
   - info: нейтральные подсказки

Пиши title и detail на русском, коротко и по делу. Не упоминай оплату API или «облако».

Верни ТОЛЬКО валидный JSON без markdown:
{"extracted":{"totalVnd":number|null,"receiptDateYmd":string|null,"paxInReceipt":number|null},"issues":[{"severity":"danger"|"warn"|"info","title":"...","detail":"..."}]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;

  const parts = [
    { inline_data: { mime_type: input.imageMime, data: input.imageBase64 } },
    { text: prompt },
  ];

  const bodyJsonMode = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  };

  const bodyPlain = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 2048,
    },
  };

  try {
    let res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyJsonMode),
      signal: AbortSignal.timeout(55_000),
    });

    let raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = String((raw as { error?: { message?: string } })?.error?.message ?? "");
      const retryPlain =
        res.status === 400 && /responseMimeType|JSON|mimeType|not supported/i.test(errMsg);
      if (retryPlain) {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPlain),
          signal: AbortSignal.timeout(55_000),
        });
        raw = await res.json().catch(() => ({}));
      }
    }

    if (!res.ok) {
      const msg =
        typeof (raw as { error?: { message?: string } })?.error?.message === "string"
          ? String((raw as { error: { message: string } }).error.message)
          : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    const text = extractGeminiText(raw);
    if (!text) return { ok: false, error: "Пустой ответ модели" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(text));
    } catch {
      return { ok: false, error: "Ответ не JSON" };
    }

    const g = geminiJsonSchema.safeParse(parsed);
    if (!g.success) {
      return { ok: false, error: "Некорректная структура ответа модели" };
    }

    const ex = g.data.extracted ?? {};
    const totalVnd =
      ex.totalVnd != null && Number.isFinite(ex.totalVnd) ? Math.round(Math.max(0, ex.totalVnd)) : null;
    const receiptDateYmd =
      typeof ex.receiptDateYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ex.receiptDateYmd.trim())
        ? ex.receiptDateYmd.trim()
        : null;
    const paxInReceipt =
      ex.paxInReceipt != null && Number.isFinite(ex.paxInReceipt)
        ? Math.max(0, Math.round(ex.paxInReceipt))
        : null;

    const issues: ReceiptVerifyIssue[] = (g.data.issues ?? []).map((it, i) => ({
      code: `gemini_${i}`,
      severity: it.severity,
      title: it.title.trim().slice(0, 200),
      detail: it.detail.trim().slice(0, 600),
    }));

    return {
      ok: true,
      issues,
      extracted: { totalVnd, receiptDateYmd, paxInReceipt },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка запроса";
    return { ok: false, error: msg };
  }
}
