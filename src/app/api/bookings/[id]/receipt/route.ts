import { NextResponse } from "next/server";
import { apiDenied } from "@/lib/api-denied";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth-session";
import { buildReceiptPdfBytes } from "@/lib/receipt-pdf";
import { writeAuditLog } from "@/lib/audit";
import { actorUuidOrNull } from "@/lib/actor-id";
import { RECEIPT_ROLES } from "@/lib/role-policy";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatYmdWithWeekdayRu,
  hhmmFromIsoInTourTz,
  tourCalendarDateFromStartAtIso,
  TOUR_BUSINESS_TIME_ZONE,
} from "@/lib/scheduling";
import { ensureBookingOnlineCode } from "@/lib/online-code";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Нет авторизации" }, { status: 401 });
    if (!RECEIPT_ROLES.includes(session.role)) {
      return apiDenied();
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase не настроен." }, { status: 500 });
    }

    const { id: bookingId } = await params;
    const actorId = actorUuidOrNull(session.id);

    let { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select(
        "id,manager_id,customer_name,hotel_name,room,phone_e164,adults,children,infants,tour_id,online_code,created_at,updated_at,users!bookings_manager_id_fkey(full_name,phone),tours(name,start_at,end_at)",
      )
      .eq("id", bookingId)
      .is("deleted_at", null)
      .maybeSingle();

    if (bErr && /updated_at/i.test(String(bErr.message))) {
      const leg = await supabase
        .from("bookings")
        .select(
          "id,manager_id,customer_name,hotel_name,room,phone_e164,adults,children,infants,tour_id,online_code,created_at,users!bookings_manager_id_fkey(full_name,phone),tours(name,start_at,end_at)",
        )
        .eq("id", bookingId)
        .is("deleted_at", null)
        .maybeSingle();
      booking = leg.data as typeof booking;
      bErr = leg.error;
    }

    if (bErr || !booking) {
      return NextResponse.json({ error: "Бронь не найдена" }, { status: 404 });
    }

    const bookingManagerId = (booking as { manager_id: string }).manager_id;
    if (session.role === "manager" && bookingManagerId !== session.id) {
      return apiDenied();
    }

    type BookingTour = { name: string; start_at: string; end_at?: string | null } | null;
    type BookingUser = { full_name: string; phone?: string | null } | null;

    const b = booking as {
      tours?: BookingTour | BookingTour[] | null;
      users?: BookingUser | BookingUser[] | null;
    };

    const tourRaw = b.tours ?? null;
    const tour: BookingTour | null = Array.isArray(tourRaw) ? (tourRaw[0] ?? null) : tourRaw;

    const userRaw = b.users ?? null;
    const managerRow: BookingUser | null = Array.isArray(userRaw) ? (userRaw[0] ?? null) : userRaw;
    const managerName = managerRow?.full_name || "-";
    const managerPhone = managerRow?.phone ? String(managerRow.phone).trim() : "";

    const tourId = (booking as { tour_id: string }).tour_id;
    const { data: guideRows } = await supabase
      .from("tour_guides")
      .select("note,users(full_name,phone)")
      .eq("tour_id", tourId)
      .eq("is_primary", true)
      .limit(1);
    type GuideRow = { note?: string | null; users: { full_name: string; phone?: string | null } | null } | null;
    const guideRow = (guideRows as GuideRow[] | null)?.[0] ?? null;
    const guideNameRaw = guideRow?.users?.full_name || "-";
    const guidePhone = guideRow?.users?.phone ? String(guideRow.users.phone).trim() : "";
    const guideNote = guideRow?.note ? String(guideRow.note).trim() : "";
    const guideName = [
      guideNameRaw,
      guidePhone || null,
      guideNote || null,
    ].filter(Boolean).join(" · ");

    const startAt = tour?.start_at ? String(tour.start_at) : "";
    const endAt = tour?.end_at ? String(tour.end_at) : "";
    const startHm = startAt ? hhmmFromIsoInTourTz(startAt) : "";
    const endHm = endAt ? hhmmFromIsoInTourTz(endAt) : "";
    const pickupWindow = startHm && endHm ? `${startHm}-${endHm}` : startHm || endHm || "-";

    const { data: priceRows } = await supabase
      .from("booking_prices")
      .select("person_label,amount_vnd")
      .eq("booking_id", bookingId);
    const totalVnd = (priceRows || []).reduce((s, r) => s + Number((r as { amount_vnd?: number }).amount_vnd), 0);
    const priceLineItems =
      (priceRows || []).length > 0
        ? (priceRows as { person_label?: string | null; amount_vnd?: number }[])
            .map((r) => ({
              label: (r.person_label && String(r.person_label).trim()) || "Услуга",
              amountVnd: Math.round(Number(r.amount_vnd) || 0),
            }))
            .filter((x) => x.amountVnd > 0)
        : undefined;

    const paySel = await supabase
      .from("payments")
      .select("amount_vnd,kind,remitted_to_cash_at,created_at")
      .eq("booking_id", bookingId);
    let paymentRows: {
      amount_vnd: number;
      kind: string;
      remitted_to_cash_at?: string | null;
      created_at?: string;
    }[] = [];
    if (!paySel.error && paySel.data) {
      paymentRows = paySel.data as typeof paymentRows;
    } else if (paySel.error && /remitted_to_cash_at/i.test(String(paySel.error.message))) {
      const leg = await supabase
        .from("payments")
        .select("amount_vnd,kind,created_at")
        .eq("booking_id", bookingId);
      paymentRows = ((leg.data || []) as { amount_vnd: number; kind: string; created_at?: string }[]).map((r) => ({
        ...r,
        remitted_to_cash_at: undefined as string | undefined,
      }));
    }

    let depositVnd = 0;
    let topupVnd = 0;
    let refundVnd = 0;
    for (const p of paymentRows || []) {
      const amt = Number(p.amount_vnd) || 0;
      if (p.kind === "refund") refundVnd += amt;
      else if (p.kind === "deposit") depositVnd += amt;
      else if (p.kind === "topup") {
        const cleared =
          p.remitted_to_cash_at === undefined ||
          (p.remitted_to_cash_at != null && String(p.remitted_to_cash_at).trim() !== "");
        if (cleared) topupVnd += amt;
      } else if (p.kind === "office_cash") {
        topupVnd += amt;
      } else {
        topupVnd += amt;
      }
    }
    const paidVnd = depositVnd + topupVnd - refundVnd;
    const dueVnd = Math.max(0, totalVnd - paidVnd);
    // Печать «оплачено» только при полной оплате по туру (без доплаты / долга).
    const isFullPaid = totalVnd > 0 && dueVnd <= 0;

    const tourYmd = tour?.start_at ? tourCalendarDateFromStartAtIso(String(tour.start_at)) : "";
    const tourDateLabel = tourYmd ? formatYmdWithWeekdayRu(tourYmd) : "-";

    const bTimes = booking as { created_at?: string; updated_at?: string };
    let docMs = 0;
    const ca = bTimes.created_at ? Date.parse(String(bTimes.created_at)) : NaN;
    if (!Number.isNaN(ca)) docMs = Math.max(docMs, ca);
    const ua = bTimes.updated_at ? Date.parse(String(bTimes.updated_at)) : NaN;
    if (!Number.isNaN(ua)) docMs = Math.max(docMs, ua);
    for (const p of paymentRows) {
      const t = p.created_at ? Date.parse(String(p.created_at)) : NaN;
      if (!Number.isNaN(t)) docMs = Math.max(docMs, t);
    }
    const createdAtLabel = new Date(docMs > 0 ? docMs : Date.now()).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: TOUR_BUSINESS_TIME_ZONE,
    });

    // Assets (logo + fonts + optional paid stamp)
    let logoPngBytes: Uint8Array;
    try {
      logoPngBytes = await readFile(join(process.cwd(), "public", "asiamix-logo.png"));
    } catch {
      logoPngBytes = new Uint8Array();
    }

    let paidStampPngBytes: Uint8Array | null = null;
    const stampCandidates = [
      process.env.RECEIPT_PAID_STAMP_PATH,
      join(process.cwd(), "public", "paid-stamp.png"),
      join(process.cwd(), "public", "paid-stamp.jpg"),
    ].filter(Boolean) as string[];
    for (const p of stampCandidates) {
      try {
        const buf = await readFile(p);
        if (buf.length > 0) {
          paidStampPngBytes = new Uint8Array(buf);
          break;
        }
      } catch {
        /* try next */
      }
    }
    const fontRegularBytes = await readFile(join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"));
    const fontMonoBytes = await readFile(join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSansMono.ttf"));

    const bRow = booking as { online_code?: string | null };
    const onlineCodePdf =
      (typeof bRow.online_code === "string" ? bRow.online_code.trim() : "") ||
      (await ensureBookingOnlineCode(supabase, bookingId)) ||
      "";

    const receiptHeaderTitle = onlineCodePdf ? `ON ${onlineCodePdf}` : `Бронь ${bookingId.slice(0, 8)}`;
    /** Уникальная запись в БД без префикса AMX в отображении */
    const receiptNumber = `${onlineCodePdf || "booking"}-${randomUUID()}`;

    const pdfBytes = await buildReceiptPdfBytes(
      {
      receiptHeaderTitle,
      tourName: tour?.name || "-",
      tourDateLabel,
      pickupWindow,
      guideName,
      customerName: booking.customer_name,
      hotelName: booking.hotel_name,
      room: booking.room || "",
      paxLabel: `${booking.adults}A / ${booking.children}C / ${booking.infants}I`,
      priceLineItems: priceLineItems && priceLineItems.length > 1 ? priceLineItems : undefined,
      totalVnd,
      paidVnd,
      dueVnd,
      isFullPaid,
      managerName,
      managerPhone,
      createdAtLabel,
      },
      { logoPngBytes, paidStampPngBytes, fontRegularBytes, fontMonoBytes },
    );

    const { error: insErr } = await supabase.from("receipts").insert([
      {
        booking_id: bookingId,
        receipt_number: receiptNumber,
        status: isFullPaid ? "paid" : "partial",
        deposit_vnd: depositVnd,
        topup_vnd: topupVnd,
        created_by: actorId,
      },
    ]);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await writeAuditLog(supabase, {
      actorId,
      entity: "receipt",
      entityId: receiptNumber,
      action: "generated_pdf",
      after: { booking_id: bookingId, totalVnd, paidVnd, dueVnd },
    });

    const safeOn = String(onlineCodePdf || "receipt").replace(/[^\w.-]+/g, "_");
    const filename = `ON-${safeOn}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось сформировать квитанцию" },
      { status: 500 },
    );
  }
}
