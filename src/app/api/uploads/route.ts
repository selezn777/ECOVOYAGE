import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { isUuidSessionUser } from "@/lib/actor-id";
import {
  canAddGuideReview,
  canAddManagerReview,
  canEditBookingDispatcherPhoto,
  canUploadBookingPassportPhotos,
  ACCOUNTING_PANEL_ROLES,
  RENTALS_PAGE_ROLES,
} from "@/lib/role-policy";
import {
  CRM_PUBLIC_BUCKET,
  detectImageContentTypeFromBuffer,
  ensureCrmPublicBucket,
  extFromImageContentType,
  publicObjectUrl,
  tryPromoteCrmPublicBucket,
} from "@/lib/storage-public";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_BYTES = 25 * 1024 * 1024;

function allowedImageType(ct: string): boolean {
  const c = ct.toLowerCase();
  return (
    c === "image/jpeg" ||
    c === "image/jpg" ||
    c === "image/png" ||
    c === "image/webp" ||
    c === "image/gif"
  );
}

/**
 * multipart/form-data: file (required), kind = … | "rental_point_photo" | "cash_manual_ledger"
 * bookingId (uuid when kind=dispatcher_booking|manager_refund_certificate), tourId (uuid when kind=dispatcher_tour_booking|manager_refund_certificate)
 */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
  if (!isUuidSessionUser(session.id)) {
    return NextResponse.json({ error: "Нужен пользователь Supabase (UUID)." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase = getSupabaseAdmin();
  if (!supabase || !supabaseUrl) {
    return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "").trim();
  /** trim - иначе UUID с пробелом/переносом не матчится и бронь «не находится» */
  const rawBid = form.get("bookingId");
  const rawTid = form.get("tourId");
  const bookingId =
    rawBid != null && String(rawBid).trim() !== "" ? String(rawBid).trim() : null;
  const tourId = rawTid != null && String(rawTid).trim() !== "" ? String(rawTid).trim() : null;

  const isBlob =
    typeof file === "object" &&
    file !== null &&
    "arrayBuffer" in file &&
    typeof (file as Blob).arrayBuffer === "function" &&
    typeof (file as File).size === "number";
  if (!isBlob || file.size < 1) {
    return NextResponse.json({ error: "Добавьте файл изображения" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл больше 25 МБ" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let ct = (file.type || "").toLowerCase().trim();
  if (!allowedImageType(ct)) {
    const sniffed = detectImageContentTypeFromBuffer(buf);
    if (sniffed === "image/heic") {
      return NextResponse.json(
        {
          error:
            "Формат HEIC/HEIF (часто с iPhone) здесь не поддерживается. Сделайте фото в JPEG: Настройки → Камера → Форматы → «Наиболее совместимые», или конвертируйте файл.",
        },
        { status: 400 },
      );
    }
    if (sniffed && allowedImageType(sniffed)) ct = sniffed;
  }
  if (!allowedImageType(ct)) {
    return NextResponse.json({ error: "Нужен формат JPEG, PNG, WebP или GIF" }, { status: 400 });
  }

  const ext = extFromImageContentType(ct);
  if (ext === "bin") {
    return NextResponse.json({ error: "Неизвестный тип изображения" }, { status: 400 });
  }

  await tryPromoteCrmPublicBucket(supabase, MAX_BYTES);
  let objectPath: string;

  if (kind === "avatar") {
    objectPath = `avatars/${session.id}/${Date.now()}.${ext}`;
  } else if (kind === "staff_feedback") {
    if (!canAddGuideReview(session.role) && !canAddManagerReview(session.role)) {
      return NextResponse.json({ error: "Нет права прикреплять файл к отзыву" }, { status: 403 });
    }
    objectPath = `staff-feedback/${session.id}/${Date.now()}.${ext}`;
  } else if (kind === "dispatcher_booking") {
    if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return NextResponse.json({ error: "Укажите bookingId брони" }, { status: 400 });
    }
    if (!canEditBookingDispatcherPhoto(session.role)) {
      return NextResponse.json({ error: "Нет права загружать фото этой брони" }, { status: 403 });
    }
    const { data: row, error: be } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .is("deleted_at", null)
      .maybeSingle();
    if (be || !row) {
      return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
    }
    objectPath = `booking-photos/${bookingId}/${Date.now()}.${ext}`;
  } else if (kind === "dispatcher_tour_booking") {
    if (!tourId || !/^[0-9a-f-]{36}$/i.test(tourId)) {
      return NextResponse.json({ error: "Укажите tourId тура" }, { status: 400 });
    }
    if (!canEditBookingDispatcherPhoto(session.role)) {
      return NextResponse.json({ error: "Нет права загружать фото букинга на тур" }, { status: 403 });
    }
    const { data: row, error: te } = await supabase
      .from("tours")
      .select("id")
      .eq("id", tourId)
      .is("deleted_at", null)
      .maybeSingle();
    if (te || !row) {
      return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
    }
    objectPath = `tour-booking-photos/${tourId}/${Date.now()}.${ext}`;
  } else if (kind === "manager_refund_certificate") {
    if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return NextResponse.json({ error: "Укажите bookingId брони" }, { status: 400 });
    }
    if (!tourId || !/^[0-9a-f-]{36}$/i.test(tourId)) {
      return NextResponse.json({ error: "Укажите tourId тура" }, { status: 400 });
    }
    if (session.role !== "manager") {
      return NextResponse.json({ error: "Только для менеджера" }, { status: 403 });
    }
    const { data: bRow, error: be } = await supabase
      .from("bookings")
      .select("id,tour_id,manager_id")
      .eq("id", bookingId)
      .is("deleted_at", null)
      .maybeSingle();
    if (be || !bRow) return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
    const br = bRow as { tour_id: string; manager_id: string };
    if (br.tour_id !== tourId || br.manager_id !== session.id) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    objectPath = `refund-certificates/${tourId}/${bookingId}/${Date.now()}.${ext}`;
  } else if (kind === "passport_booking") {
    if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return NextResponse.json({ error: "Укажите bookingId брони" }, { status: 400 });
    }
    if (!tourId || !/^[0-9a-f-]{36}$/i.test(tourId)) {
      return NextResponse.json({ error: "Укажите tourId тура (uuid)" }, { status: 400 });
    }
    const { data: bRow, error: be } = await supabase
      .from("bookings")
      .select("id,manager_id,tour_id")
      .eq("id", bookingId)
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .maybeSingle();
    if (be) {
      return NextResponse.json({ error: `Ошибка при чтении брони: ${be.message}` }, { status: 500 });
    }
    if (!bRow) {
      return NextResponse.json(
        {
          error:
            "Бронь не найдена для этого тура. Обновите страницу (F5). Проверьте, что NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local относятся к тому же проекту Supabase, где лежат брони.",
        },
        { status: 404 },
      );
    }
    const br = bRow as { manager_id: string };
    if (!canUploadBookingPassportPhotos(session.role, session.id, br.manager_id)) {
      return NextResponse.json({ error: "Нет права загружать фото паспортов для этой брони" }, { status: 403 });
    }
    objectPath = `passport-bookings/${bookingId}/${Date.now()}.${ext}`;
  } else if (kind === "guide_settlement_proof") {
    if (!tourId || !/^[0-9a-f-]{36}$/i.test(tourId)) {
      return NextResponse.json({ error: "Укажите tourId тура" }, { status: 400 });
    }
    if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Только бухгалтерия" }, { status: 403 });
    }
    const { data: row, error: te } = await supabase
      .from("tours")
      .select("id")
      .eq("id", tourId)
      .is("deleted_at", null)
      .maybeSingle();
    if (te || !row) {
      return NextResponse.json({ error: "Тур не найден" }, { status: 404 });
    }
    objectPath = `guide-settlement-proofs/${tourId}/${Date.now()}.${ext}`;
  } else if (kind === "cash_manual_ledger") {
    if (!ACCOUNTING_PANEL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Только бухгалтерия" }, { status: 403 });
    }
    objectPath = `cash-manual-ledger/${session.id}/${Date.now()}.${ext}`;
  } else if (kind === "rental_point_photo") {
    if (!RENTALS_PAGE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Нет права загружать фото точки" }, { status: 403 });
    }
    objectPath = `rental-points/${session.id}/${Date.now()}.${ext}`;
  } else if (kind === "rental_point_expense") {
    if (!RENTALS_PAGE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Нет права загружать вложение расхода" }, { status: 403 });
    }
    const pointId = String(form.get("pointId") ?? "").trim();
    if (!pointId || !/^[0-9a-f-]{36}$/i.test(pointId)) {
      return NextResponse.json({ error: "Укажите pointId точки" }, { status: 400 });
    }
    const { data: rp, error: rpe } = await supabase
      .from("rental_points")
      .select("id")
      .eq("id", pointId)
      .is("deleted_at", null)
      .maybeSingle();
    if (rpe || !rp) {
      return NextResponse.json({ error: "Точка не найдена" }, { status: 404 });
    }
    objectPath = `rental-point-expenses/${pointId}/${Date.now()}.${ext}`;
  } else {
    return NextResponse.json(
      {
        error:
          "kind: avatar, staff_feedback, dispatcher_booking, dispatcher_tour_booking, passport_booking, manager_refund_certificate, guide_settlement_proof, rental_point_photo, rental_point_expense или cash_manual_ledger",
      },
      { status: 400 },
    );
  }

  let { error: upErr } = await supabase.storage.from(CRM_PUBLIC_BUCKET).upload(objectPath, buf, {
    contentType: ct,
    upsert: true,
  });

  if (upErr) {
    const msg = upErr.message || "Ошибка загрузки";
    if (
      /bucket|not found|does not exist|row-level security|\bRLS\b|violat|policy|permission|unauthorized|42501|JWT expired|Invalid JWT/i.test(
        msg,
      )
    ) {
      const ensured = await ensureCrmPublicBucket(supabase, MAX_BYTES);
      if (!ensured.ok) {
        return NextResponse.json(
          {
            error: `Не удалось настроить bucket «${CRM_PUBLIC_BUCKET}»: ${ensured.message}. Проверьте SUPABASE_SERVICE_ROLE_KEY и создайте публичный bucket в Supabase → Storage.`,
          },
          { status: 500 },
        );
      }
      const retry = await supabase.storage.from(CRM_PUBLIC_BUCKET).upload(objectPath, buf, {
        contentType: ct,
        upsert: true,
      });
      upErr = retry.error;
    }
  }

  if (upErr) {
    const msg = upErr.message || "Ошибка загрузки";
    if (/bucket|not found/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            `Проверьте bucket «${CRM_PUBLIC_BUCKET}» в Supabase Storage (публичный). См. supabase/migration_storage_crm_public.sql.`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const url = publicObjectUrl(supabaseUrl, CRM_PUBLIC_BUCKET, objectPath);
  return NextResponse.json({ ok: true, url, path: objectPath });
}
