"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Booking, Role } from "@/lib/types";

/** Стабильная строка для useEffect: одна примитивная зависимость, без смены длины массива deps при HMR. */
function bookingCardSyncKey(b: Booking): string {
  return [
    b.id,
    b.customerName,
    b.hotel,
    b.mapsUrl ?? "",
    b.room ?? "",
    b.phone,
    b.phoneAlt ?? "",
    b.telegramUsername ?? "",
    b.pickupTime,
    String(b.adults),
    String(b.children),
    String(b.infants),
    b.note ?? "",
    String(b.dueVnd),
    b.onlineCode ?? "",
    (b.passportPhotoUrls ?? []).join("|"),
  ].join("\x1e");
}
import { NumericRollSelect } from "@/components/numeric-roll-select";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { BookingDeleteButton } from "./booking-delete-button";
import { BookingCancelRetentionButton } from "./booking-cancel-retention-button";
import { BookingPassportPhotosBlock } from "@/components/booking-passport-photos-block";
import {
  CopyTouristBriefingButton,
  ReceiptPdfButton,
  TelegramBookingLink,
  WhatsAppBookingLink,
} from "./tour-actions";
import { TOUR_BOOKING_POLICY_HINT_RU } from "@/lib/tour-booking-policies";
import { normalizeTourPickupHhMm } from "@/lib/scheduling";

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(50, Math.round(n)));
}

