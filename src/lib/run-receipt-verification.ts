import { verifyReceiptWithGemini } from "@/lib/receipt-verify-gemini";
import { buildLocalReceiptVerification, dedupeVerifyIssues } from "@/lib/receipt-verify-local";
import type { ReceiptVerifyPayload } from "@/lib/receipt-verify-types";

const MAX_IMAGE_BYTES = 4_500_000;

function parseDataImageUrl(raw: string): { mime: "image/jpeg" | "image/png" | "image/webp"; b64: string } | null {
  const m = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/i);
  if (!m) return null;
  const mimeRaw = m[1].toLowerCase();
  const mime: "image/jpeg" | "image/png" | "image/webp" =
    mimeRaw === "image/jpg" || mimeRaw === "image/jpeg" ? "image/jpeg" : (mimeRaw as "image/png" | "image/webp");
  const b64 = m[2].replace(/\s/g, "");
  if (b64.length < 32) return null;
  return { mime, b64 };
}

export async function runReceiptVerificationForExpense(params: {
  description: string;
  amountVnd: number;
  tourDateYmd: string;
  expectedPax: number;
  attachmentUrl: string | null;
}): Promise<ReceiptVerifyPayload> {
  const hasAttachment = Boolean(params.attachmentUrl?.trim());
  const local = buildLocalReceiptVerification({
    description: params.description,
    amountVnd: params.amountVnd,
    tourDateYmd: params.tourDateYmd,
    expectedPax: params.expectedPax,
    hasAttachment,
  });

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
  let imageIssues: typeof local.issues = [];
  let extractedFromImage: ReceiptVerifyPayload["extractedFromImage"] = null;
  let imageError: string | undefined;
  const methods: ("image" | "text")[] = ["text"];

  if (apiKey && params.attachmentUrl?.startsWith("data:")) {
    const parsed = parseDataImageUrl(params.attachmentUrl);
    if (parsed) {
      const approxBytes = Math.ceil((parsed.b64.length * 3) / 4);
      if (approxBytes <= MAX_IMAGE_BYTES) {
        const g = await verifyReceiptWithGemini({
          apiKey,
          tourDateYmd: params.tourDateYmd,
          expectedPax: params.expectedPax,
          amountVndLine: params.amountVnd,
          imageMime: parsed.mime,
          imageBase64: parsed.b64,
        });
        if (g.ok) {
          methods.push("image");
          imageIssues = g.issues;
          extractedFromImage = g.extracted;
        } else {
          imageError = g.error;
        }
      } else {
        imageError = "Файл чека слишком большой для автопроверки по изображению";
      }
    }
  }

  const merged = dedupeVerifyIssues(imageIssues, local.issues);
  const source: ReceiptVerifyPayload["source"] = methods.includes("image") ? "merged" : "local";

  return {
    source,
    methods,
    issues: merged,
    extractedFromText: local.extracted,
    extractedFromImage,
    ...(imageError && !methods.includes("image") ? { error: imageError } : {}),
  };
}
