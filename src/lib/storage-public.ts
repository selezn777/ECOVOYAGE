import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket for public images (avatars, dispatcher booking photos). Create in Supabase Dashboard. */
export const CRM_PUBLIC_BUCKET = process.env.SUPABASE_PUBLIC_BUCKET ?? "crm-public";

function bucketOpts(maxFileBytes: number) {
  return {
    public: true as const,
    fileSizeLimit: maxFileBytes,
    /** null - не отсекать загрузки из‑за расхождения MIME (image/jpg, пустой type и т.д.) */
    allowedMimeTypes: null,
  };
}

/** Если bucket уже есть, но создан как приватный - картинка по публичному URL не откроется. */
export async function tryPromoteCrmPublicBucket(
  supabase: SupabaseClient,
  maxFileBytes: number,
): Promise<void> {
  const { error } = await supabase.storage.updateBucket(CRM_PUBLIC_BUCKET, bucketOpts(maxFileBytes));
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[storage] updateBucket", CRM_PUBLIC_BUCKET, error.message);
  }
}

/**
 * Создаёт публичный bucket, если его ещё нет (нужен SUPABASE_SERVICE_ROLE_KEY).
 * Если bucket уже существует - выставляет public: true (частая причина «фото не показывается»).
 */
export async function ensureCrmPublicBucket(
  supabase: SupabaseClient,
  maxFileBytes: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const opts = bucketOpts(maxFileBytes);
  const { error } = await supabase.storage.createBucket(CRM_PUBLIC_BUCKET, opts);
  if (!error) return { ok: true };
  const m = error.message || "";
  if (/already exists|duplicate|409/i.test(m)) {
    const { error: upd } = await supabase.storage.updateBucket(CRM_PUBLIC_BUCKET, opts);
    if (upd) return { ok: false, message: upd.message };
    return { ok: true };
  }
  return { ok: false, message: m };
}

/** Определение MIME по магическим байтам (iOS/Android часто отдают пустой или application/octet-stream). */
export function detectImageContentTypeFromBuffer(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.includes("heic") || brand === "mif1" || brand === "msf1") return "image/heic";
  }
  return null;
}

export function extFromImageContentType(ct: string): string {
  const c = ct.toLowerCase();
  if (c === "image/png") return "png";
  if (c === "image/webp") return "webp";
  if (c === "image/gif") return "gif";
  if (c === "image/jpeg" || c === "image/jpg") return "jpg";
  return "bin";
}

export function publicObjectUrl(supabaseUrl: string, bucket: string, path: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