/** Значение для input type="time" (HH:mm). */
function pickupTimeForInput(raw: string): string {
  const m = String(raw ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "00:00";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function parseUsdInput(raw: string): number {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  const safe = normalized.replace(/[^\d.]/g, "");
  const n = Number(safe);
  return Number.isFinite(n) ? n : 0;
}

function buildDefaultTouristBriefing(args: {
  tourDateYmd: string;
  pickupTime: string;
}): string {
  const dateLabel = String(args.tourDateYmd || "").trim();
  const pickup = pickupTimeForInput(args.pickupTime || "");
  return [
    "Добрый день! Подтверждаем вашу запись на тур.",
    "",
    `Дата выезда: ${dateLabel || "-"}`,
    `Время сбора: ${pickup}`,
    "",
    "Что взять с собой:",
    "• удобную одежду и обувь;",
    "• воду, головной убор и солнцезащиту;",
    "• телефон с зарядом и наличные на личные расходы.",
    "",
    "Пожалуйста, будьте готовы за 10-15 минут до времени сбора.",
  ]
    .filter(Boolean)
    .join("\n");
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

export function TourBookingCard({
  booking,
  tourId,
  tourDateYmd,
  todayYmd,
  receiptPhotoUrl,
  autoOpen = false,
  canTakePayments,
  guideDebtTopupOnly = false,
  canIssueReceipt,
  canEditTouristFields,
  /** Время сбора у отеля: только менеджер (своя бронь), главный менеджер, директор. */
  canEditPickupOverride = false,
  canDeleteBooking,
  showWhatsApp = true,
  /** Ложь для менеджера: чужая бронь - телефон не показываем. */
  showPhone = true,
  transferHref,
  duplicateHref,
  contextLine,
  canEditDispatcherPhoto = false,
  hideDispatcherBookingForViewer = false,
  canViewPassportPhotos = false,
  canUploadPassportPhotos = false,
  /** Гид без назначения на тур: скрытые подписи вместо ПДн (данные уже обрезаны на сервере). */
  touristPiiHidden = false,
  /** Менеджер: неявка по учёту гида - условия возврата */
  managerNoShowRefund = null,
  receiptPdfLabel,
  bookingTimeLockActive = false,
  viewerRole,
  /** Стандартное время начала сбора по расписанию тура (HH:MM). */
  tourStandardPickupHhMm = "",
  /** Окно сбора для подсказки, напр. 05:00-05:30. */
  tourPickupWindowLabel = "",
  /** Гиду: подсветить нестандартное время сбора. */
  showPickupOverrideGuideAlert = false,
  /** Текст из шаблона: что отправить туристу с квитанцией (время выезда, что взять). */
  templateTouristSendCopy = null,
  /** ISO timestamp: когда приветствие уже было отправлено. Если задано — prefill не подставляем. */
  briefingSentAt = null,
}: {
  booking: Booking;
  tourId: string;
  tourDateYmd: string;
  todayYmd: string;
  receiptPhotoUrl?: string | null;
  autoOpen?: boolean;
  canTakePayments: boolean;
  /** Режим гида: только доплата по долгу на своём туре (без квитанций и прочих операций). */
  guideDebtTopupOnly?: boolean;
  canIssueReceipt: boolean;
  canEditTouristFields: boolean;
  canEditPickupOverride?: boolean;
  canDeleteBooking: boolean;
  showWhatsApp?: boolean;
  showPhone?: boolean;
  /** Перенос брони на другой тур (тот же ON, смена выезда). */
  transferHref?: string | null;
  /** Вторая бронь на другой тур с тем же телефоном (тот же менеджер продаж). */
  duplicateHref?: string | null;
  contextLine?: string | null;
  /** Диспетчер: ссылка на фото брони с объекта */
  canEditDispatcherPhoto?: boolean;
  /** Менеджер: не показывать круг и блок фото диспетчера (чужая зона ответственности). */
  hideDispatcherBookingForViewer?: boolean;
  /** Фото паспортов для отелей/букинга */
  canViewPassportPhotos?: boolean;
  canUploadPassportPhotos?: boolean;
  touristPiiHidden?: boolean;
  /** После 17:00 накануне выезда: без правки карточки (кроме директора); подсказка по оферте. */
  bookingTimeLockActive?: boolean;
  viewerRole: Role;
  managerNoShowRefund?: {
    absenceId: string;
    tourId: string;
    absentPax: number;
    refundVnd: number;
    refundNotRequired: boolean;
    acknowledgedAt: string | null;
    managerRefundNote?: string | null;
    managerRefundCertificateUrl?: string | null;
  } | null;
  receiptPdfLabel?: string;
  tourStandardPickupHhMm?: string;
  tourPickupWindowLabel?: string;
  showPickupOverrideGuideAlert?: boolean;
  templateTouristSendCopy?: string | null;
  briefingSentAt?: string | null;
}) {
  const t = useTranslations("booking");
  const [open, setOpen] = useState(false);
  const [briefingSent, setBriefingSent] = useState(Boolean(briefingSentAt));
  const [customerName, setCustomerName] = useState(booking.customerName);
  const [hotelName, setHotelName] = useState(booking.hotel);
  const [mapsUrl, setMapsUrl] = useState(booking.mapsUrl ?? "");
  const [room, setRoom] = useState(booking.room ?? "");
  const [phone, setPhone] = useState(booking.phone);
  const [telegramUsername, setTelegramUsername] = useState(booking.telegramUsername ?? "");
  const [pickupTime, setPickupTime] = useState(pickupTimeForInput(booking.pickupTime));
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  const [infants, setInfants] = useState(booking.infants);
  const [note, setNote] = useState(booking.note ?? "");
  const [topupText, setTopupText] = useState(formatVndInput(booking.dueVnd));
  const [busy, setBusy] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUsers, setShareUsers] = useState<{ id: string; fullName: string; role: string }[]>([]);
  const [shareQuery, setShareQuery] = useState("");
  const [shareSelectedId, setShareSelectedId] = useState<string>("");
  const [sharePercentText, setSharePercentText] = useState("50");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [managerRefundEdit, setManagerRefundEdit] = useState(false);
  const [refundStr, setRefundStr] = useState("");
  const [refundCurrency, setRefundCurrency] = useState<"vnd" | "usd">("usd");
  const [refundUsdStr, setRefundUsdStr] = useState("");
  const [refundRateStr, setRefundRateStr] = useState("26000");
  const [refundComment, setRefundComment] = useState("");
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [cancelRequest, setCancelRequest] = useState<{
    id: string;
    status: "pending" | "approved" | "rejected";
    requestedRole?: string | null;
    requestedAt?: string | null;
  } | null>(null);
  const [cancelRequestBusy, setCancelRequestBusy] = useState(false);
  const certFileRef = useRef<HTMLInputElement>(null);
  /** Сразу после успешного API, пока не пришёл refresh с сервера */
  const [localRefundResolved, setLocalRefundResolved] = useState<{
    noRefund: boolean;
    refundVnd: number;
  } | null>(null);
  const dispPhotoFileRef = useRef<HTMLInputElement>(null);
  const managerRefundAnchorRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const serverRefundAcknowledgedAt =
    typeof managerNoShowRefund?.acknowledgedAt === "string" && managerNoShowRefund.acknowledgedAt.trim()
      ? managerNoShowRefund.acknowledgedAt
      : null;
  const refundAcknowledgedAt = serverRefundAcknowledgedAt ?? (localRefundResolved ? "local" : null);
  const managerRefundPending = Boolean(managerNoShowRefund && !refundAcknowledgedAt);
  const effectiveRefundNotRequired =
    serverRefundAcknowledgedAt != null
      ? Boolean(managerNoShowRefund?.refundNotRequired)
      : (localRefundResolved?.noRefund ?? false);
  const effectiveRefundVnd =
    serverRefundAcknowledgedAt != null
      ? (managerNoShowRefund?.refundVnd ?? 0)
      : (localRefundResolved?.refundVnd ?? 0);

  const showManagerRefundForm =
    managerNoShowRefund && (!refundAcknowledgedAt || managerRefundEdit);

  /** После дедлайна оферты правка недоступна - вместо «Редактировать» показываем «Отмена». */
  const showCancelInsteadOfEdit = bookingTimeLockActive && !canEditTouristFields;
  // Только владелец брони (менеджер-автор) или назначенный гид/офис могут запросить отмену.
  // showPhone = true для менеджера-владельца и назначенного гида; false для чужих броней.
  const mayRequestCancellation =
    showCancelInsteadOfEdit &&
    showPhone &&
    (viewerRole === "accountant" || viewerRole === "chief_manager" || viewerRole === "chief_guide" || viewerRole === "manager");
  const mayApproveCancellation = viewerRole === "director" && cancelRequest?.status === "pending";

  const hasTelegramRow =
    showWhatsApp && !touristPiiHidden && (telegramUsername.trim() || booking.telegramUsername?.trim());
  const hasEditAction = canEditTouristFields;
  const canShareCommission = (viewerRole === "manager" || viewerRole === "chief_manager") && canIssueReceipt;
  const touristBriefingText = (templateTouristSendCopy?.trim() ||
    buildDefaultTouristBriefing({
      tourDateYmd,
      pickupTime: booking.pickupTime,
    })).trim();

  // Prefill только при первой отправке. После клика — отмечаем как отправлено.
  const prefillForWhatsApp = briefingSent ? null : (touristBriefingText || null);

  async function markBriefingSent() {
    if (briefingSent) return;
    setBriefingSent(true);
    try {
      await fetch(`/api/bookings/${booking.id}/mark-briefing-sent`, { method: "POST" });
    } catch {
      // не блокируем UX при ошибке
    }
  }
  const hasMoreBookingActions =
    hasEditAction ||
    canShareCommission ||
    Boolean(duplicateHref) ||
    Boolean(transferHref) ||
    (touristBriefingText && showWhatsApp && !touristPiiHidden && briefingSent) ||
    mayRequestCancellation ||
    mayApproveCancellation ||
    (showCancelInsteadOfEdit && !mayRequestCancellation && !mayApproveCancellation && showPhone) ||
    (bookingTimeLockActive && managerNoShowRefund && managerRefundPending && !showCancelInsteadOfEdit);

  const bookingSyncKey = bookingCardSyncKey(booking);

  useEffect(() => {
    setMoreActionsOpen(false);
  }, [bookingSyncKey]);

  useEffect(() => {
    if (!shareModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, shareRes] = await Promise.all([
          fetch("/api/users/commission-share-candidates", { cache: "no-store" }),
          fetch(`/api/bookings/${booking.id}/commission-share`, { cache: "no-store" }),
        ]);
        const usersJson = (await usersRes.json().catch(() => ({}))) as {
          users?: { id: string; fullName: string; role: string }[];
        };
        const shareJson = (await shareRes.json().catch(() => ({}))) as {
          share?: { beneficiaryId?: string; percent?: number } | null;
        };
        if (cancelled) return;
        if (usersRes.ok && Array.isArray(usersJson.users)) {
          setShareUsers(usersJson.users);
        }
        if (shareRes.ok && shareJson.share?.beneficiaryId) {
          setShareSelectedId(String(shareJson.share.beneficiaryId));
          const pct = Number(shareJson.share.percent ?? 0);
          setSharePercentText(String(Number.isFinite(pct) && pct > 0 ? pct : 50));
          const u = (usersJson.users || []).find((x) => x.id === String(shareJson.share?.beneficiaryId));
          if (u) setShareQuery(`${u.fullName} (${u.role})`);
        } else {
          setShareSelectedId("");
          setSharePercentText("50");
          setShareQuery("");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareModalOpen, booking.id]);

  useEffect(() => {
    setCustomerName(booking.customerName);
    setHotelName(booking.hotel);
    setMapsUrl(booking.mapsUrl ?? "");
    setRoom(booking.room ?? "");
    setPhone(booking.phone);
    setTelegramUsername(booking.telegramUsername ?? "");
    setPickupTime(pickupTimeForInput(booking.pickupTime));
    setAdults(booking.adults);
    setChildren(booking.children);
    setInfants(booking.infants);
    setNote(booking.note ?? "");
    setTopupText(formatVndInput(booking.dueVnd));
    // Все поля учтены в bookingSyncKey - не добавлять booking в deps (иначе снова object + смена формы deps).
  }, [bookingSyncKey]);

  useEffect(() => {
    setManagerRefundEdit(false);
    if (managerNoShowRefund && managerNoShowRefund.refundVnd > 0) {
      setRefundStr(formatVndInput(managerNoShowRefund.refundVnd));
    } else {
      setRefundStr("");
    }
  }, [
    booking.id,
    managerNoShowRefund?.absenceId ?? "",
    serverRefundAcknowledgedAt ?? "",
    managerNoShowRefund?.refundVnd ?? 0,
  ]);

  useEffect(() => {
    if (serverRefundAcknowledgedAt) setLocalRefundResolved(null);
  }, [serverRefundAcknowledgedAt]);

  useEffect(() => {
    setLocalRefundResolved(null);
    setRefundComment("");
    setCertificateUrl(null);
    setRefundUsdStr("");
    setRefundCurrency("usd");
    setRefundRateStr("26000");
  }, [booking.id]);

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    const el = document.getElementById(`booking-${booking.id}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [autoOpen, booking.id]);

  useEffect(() => {
    const need =
      bookingTimeLockActive ||
      viewerRole === "director" ||
      viewerRole === "accountant" ||
      viewerRole === "chief_manager" ||
      viewerRole === "chief_guide" ||
      viewerRole === "manager";
    if (!need) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}/cancel-request`, { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          request?: { id?: string; status?: "pending" | "approved" | "rejected"; requested_role?: string; requested_at?: string } | null;
        };
        if (cancelled) return;
        if (j.request?.id && j.request.status) {
          setCancelRequest({
            id: j.request.id,
            status: j.request.status,
            requestedRole: j.request.requested_role ?? null,
            requestedAt: j.request.requested_at ?? null,
          });
        } else {
          setCancelRequest(null);
        }
      } catch {
        if (!cancelled) setCancelRequest(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking.id, bookingTimeLockActive, viewerRole]);

  async function submitCancelRequest() {
    const note = window.prompt("Причина отмены (коротко):", "") ?? "";
    setCancelRequestBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; requestId?: string | null };
      if (!res.ok) {
        alert(j.error || "Не удалось создать заявку.");
        return;
      }
      setCancelRequest({
        id: j.requestId || "pending",
        status: "pending",
        requestedRole: viewerRole,
        requestedAt: new Date().toISOString(),
      });
      alert("Заявка на отмену создана. Ожидает подтверждения директора.");
      await router.refresh();
    } finally {
      setCancelRequestBusy(false);
    }
  }

  async function decideCancelRequest(action: "approve" | "reject") {
    setCancelRequestBusy(true);
    try {
      const note = action === "reject" ? (window.prompt("Причина отклонения:", "") ?? "") : "";
      const res = await fetch(`/api/bookings/${booking.id}/cancel-request`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Не удалось обновить заявку.");
        return;
      }
      if (action === "approve") window.location.reload();
      else setCancelRequest((prev) => (prev ? { ...prev, status: "rejected" } : prev));
    } finally {
      setCancelRequestBusy(false);
    }
  }

  async function saveDispatcherPhoto(photoUrl?: string) {
    if (!canEditDispatcherPhoto) return;
    const url = photoUrl !== undefined ? photoUrl : "";
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/dispatcher-photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: url }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось сохранить фото");
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!canEditTouristFields) return;
    const nameTrim = customerName.trim();
    if (!nameTrim) {
      alert("Укажите имя туриста.");
      return;
    }
    const phoneTrim = phone.trim();
    if (phoneTrim.length < 6) {
      alert("Укажите телефон (как при создании брони).");
      return;
    }
    const normPickup = normalizeTourPickupHhMm(pickupTimeForInput(pickupTime.trim() || booking.pickupTime));
    const std = tourStandardPickupHhMm ? normalizeTourPickupHhMm(tourStandardPickupHhMm) : "";
    if (
      canEditPickupOverride &&
      std &&
      normPickup &&
      normPickup !== std &&
      note.trim().length < 12
    ) {
      alert(
        "Время сбора отличается от стандартного по туру — в примечании к брони кратко укажите причину (не короче 12 символов), чтобы гид и офис понимали контекст.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: nameTrim,
          hotelName: hotelName.trim() || "-",
          hotelMapsUrl: mapsUrl.trim(),
          room: room.trim(),
          phone: phoneTrim,
          pickupTime: pickupTimeForInput(pickupTime.trim() || booking.pickupTime),
          adults: clampCount(adults),
          children: clampCount(children),
          infants: clampCount(infants),
          note: note.trim() ? note.trim() : "",
          telegramUsername: telegramUsername.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function downloadReceipt() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/receipt`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Не удалось сформировать квитанцию");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `receipt-${booking.id}.pdf`;
      // iOS: Web Share API → файл с правильным именем (не "unknown"); blob: URL недоступен WhatsApp
      if (isIosDevice() && typeof navigator !== "undefined" && "share" in navigator) {
        const file = new File([blob], filename, { type: "application/pdf" });
        try {
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            return;
          }
        } catch (e2) {
          if (e2 instanceof Error && e2.name === "AbortError") return;
        }
        const fallbackUrl = URL.createObjectURL(blob);
        window.location.assign(fallbackUrl);
        setTimeout(() => URL.revokeObjectURL(fallbackUrl), 90_000);
        return;
      }
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener noreferrer";
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 90_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function onSavePayments() {
    if (!canTakePayments) return;
    const deltaVnd = parseVndInput(topupText);
    const totalVnd = booking.totalVnd;
    const currentNetPaid = booking.paidVnd;
    if (deltaVnd <= 0) return;
    if (guideDebtTopupOnly && deltaVnd > booking.dueVnd) {
      alert(`Сумма не больше долга: ${formatVnd(booking.dueVnd)}`);
      return;
    }
    const ok = window.confirm(
      `Подтвердить оплату ${formatVnd(deltaVnd)} для туриста ${booking.customerName}?\n\nПосле подтверждения сумма сразу попадёт в учёт.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const desiredPaidAfter = currentNetPaid + deltaVnd;
      const shouldIssueReceipt = canIssueReceipt && desiredPaidAfter >= totalVnd;
      const resTopup = await fetch(`/api/bookings/${booking.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "topup", amountVnd: deltaVnd }),
      });
      const contentType = resTopup.headers.get("content-type") ?? "";
      const jsonTopup = contentType.includes("application/json")
        ? ((await resTopup.json().catch(() => ({}))) as { error?: string })
        : ({} as { error?: string });
      if (!resTopup.ok) {
        const textFallback = !contentType.includes("application/json") ? await resTopup.text().catch(() => "") : "";
        throw new Error(jsonTopup.error || textFallback || "Платёж не записан");
      }
      setTopupText("");
      if (shouldIssueReceipt) {
        await downloadReceipt();
      }
      await router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest("button, input, textarea, select, a, [data-booking-modal], [data-booking-stop-toggle]");
  }

  const shareFilteredUsers = (() => {
    const q = shareQuery.trim().toLowerCase();
    if (!q) return shareUsers.slice(0, 20);
    return shareUsers
      .filter((u) => u.fullName.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      .slice(0, 20);
  })();

  async function saveCommissionShare() {
    const pct = Math.max(0, Math.min(100, Number(sharePercentText.replace(",", ".")) || 0));
    const beneficiaryId = shareSelectedId || null;
    const beneficiary = beneficiaryId ? shareUsers.find((u) => u.id === beneficiaryId) : null;
    const beneficiaryLabel = beneficiary ? `${beneficiary.fullName} (${beneficiary.role})` : "без сотрудника";
    const confirmText =
      beneficiaryId && pct > 0
        ? `Подтвердить деление комиссии?\n\nСотрудник: ${beneficiaryLabel}\nПроцент: ${pct}%\n\nЭтот процент будет вычтен из ваших комиссионных по этой заявке.`
        : "Подтвердить, что деление комиссии нужно убрать?";
    if (!window.confirm(confirmText)) return;

    setShareBusy(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/commission-share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, percent: pct }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Не удалось сохранить деление комиссии");
      setShareModalOpen(false);
      setMoreActionsOpen(false);
      await router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setShareBusy(false);
    }
  }

  async function uploadDispatcherFile(file: File) {
    if (!canEditDispatcherPhoto) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "dispatcher_booking");
      fd.set("bookingId", booking.id);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) throw new Error(json.error || "Загрузка не удалась");
      if (!json.url) throw new Error("Нет URL");
      const patch = await fetch(`/api/bookings/${booking.id}/dispatcher-photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: json.url }),
      });
      const pj = (await patch.json().catch(() => ({}))) as { error?: string };
      if (!patch.ok) throw new Error(pj.error || "Не удалось прикрепить фото");
      setPhotoModalOpen(false);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDispatcherPhoto() {
    if (!dispatcherPhoto) return;
    setBusy(true);
    try {
      const res = await fetch(dispatcherPhoto);
      if (!res.ok) throw new Error("Не удалось скачать фото");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `booking-${booking.id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const photoCircleClass =
    "relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-soft)] ring-2 ring-[var(--border)]";

  /** Через CSS-переменные - корректно и при html.dark без совпадения ОС с темой. */
  const tourTiming =
    tourDateYmd < todayYmd
      ? {
          label: t("tourDone"),
          className: "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--border)]",
        }
      : tourDateYmd > todayYmd
        ? {
            label: t("tourUpcoming"),
            className: "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--border)]",
          }
        : {
            label: t("tourToday"),
            className: "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--border)]",
          };

  const fullyPaid = booking.totalVnd > 0 && booking.dueVnd <= 0;
  const hasDebt = booking.dueVnd > 0;
  /** Без заливки всей карточки - только спокойная полоска слева (оплата / долг). */
  const payAccent =
    fullyPaid
      ? "!border-l-[4px] !border-l-teal-500/85 dark:!border-l-teal-400/70"
      : hasDebt
        ? "!border-l-[4px] !border-l-amber-500/85 dark:!border-l-amber-400/65"
        : "";
  const borderAccent = managerRefundPending
    ? "!border-l-[4px] !border-l-red-500 dark:!border-l-red-400/85"
    : payAccent;

  const managerNoRefundConfirmed = Boolean(
    serverRefundAcknowledgedAt && managerNoShowRefund?.refundNotRequired,
  );

  async function uploadRefundCertificate(file: File) {
    if (!managerNoShowRefund) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "manager_refund_certificate");
      fd.set("bookingId", booking.id);
      fd.set("tourId", managerNoShowRefund.tourId);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) throw new Error(j.error || "Не удалось загрузить файл");
      if (!j.url) throw new Error("Нет URL файла");
      setCertificateUrl(j.url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function postManagerRefund(body: Record<string, unknown>) {
    if (!managerNoShowRefund) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${managerNoShowRefund.tourId}/manifest/manager-refund`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Не удалось сохранить");
      setManagerRefundEdit(false);
      setOpen(false);
      if (body.noRefund) {
        setLocalRefundResolved({ noRefund: true, refundVnd: 0 });
      } else if (typeof body.refundVnd === "number") {
        setLocalRefundResolved({ noRefund: false, refundVnd: body.refundVnd });
      } else if (typeof body.refundUsd === "number" && typeof body.usdToVndRate === "number") {
        setLocalRefundResolved({
          noRefund: false,
          refundVnd: Math.round(body.refundUsd * body.usdToVndRate),
        });
      }
      await router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  const metaText = "text-[var(--text)]/88 dark:text-zinc-200";
  const metaTextSm = "text-sm text-[var(--text)]/88 dark:text-zinc-200";

  const onlineCode = booking.onlineCode;
  const dispatcherPhoto = booking.dispatcherBookingPhotoUrl;
  // Фото брони — удалённая сущность, больше не показываем
  const showDispatcherPhotoBlock = false;

  return (
    <article
      id={`booking-${booking.id}`}
      className={`card mb-2 transition-colors ${
        managerNoRefundConfirmed
          ? "!border-2 !border-emerald-400/90 !bg-emerald-50/75 dark:!border-emerald-600/50 dark:!bg-emerald-950/30"
          : borderAccent
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tourTiming.className}`}>
            {tourTiming.label}
          </span>
          {contextLine ? <div className={`mb-0.5 text-xs font-medium ${metaText}`}>{contextLine}</div> : null}
          <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold leading-snug text-[var(--text)]">{booking.customerName}</div>
                {onlineCode ? (
                  <span className="inline-flex shrink-0 items-center rounded-lg border border-sky-400/50 bg-sky-100 px-2 py-0.5 text-[11px] font-bold tabular-nums tracking-wide text-sky-950 shadow-sm dark:border-sky-300/45 dark:bg-sky-600 dark:text-white dark:shadow-md dark:ring-1 dark:ring-sky-400/40">
                    ON {onlineCode}
                  </span>
                ) : null}
              </div>
              <div className={metaTextSm}>
                {touristPiiHidden ? (
                  <>Тур, на который вы не назначены. Данные туриста и финансы скрыты.</>
                ) : (
                  <>
                    {booking.hotel} · номер {booking.room || "-"}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className={`mt-1 ${metaTextSm}`}>
            {touristPiiHidden ? (
              <>Тур, на который вы не назначены</>
            ) : showPhone ? (
              <>
                {booking.phone}
                {showWhatsApp && booking.telegramUsername?.trim() ? (
                  <> · TG @{booking.telegramUsername.trim()}</>
                ) : null}
                {" · "}сбор {booking.pickupTime}
              </>
            ) : (
              <>телефон скрыт · сбор {booking.pickupTime}</>
            )}{" "}
            {!touristPiiHidden ? (
              <>
                · Продажа: <span className="font-medium">{booking.managerName}</span>
              </>
            ) : null}
          </div>
          {showPickupOverrideGuideAlert && tourStandardPickupHhMm ? (
            <div
              className="mt-2 rounded-lg border border-amber-400/90 bg-amber-50 px-2.5 py-2 text-sm leading-snug text-amber-950 ring-1 ring-amber-300/80 dark:border-amber-600/55 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-700/45"
              onClick={(e) => e.stopPropagation()}
              data-booking-stop-toggle
            >
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                Внимание, гид
              </div>
              <p className="mt-1.5 font-medium">
                Сбор у этого туриста <span className="tabular-nums font-bold">{booking.pickupTime}</span>
                {tourPickupWindowLabel ? (
                  <>
                    {" "}
                    — не как у тура по расписанию ({tourPickupWindowLabel}, стандарт {tourStandardPickupHhMm}).
                  </>
                ) : (
                  <> — не стандартное время по туру ({tourStandardPickupHhMm}).</>
                )}{" "}
                Ниже в примечании к брони должна быть причина; проверьте перед выездом.
              </p>
            </div>
          ) : null}
          {/* Паспорт-строка убрана (лишняя информация на карточке) */}
          {managerNoShowRefund ? (
            <div
              ref={managerRefundAnchorRef}
              className={`mt-2 rounded-lg px-2.5 py-2 text-sm ring-1 ${
                managerRefundPending
                  ? "border border-red-200/90 bg-red-50/90 ring-red-200/80 dark:border-red-900/50 dark:bg-red-950/35 dark:ring-red-900/60"
                  : "border border-emerald-200/70 bg-emerald-50/80 ring-emerald-200/70 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:ring-emerald-900/50"
              }`}
              onClick={(e) => e.stopPropagation()}
              data-booking-stop-toggle
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                Неявка (учёт гида)
              </div>
              {showManagerRefundForm ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-[var(--text)]">
                    По учёту гида не вышло человек:{" "}
                    <span className="font-semibold">{managerNoShowRefund.absentPax}</span>. Подтвердите: возврат не
                    нужен - или укажите сумму возврата, причину и при необходимости прикрепите фото справки от туриста.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void postManagerRefund({ noRefund: true });
                      }}
                      className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                    >
                      {busy ? "Сохранение…" : "Возврат не требуется"}
                    </button>
                  </div>
                  <div className="border-t border-[var(--border)] pt-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                      Возврат денег
                    </p>
                    <select
                      value={refundCurrency}
                      onChange={(e) => setRefundCurrency(e.target.value as "vnd" | "usd")}
                      className="field-surface mb-2 w-full max-w-xs rounded-xl px-3 py-2 text-sm"
                      disabled={busy}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="usd">Сумма в долларах (USD)</option>
                      <option value="vnd">Сумма в донгах (₫)</option>
                    </select>
                    {refundCurrency === "usd" ? (
                      <>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="field-surface mb-2 w-full max-w-xs rounded-xl px-3 py-2 text-sm"
                          placeholder="Сумма, USD"
                          value={refundUsdStr}
                          onChange={(e) => setRefundUsdStr(e.target.value.replace(/[^\d.,]/g, ""))}
                          disabled={busy}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          className="field-surface mb-2 w-full max-w-xs rounded-xl px-3 py-2 text-sm"
                          placeholder="Курс USD → VND"
                          value={refundRateStr}
                          onChange={(e) => setRefundRateStr(e.target.value.replace(/\D/g, ""))}
                          disabled={busy}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        className="field-surface mb-2 w-full max-w-xs rounded-xl px-3 py-2 text-sm"
                        placeholder="Сумма возврата, ₫"
                        value={refundStr}
                        onChange={(e) => setRefundStr(formatVndInput(parseVndInput(e.target.value)))}
                        disabled={busy}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <label className="mb-1 block text-[11px] font-medium text-[var(--muted2)]">
                      Комментарий: причина возврата
                    </label>
                    <textarea
                      value={refundComment}
                      onChange={(e) => setRefundComment(e.target.value)}
                      rows={3}
                      className="field-surface mb-2 w-full rounded-xl px-3 py-2 text-sm"
                      placeholder="Опишите ситуацию полностью"
                      disabled={busy}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      ref={certFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = "";
                        if (f) void uploadRefundCertificate(f);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          certFileRef.current?.click();
                        }}
                        className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                      >
                        Прикрепить фото справки
                      </button>
                      {certificateUrl ? (
                        <a
                          href={certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-[var(--accent)] underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Файл загружен
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const note = refundComment.trim();
                          if (note.length < 15) {
                            alert("Напишите комментарий к возврату (не короче 15 символов).");
                            return;
                          }
                          if (refundCurrency === "usd") {
                            const usd = parseUsdInput(refundUsdStr);
                            const rate = Number(refundRateStr.replace(/\D/g, "")) || 0;
                            if (usd <= 0) {
                              alert("Введите сумму возврата в USD или подтвердите «Возврат не требуется».");
                              return;
                            }
                            if (rate < 1) {
                              alert("Укажите курс USD → VND.");
                              return;
                            }
                            void postManagerRefund({
                              refundUsd: usd,
                              usdToVndRate: rate,
                              note,
                              ...(certificateUrl ? { certificateUrl } : {}),
                            });
                          } else {
                            const v = parseVndInput(refundStr);
                            if (v <= 0) {
                              alert("Введите сумму возврата в ₫ или подтвердите «Возврат не требуется».");
                              return;
                            }
                            void postManagerRefund({
                              refundVnd: v,
                              note,
                              ...(certificateUrl ? { certificateUrl } : {}),
                            });
                          }
                        }}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? "Сохранение…" : "Подтвердить возврат"}
                      </button>
                      {managerRefundEdit && refundAcknowledgedAt ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setManagerRefundEdit(false);
                          }}
                          className="rounded-xl px-3 py-2 text-xs text-[var(--muted)] hover:underline"
                        >
                          Отмена
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 space-y-1.5 text-xs text-[var(--muted)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {effectiveRefundNotRequired
                        ? "Возврат не требуется - подтверждено."
                        : `Возврат подтверждён: ${formatVnd(effectiveRefundVnd)} ₫.`}
                    </span>
                    <button
                      type="button"
                      className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setManagerRefundEdit(true);
                      }}
                    >
                      Изменить
                    </button>
                  </div>
                  {!effectiveRefundNotRequired && managerNoShowRefund.managerRefundNote ? (
                    <p className="whitespace-pre-wrap text-[var(--text)]">{managerNoShowRefund.managerRefundNote}</p>
                  ) : null}
                  {!effectiveRefundNotRequired && managerNoShowRefund.managerRefundCertificateUrl ? (
                    <a
                      href={managerNoShowRefund.managerRefundCertificateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block font-medium text-[var(--accent)] underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Открыть фото справки
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-row-reverse items-start gap-3">
          {showDispatcherPhotoBlock ? (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                ref={dispPhotoFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = "";
                  if (f) void uploadDispatcherFile(f);
                }}
              />
              {canEditDispatcherPhoto ? (
                <button
                  type="button"
                  data-booking-modal="trigger"
                  className={photoCircleClass}
                  onClick={() => setPhotoModalOpen(true)}
                  aria-label={dispatcherPhoto ? "Изменить фото брони" : "Добавить фото брони"}
                >
                  {dispatcherPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dispatcherPhoto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] font-medium leading-tight text-[var(--muted)]">
                      Фото
                      <br />
                      брони
                    </span>
                  )}
                </button>
              ) : dispatcherPhoto ? (
                <a href={dispatcherPhoto} target="_blank" rel="noreferrer" className={photoCircleClass}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dispatcherPhoto} alt="Фото брони" className="h-full w-full object-cover" />
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col items-end gap-1 text-right">
            {touristPiiHidden ? (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--border)]">
                {t("financeHidden")}
              </span>
            ) : (
              <>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-[var(--border)] ${
                    booking.paymentStatus === "paid"
                      ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : booking.paymentStatus === "partial"
                        ? "bg-[var(--warn-soft)] text-[var(--warn)]"
                        : "bg-[var(--danger-soft)] text-[var(--danger)]"
                  }`}
                >
                  {booking.paymentStatus === "paid"
                    ? t("paid")
                    : booking.paymentStatus === "partial"
                      ? t("partial")
                      : t("unpaid")}
                </span>
                {booking.dueVnd > 0 ? (
                  <span className="text-xs font-semibold text-[var(--warn)]">{t("debtLabel")}: {formatVnd(booking.dueVnd)}</span>
                ) : booking.paymentStatus !== "paid" ? (
                  <span className="text-xs font-semibold text-[var(--success)]">{t("paidFull")}</span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      {!touristPiiHidden ? (
        <div
          className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:bg-[var(--surface-elevated)] dark:shadow-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("groupComp")}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[var(--text)]">
            <span className="text-lg font-semibold tabular-nums tracking-tight">
              {booking.adults}
              <span className="ml-1 text-sm font-medium text-[var(--muted)]">{t("adultsShort")}</span>
            </span>
            <span className="text-lg font-semibold tabular-nums tracking-tight">
              {booking.children}
              <span className="ml-1 text-sm font-medium text-[var(--muted)]">{t("childrenShort")}</span>
            </span>
            <span className="text-lg font-semibold tabular-nums tracking-tight">
              {booking.infants}
              <span className="ml-1 text-sm font-medium text-[var(--muted)]">мл.</span>
            </span>
          </div>
        </div>
      ) : null}
      {booking.priceLines &&
      booking.priceLines.some((line) => !/участники|стоимость/i.test(String(line.label || ""))) &&
      !touristPiiHidden ? (
        <div
          className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:bg-[var(--surface-elevated)] dark:shadow-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("additionalServices")}</div>
          <ul className="mt-1.5 space-y-1 text-sm leading-snug">
            {booking.priceLines
              .filter((line) => !/участники|стоимость/i.test(String(line.label || "")))
              .map((line, idx) => (
              <li key={`${line.label}-${idx}`} className="flex justify-between gap-3">
                <span className="min-w-0 flex-1 text-[var(--text)]">{line.label}</span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">{formatVnd(line.amountVnd)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!!booking.note && !touristPiiHidden ? (
        <div
          className="mt-3 w-full rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm leading-snug ring-1 ring-[var(--border)] dark:bg-[var(--surface-elevated)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("comment")}</div>
          <p className="mt-1.5 whitespace-pre-wrap text-[var(--text)]">{booking.note}</p>
        </div>
      ) : null}
      {canViewPassportPhotos ? (
        <BookingPassportPhotosBlock
          bookingId={booking.id}
          tourId={tourId}
          initialUrls={booking.passportPhotoUrls ?? []}
          canView={canViewPassportPhotos}
          canUpload={canUploadPassportPhotos}
        />
      ) : null}
      {canTakePayments && !fullyPaid && !touristPiiHidden ? (
        <div
          className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 dark:bg-[var(--surface-elevated)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("debtLabel")}</div>
          {guideDebtTopupOnly ? (
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
              Только доплата по долгу. Возвраты — через офис.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm tabular-nums"
              value={topupText}
              onChange={(e) => setTopupText(formatVndInput(parseVndInput(e.target.value)))}
              disabled={!canTakePayments || busy}
              inputMode="numeric"
              placeholder="Сумма ₫"
            />
            <button
              type="button"
              disabled={!canTakePayments || busy}
              onClick={() => void onSavePayments()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "…" : t("add")}
            </button>
          </div>
          <div className="mt-1.5 text-xs text-[var(--muted)]">
            {t("paidSummary", { paid: formatVnd(booking.paidVnd), debt: formatVnd(booking.dueVnd) })}
          </div>
          {booking.lastTopupByName && booking.lastTopupByRole ? (
            <div className="mt-0.5 text-[11px] text-[var(--muted2)]">
              {t("lastTopup", { name: booking.lastTopupByName, role: booking.lastTopupByRole })}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        suppressHydrationWarning
        className="mt-3 flex w-full flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Кнопка "Инфо" убрана: приветственное сообщение передаётся через WhatsApp/Telegram */}
        {canIssueReceipt ? (
          <ReceiptPdfButton
            bookingId={booking.id}
            label={receiptPdfLabel ?? "Скачать квитанцию"}
            className="w-full justify-center border-amber-300/80 bg-amber-100 text-amber-900 hover:brightness-[1.02] dark:border-amber-600/50 dark:bg-amber-900/45 dark:text-amber-100"
          />
        ) : null}
        {showWhatsApp && !touristPiiHidden ? (
          <div className="relative w-full">
            <WhatsAppBookingLink
              phone={booking.phone}
              className="w-full justify-center"
              prefillMessage={prefillForWhatsApp}
              onOpen={() => void markBriefingSent()}
            />
            {briefingSent && touristBriefingText ? (
              <span className="absolute -top-1.5 -right-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">✓</span>
            ) : null}
          </div>
        ) : null}
        {showWhatsApp && !touristPiiHidden && booking.phoneAlt?.trim() ? (
          <WhatsAppBookingLink
            phone={booking.phoneAlt}
            label="WhatsApp (запасной)"
            className="w-full justify-center opacity-95"
            prefillMessage={prefillForWhatsApp}
            onOpen={() => void markBriefingSent()}
          />
        ) : null}
        {hasTelegramRow ? (
          <TelegramBookingLink
            username={telegramUsername.trim() || booking.telegramUsername?.trim() || ""}
            prefillMessage={prefillForWhatsApp}
            onOpen={() => void markBriefingSent()}
            className="w-full justify-center"
          />
        ) : null}
        {canDeleteBooking ? (
          <BookingDeleteButton
            bookingId={booking.id}
            viewerRole={viewerRole}
            customerName={booking.customerName}
            tourDateYmd={tourDateYmd}
          />
        ) : null}
        {(viewerRole === "chief_manager" || viewerRole === "director") ? (
          <BookingCancelRetentionButton
            bookingId={booking.id}
            customerName={booking.customerName}
            totalVnd={booking.totalVnd}
            depositVnd={booking.depositVnd}
          />
        ) : null}
        {hasMoreBookingActions ? (
          moreActionsOpen ? (
            <div className="flex w-full flex-col gap-2">
              {hasEditAction ? (
                <Link
                  href={`/tours/${tourId}/new-booking?editBooking=${encodeURIComponent(booking.id)}`}
                  className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-violet-300/70 bg-violet-50 px-3 text-[13px] font-medium text-violet-800 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-violet-400/40 dark:bg-violet-900/30 dark:text-violet-200"
                >
                  Изменить
                </Link>
              ) : null}
              {touristBriefingText && showWhatsApp && !touristPiiHidden && briefingSent ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(touristBriefingText).then(() => alert("Текст скопирован — вставьте в WhatsApp вручную."));
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-teal-300/80 bg-teal-50 px-3 text-[13px] font-medium text-teal-800 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-teal-400/40 dark:bg-teal-900/30 dark:text-teal-200"
                >
                  {t("copyGreeting")}
                </button>
              ) : null}
              {canShareCommission ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareModalOpen(true);
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-sky-300/80 bg-sky-50 px-3 text-[13px] font-medium text-sky-800 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200"
                >
                  %
                </button>
              ) : null}
              {duplicateHref ? (
                <Link
                  href={duplicateHref}
                  className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-amber-300/80 bg-amber-50 px-3 text-[13px] font-medium text-amber-800 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-amber-400/45 dark:bg-amber-900/30 dark:text-amber-200"
                >
                  {t("transferTour")}
                </Link>
              ) : null}
              {transferHref ? (
                <Link
                  href={transferHref}
                  className="flex min-h-10 w-full items-center justify-center rounded-[10px] border border-cyan-300/80 bg-cyan-50 px-3 text-[13px] font-medium text-cyan-800 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-cyan-400/45 dark:bg-cyan-900/30 dark:text-cyan-200"
                >
                  {t("transfer")}
                </Link>
              ) : null}
              {mayRequestCancellation ? (
                <button
                  type="button"
                  disabled={cancelRequestBusy || cancelRequest?.status === "pending"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void submitCancelRequest();
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-rose-300/75 bg-rose-50 px-3 text-[13px] font-medium text-rose-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200"
                >
                  {cancelRequest?.status === "pending" ? t("cancelPending") : t("cancelRequest")}
                </button>
              ) : null}
              {mayApproveCancellation ? (
                <>
                  <button
                    type="button"
                    disabled={cancelRequestBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void decideCancelRequest("approve");
                    }}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-emerald-300/80 bg-emerald-50 px-3 text-[13px] font-medium text-emerald-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50 dark:border-emerald-400/45 dark:bg-emerald-900/30 dark:text-emerald-200"
                  >
                    {t("confirmCancel")}
                  </button>
                  <button
                    type="button"
                    disabled={cancelRequestBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void decideCancelRequest("reject");
                    }}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-slate-300/80 bg-slate-50 px-3 text-[13px] font-medium text-slate-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50 dark:border-slate-400/40 dark:bg-slate-800/50 dark:text-slate-200"
                  >
                    {t("rejectRequest")}
                  </button>
                </>
              ) : null}
              {showCancelInsteadOfEdit && !mayRequestCancellation && !mayApproveCancellation && showPhone ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (managerNoShowRefund && managerRefundPending) {
                      managerRefundAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    } else {
                      alert(
                        "После 17:00 накануне выезда изменить или удалить бронь из карточки нельзя. Перенос и отмена - по правилам оферты (удержание 30% или 100%). Для возврата свяжитесь с офисом или используйте сценарий неявки на учёте, если он отображается выше.",
                      );
                    }
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-orange-300/80 bg-orange-50 px-3 text-[13px] font-medium text-orange-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-orange-400/40 dark:bg-orange-900/30 dark:text-orange-200"
                >
                  Отмена
                </button>
              ) : null}
              {bookingTimeLockActive && managerNoShowRefund && managerRefundPending && !showCancelInsteadOfEdit ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    managerRefundAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-red-300/80 bg-red-50 px-3 text-[13px] font-medium text-red-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-red-400/40 dark:bg-red-900/30 dark:text-red-200"
                >
                  {t("refundAction")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreActionsOpen(false);
                }}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-zinc-300/80 bg-zinc-50 px-3 text-[13px] font-medium text-zinc-700 shadow-sm transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-zinc-500/40 dark:bg-zinc-800/50 dark:text-zinc-200"
              >
                {t("hide")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-expanded={moreActionsOpen}
              aria-label="Показать дополнительные действия"
              onClick={(e) => {
                e.stopPropagation();
                setMoreActionsOpen(true);
              }}
              className="inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium text-[var(--text)] shadow-sm transition-[transform,filter] hover:brightness-[1.04] active:scale-[0.99]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t("more")}
            </button>
          )
        ) : null}
      </div>
      {false ? (
        <div className="mt-3 rounded-2xl bg-[var(--surface-soft)] p-3">
          <div
            className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ring-1 ring-black/[0.03] dark:ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("touristData")}</div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
              Как при создании брони. Номер ON выдаётся автоматически и не редактируется.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[132px_1fr] sm:gap-x-3 sm:gap-y-2.5">
              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("onNumber")}</div>
              <div className="break-all text-sm font-semibold tabular-nums text-[var(--text)] sm:pt-2">
                {onlineCode || "-"}
              </div>

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("name")}</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={busy}
                  autoComplete="name"
                />
              ) : (
                <div className="text-sm text-[var(--text)] sm:pt-2">{booking.customerName}</div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("hotel")}</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  disabled={busy}
                />
              ) : (
                <div className="text-sm text-[var(--text)] sm:pt-2">
                  {touristPiiHidden ? "скрыто" : booking.hotel}
                </div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("mapsLink")}</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  disabled={busy}
                  placeholder="Google Maps"
                />
              ) : (
                <div className="break-all text-sm text-[var(--text)] sm:pt-2">
                  {touristPiiHidden ? "скрыто" : booking.mapsUrl || "-"}
                </div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("roomNumber")}</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  disabled={busy}
                />
              ) : (
                <div className="text-sm text-[var(--text)] sm:pt-2">
                  {touristPiiHidden ? "скрыто" : booking.room || "-"}
                </div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("phone")}</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm tabular-nums"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7… или +84…"
                />
              ) : (
                <div className="text-sm tabular-nums text-[var(--text)] sm:pt-2">
                  {touristPiiHidden ? "скрыт" : showPhone ? booking.phone : "скрыт"}
                </div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">Telegram</div>
              {canEditTouristFields ? (
                <input
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value.replace(/[^a-zA-Z0-9_@]/g, ""))}
                  disabled={busy}
                  placeholder="ник без @"
                  autoComplete="off"
                />
              ) : (
                <div className="text-sm text-[var(--text)] sm:pt-2">
                  {touristPiiHidden ? "скрыт" : showWhatsApp && (telegramUsername.trim() || booking.telegramUsername?.trim()) ? (
                    <>@{telegramUsername.trim() || booking.telegramUsername?.trim()}</>
                  ) : (
                    "-"
                  )}
                </div>
              )}

              <div className="text-xs font-medium text-[var(--muted)] sm:pt-2">{t("pickupHotel")}</div>
              {canEditTouristFields && canEditPickupOverride ? (
                <>
                  <input
                    type="time"
                    className="field-surface w-full max-w-[11rem] rounded-xl px-3 py-2 text-sm"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    disabled={busy}
                  />
                  {tourStandardPickupHhMm ? (
                    <p className="mt-1.5 max-w-md text-[11px] leading-snug text-[var(--muted)]">
                      По туру по умолчанию <span className="font-semibold tabular-nums text-[var(--text)]">{tourStandardPickupHhMm}</span>
                      {tourPickupWindowLabel ? (
                        <>
                          {" "}
                          (окно <span className="tabular-nums">{tourPickupWindowLabel}</span>)
                        </>
                      ) : null}
                      . Другое время — только если турист просит иначе; в примечании укажите причину (от 12 символов).
                    </p>
                  ) : null}
                </>
              ) : canEditTouristFields ? (
                <div className="sm:pt-2">
                  <div className="text-sm font-semibold tabular-nums text-[var(--text)]">{booking.pickupTime}</div>
                  <p className="mt-1 max-w-md text-[11px] leading-snug text-[var(--muted)]">
                    Время сбора меняют менеджер продаж (своя бронь), главный менеджер или директор.
                  </p>
                </div>
              ) : (
                <div className="text-sm tabular-nums text-[var(--text)] sm:pt-2">{booking.pickupTime}</div>
              )}
            </div>
          </div>
          {showDispatcherPhotoBlock ? (
            <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ring-1 ring-black/[0.03] dark:ring-white/5">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
                Фото брони · диспетчер
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
                Круг справа в шапке - загрузить фото с устройства. Видно всем на туре.
              </p>
              {canEditDispatcherPhoto ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispPhotoFileRef.current?.click();
                  }}
                  className="mt-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold tracking-wide text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                >
                  {busy ? "…" : dispatcherPhoto ? t("changePhoto") : t("uploadPhoto")}
                </button>
              ) : null}
              {dispatcherPhoto ? (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <a href={dispatcherPhoto || undefined} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dispatcherPhoto || ""}
                      alt="Фото брони"
                      className="max-h-72 w-full rounded-xl object-contain ring-1 ring-[var(--border)]"
                    />
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void downloadDispatcherPhoto()}
                    className="mt-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                  >
                    {busy ? "…" : "Скачать фото"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {receiptPhotoUrl ? (
            <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ring-1 ring-black/[0.03] dark:ring-white/5">
              <div className="text-xs text-[var(--muted2)]">Фото квитанции</div>
              <a href={receiptPhotoUrl || undefined} target="_blank" rel="noreferrer" className="mt-2 inline-block max-w-full">
                <img src={receiptPhotoUrl || ""} alt="" className="max-h-56 max-w-full rounded-lg object-contain" />
              </a>
            </div>
          ) : null}
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ring-1 ring-black/[0.03] dark:ring-white/5">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">{t("money")}</div>
            {guideDebtTopupOnly ? (
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">
                Как гид вы можете внести только доплату по долгу по туристам этого выезда. Возвраты и квитанции - через
                офис.
              </p>
            ) : null}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
              <div className="text-xs text-[var(--muted)]">{t("tourCostLabel")}</div>
              <div className="text-sm font-medium text-[var(--text)]">{formatVnd(booking.totalVnd)}</div>
              {!fullyPaid ? (
                <>
                  <div className="flex items-center text-xs text-[var(--muted)]">{t("debtVnd")}</div>
                  <input
                    className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                    value={topupText}
                    onChange={(e) => setTopupText(formatVndInput(parseVndInput(e.target.value)))}
                    disabled={!canTakePayments || busy}
                    inputMode="numeric"
                    placeholder="1.000.000"
                  />
                </>
              ) : null}
            </div>
            {!fullyPaid ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canTakePayments || busy}
                  onClick={() => void onSavePayments()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? t("adding") : t("addPayment")}
                </button>
              </div>
            ) : null}
            <div className="mt-2 text-xs text-[var(--muted)]">
              {t("paidSummary", { paid: formatVnd(booking.paidVnd), debt: formatVnd(booking.dueVnd) })}
            </div>
            {booking.lastTopupByName && booking.lastTopupByRole ? (
              <div className="mt-1 text-xs text-[var(--muted)]">
                Последнюю доплату внёс: {booking.lastTopupByName} ({booking.lastTopupByRole})
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr]">
            <div className="text-xs text-[var(--muted)]">{t("adults")}</div>
            <NumericRollSelect
              aria-label={t("adults")}
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              min={0}
              max={50}
              value={adults}
              onChange={(n) => setAdults(n)}
              disabled={!canEditTouristFields || busy}
            />
            <div className="text-xs text-[var(--muted)]">{t("children")}</div>
            <NumericRollSelect
              aria-label={t("children")}
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              min={0}
              max={50}
              value={children}
              onChange={(n) => setChildren(n)}
              disabled={!canEditTouristFields || busy}
            />
            <div className="text-xs text-[var(--muted)]">{t("infants")}</div>
            <NumericRollSelect
              aria-label="Младенцы"
              className="field-surface w-full rounded-xl px-3 py-2 text-sm"
              min={0}
              max={50}
              value={infants}
              onChange={(n) => setInfants(n)}
              disabled={!canEditTouristFields || busy}
            />
            {canEditTouristFields ? (
              <>
                <div className="text-xs text-[var(--muted)]">{t("comment")}</div>
                <input
                  className="field-surface w-full rounded-xl px-3 py-2"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
              </>
            ) : (booking.note ?? "").trim() ? (
              <>
                <div className="text-xs text-[var(--muted)]">{t("comment")}</div>
                <div className="whitespace-pre-wrap text-sm text-[var(--text)]">{booking.note}</div>
              </>
            ) : (
              <>
                <div className="text-xs text-[var(--muted)]">{t("comment")}</div>
                <div className="text-sm text-[var(--muted)]">-</div>
              </>
            )}
          </div>
          <div className="action-row mt-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!canEditTouristFields || busy}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? t("saving") : t("save")}
            </button>
          </div>
          {(canDeleteBooking || viewerRole === "chief_manager" || viewerRole === "director") ? (
            <div
              className="mt-4 border-t border-[var(--border)] pt-4 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-2 text-[11px] leading-snug text-[var(--muted)]">
                {TOUR_BOOKING_POLICY_HINT_RU}
              </p>
              {canDeleteBooking ? (
                <BookingDeleteButton
                  bookingId={booking.id}
                  viewerRole={viewerRole}
                  customerName={booking.customerName}
                  tourDateYmd={tourDateYmd}
                />
              ) : null}
              {(viewerRole === "chief_manager" || viewerRole === "director") ? (
                <BookingCancelRetentionButton
                  bookingId={booking.id}
                  customerName={booking.customerName}
                  totalVnd={booking.totalVnd}
                  depositVnd={booking.depositVnd}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {shareModalOpen ? (
        <div
          className="ui-scrim fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Поделиться комиссией"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-4 shadow-xl ring-1 ring-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[var(--text)]">Поделиться</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Выберите сотрудника и процент. Этот процент вычитается из ваших комиссионных по этой заявке.
            </p>
            <div className="mt-3 space-y-2">
              <div className="relative">
                <input
                  type="text"
                  className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                  placeholder="Сотрудник"
                  value={shareQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setShareQuery(next);
                    if (!next.trim()) setShareSelectedId("");
                  }}
                />
                {shareFilteredUsers.length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                    {shareFilteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[var(--surface-soft)]"
                        onClick={() => {
                          setShareSelectedId(u.id);
                          setShareQuery(`${u.fullName} (${u.role})`);
                        }}
                      >
                        {u.fullName} <span className="text-[var(--muted)]">({u.role})</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  className="field-surface w-full rounded-xl px-3 py-2 pr-8 text-sm tabular-nums"
                  placeholder="Процент (например 50)"
                  value={sharePercentText}
                  onChange={(e) => setSharePercentText(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
                  %
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={shareBusy}
                className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void saveCommissionShare()}
              >
                {shareBusy ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={shareBusy}
                className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm text-[var(--muted)]"
                onClick={() => setShareModalOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {photoModalOpen && canEditDispatcherPhoto ? (
        <div
          className="ui-scrim fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          data-booking-modal="backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Фото брони"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhotoModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-4 shadow-xl ring-1 ring-[var(--border)]"
            data-booking-modal="content"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-[var(--text)]">Фото брони</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Загрузите снимок с устройства.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => dispPhotoFileRef.current?.click()}
              >
                Загрузить с устройства
              </button>
              {dispatcherPhoto ? (
                <button
                  type="button"
                  disabled={busy}
                  className="w-full rounded-xl bg-red-50/90 py-2 text-sm text-red-700 ring-1 ring-red-200 disabled:opacity-50 dark:bg-red-950/35 dark:text-red-300 dark:ring-red-800/55"
                  onClick={() => void saveDispatcherPhoto("")}
                >
                  Убрать фото
                </button>
              ) : null}
              <button
                type="button"
                className="w-full rounded-xl py-2 text-sm text-[var(--muted)]"
                onClick={() => setPhotoModalOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
