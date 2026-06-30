import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TourDeleteButton } from "@/components/tour-delete-button";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TopNav } from "@/components/top-nav";
import {
  getTourById,
  listAdvanceEmployeeOptions,
  listTourAdvancesForTour,
  getTourDispatcherBookingEntry,
  getResolvedTourDescriptionForTour,
  getTourTemplateShopLabel,
  getTourTemplateTouristSendCopy,
  getTourTemplateGuideTouristMessage,
  getTourTemplateReviewMessage,
  getManagerTourMessageOverride,
  getTourManifestForTour,
  isUserAssignedGuideOnTour,
  listTours,
  listBookingsForTour,
  listExpensesForTour,
  listGuideSalaryRecordsForTour,
} from "@/lib/data";
import { parseTemplateDescription } from "@/lib/tour-description-share";
import { TourGuidesPanel } from "@/components/tour-guides-panel";
import {
  CopyGroupButton,
} from "@/components/tour-actions";
import { TourDescriptionActions } from "@/components/tour-description-actions";
import { TourBusDriverBlock } from "@/components/tour-bus-driver-block";
import { DispatcherBusQuickForm } from "@/components/dispatcher-bus-quick-form";
import { requireAuth } from "@/lib/auth-session";
import { TourBookingCard } from "@/components/tour-booking-card";
import { TourExpensesPanel } from "@/components/tour-expenses-panel";
import { TourManifestPanel, type TourManifestEditMode } from "@/components/tour-manifest-panel";
import { TourManifestAccountantStage } from "@/components/tour-manifest-accountant-stage";
import { TourGuideExtraEarningsPanel } from "@/components/tour-guide-extra-earnings-panel";
import { TourAdvancePanel } from "@/components/tour-advance-panel";
import { TourDispatcherBookingPanel } from "@/components/tour-dispatcher-booking-panel";
import { TourGuideTransportPanel } from "@/components/tour-guide-transport-panel";
import { GuideTourNoteEdit } from "@/components/guide-tour-note-edit";
import { TourMessagesEditPanel } from "@/components/tour-messages-edit-panel";
import { ManagerTourMessageOverride } from "@/components/manager-tour-message-override";
import {
  canManageBusesOnTourPage,
  FINANCE_ROLES,
  RECEIPT_ROLES,
  canAssignTourGuides,
  canConfirmExpenseAccountantReview,
  canCreateBooking,
  canEditTourManifestRefundNotes,
  canSoftDeleteBooking,
  canEditBookingDispatcherPhoto,
  canEditTourDispatcherBooking,
  canViewTourDispatcherBooking,
  canUploadBookingPassportPhotos,
  canViewBookingPassportPhotos,
  guideMayViewTouristPiiOnTour,
  canResolveTourOverbook,
} from "@/lib/role-policy";
import { formatVnd } from "@/lib/format";
import {
  defaultTourPickupHhMmFromStartEndIso,
  formatYmdWithWeekday,
  normalizeTourPickupHhMm,
  pickupWindowFromStartEndIso,
  tourBusinessTodayYmd,
  tourDateHeaderParts,
} from "@/lib/scheduling";
import { isPastTourBookingEditCutoff, isTourBookingCardLockedForManager } from "@/lib/tour-booking-policies";
import { redactBookingTouristPii } from "@/lib/booking-privacy";

export default async function TourDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ transferFrom?: string }>;
}) {
  const t = await getTranslations("tour");
  const tB = await getTranslations("booking");
  const { getLocale } = await import("next-intl/server");
  const locale = await getLocale();
  const user = await requireAuth();
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const tour = await getTourById(id);
  if (!tour) notFound();

  const [rows, tourExpenses, tourAdvances, advanceEmployees, assignedAsGuide, manifestState, guideSalaryRecords, dispatcherBookingEntry] = await Promise.all([
    listBookingsForTour(id),
    listExpensesForTour(id),
    listTourAdvancesForTour(id),
    listAdvanceEmployeeOptions(),
    isUserAssignedGuideOnTour(id, user.id),
    getTourManifestForTour(id),
    listGuideSalaryRecordsForTour(id, user.id),
    getTourDispatcherBookingEntry(id),
  ]);

  const mayViewTouristPii = guideMayViewTouristPiiOnTour(user.role, assignedAsGuide);
  const rowsForBookingCards = (() => {
    const base = mayViewTouristPii ? rows : rows.map(redactBookingTouristPii);
    if (user.role === "manager") {
      return [...base].sort((a, b) => {
        const aOwn = a.managerId === user.id ? 0 : 1;
        const bOwn = b.managerId === user.id ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        return (a.pickupTime ?? "").localeCompare(b.pickupTime ?? "");
      });
    }
    return base;
  })();

  const isManagerRole = user.role === "manager" || user.role === "chief_manager";
  const [tourTemplateDescription, shopLabel, templateTouristSendCopy, templateDispatcherNote, templateGuideTouristMessage, templateReviewMessage, managerMessageOverride] = await Promise.all([
    getResolvedTourDescriptionForTour(tour),
    getTourTemplateShopLabel(tour.templateId),
    getTourTemplateTouristSendCopy(tour.templateId),
    tour.templateId
      ? getSupabaseAdmin()?.from("tour_templates").select("dispatcher_note_template").eq("id", tour.templateId).maybeSingle().then(r => (r?.data as { dispatcher_note_template?: string | null } | null)?.dispatcher_note_template ?? null)
      : Promise.resolve(null),
    getTourTemplateGuideTouristMessage(tour.templateId),
    getTourTemplateReviewMessage(tour.templateId),
    isManagerRole ? getManagerTourMessageOverride(id, user.id) : Promise.resolve(null),
  ]);

  // Менеджеры: личное override → шаблон; гиды — своё операционное
  const isGuideRole = user.role === "guide" || user.role === "chief_guide";
  const effectiveTouristMessage = isGuideRole
    ? (templateGuideTouristMessage ?? templateTouristSendCopy)
    : (managerMessageOverride ?? templateTouristSendCopy);
  const primaryGuideContact = tour.assignedGuides?.find((g) => g.isPrimary) ?? tour.assignedGuides?.[0] ?? null;
  const bookingDispatcherContactName = dispatcherBookingEntry?.updatedByName ?? null;
  const bookingDispatcherContactPhone = dispatcherBookingEntry?.updatedByPhone ?? null;
  const showBookingCommsChannel =
    (user.role === "booking_dispatcher" &&
      Boolean(primaryGuideContact?.phone && bookingDispatcherContactName)) ||
    ((user.role === "guide" || user.role === "chief_guide") &&
      assignedAsGuide &&
      Boolean(bookingDispatcherContactPhone));
  const isPastTour = tour.date < tourBusinessTodayYmd();
  const canEditPastTour = user.role === "director" || user.role === "chief_manager" || user.role === "dispatcher";
  const readOnlyPast = isPastTour && !canEditPastTour;
  const chiefManagerRestrictedOnTour = user.role === "chief_manager";

  const canAssignGuides = !chiefManagerRestrictedOnTour && canAssignTourGuides(user.role) && !readOnlyPast;
  const leadershipCanAdjustClosedTour = user.role === "director";

  const financeCapable = FINANCE_ROLES.includes(user.role);
  const bookingDispatcherRole = user.role === "booking_dispatcher";
  const guideOnThisTour =
    (user.role === "guide" || user.role === "chief_guide") && assignedAsGuide;
  const myGuideSlot = guideOnThisTour
    ? (tour.assignedGuides?.find((g) => g.guideId === user.id) ?? null)
    : null;
  /** Учёт расходов на туре - не для роли «менеджер» (у них свои действия по броням). */
  const showTourExpensesBlock =
    ((financeCapable && user.role !== "manager" && !chiefManagerRestrictedOnTour) ||
    guideOnThisTour ||
    bookingDispatcherRole ||
    user.role === "dispatcher");
  /** Только диспетчеры (не гид на этом туре): расходы выше списка туристов. */
  const dispatcherExpensesAboveTourists =
    (user.role === "dispatcher" || user.role === "booking_dispatcher") && !guideOnThisTour;
  /** У гида расходы показываются вверху страницы вместе с учётом на туре - не дублируем их ниже. */
  const includeExpensesInTourLowerBlock = !dispatcherExpensesAboveTourists && !guideOnThisTour;
  const expectedPax = rows.reduce((s, b) => s + b.adults + b.children + b.infants, 0);
  /** Посадочные места по броням (как на дашборде): взрослые + дети; младенцы не занимают место. */
  const seatPaxForCapacity = rows.reduce((s, b) => s + b.adults + b.children, 0);
  const infantsTotal = rows.reduce((s, b) => s + b.infants, 0);
  const isPrivateTour = tour.tourType === "private";
  const seatOverflow = seatPaxForCapacity - tour.capacity;
  const freeSeatsRaw = tour.capacity - seatPaxForCapacity;
  /** Частный тур: «свободно» не уходит в «лишние места автобуса» — только до лимита тура. Групповой: сохраняем перебор как отрицательное «свободно». */
  const freeSeatsAtDeparture = isPrivateTour ? Math.max(0, freeSeatsRaw) : freeSeatsRaw;
  const manifestEditMode: TourManifestEditMode = guideOnThisTour ? "full" : "none";

  function managerNoShowRefundForBooking(
    bookingId: string,
    isManagerOwner: boolean,
  ): {
    absenceId: string;
    tourId: string;
    absentPax: number;
    refundVnd: number;
    refundNotRequired: boolean;
    acknowledgedAt: string | null;
    managerRefundNote: string | null;
    managerRefundCertificateUrl: string | null;
  } | null {
    if (user.role !== "manager" || !isManagerOwner || !manifestState.manifest) return null;
    const a = manifestState.absences.find((x) => x.bookingId === bookingId);
    if (!a) return null;
    const absent = a.absentAdults + a.absentChildren + a.absentInfants;
    if (absent <= 0) return null;
    return {
      absenceId: a.id,
      tourId: id,
      absentPax: absent,
      refundVnd: a.refundVnd ?? 0,
      refundNotRequired: a.refundNotRequired ?? false,
      acknowledgedAt: a.managerRefundAcknowledgedAt ?? null,
      managerRefundNote: a.managerRefundNote ?? null,
      managerRefundCertificateUrl: a.managerRefundCertificateUrl ?? null,
    };
  }
  const canAckManifestReview =
    canConfirmExpenseAccountantReview(user.role) && Boolean(manifestState.manifest?.needsAccountantReview);
  const showAccountantManifestStage =
    canEditTourManifestRefundNotes(user.role) && manifestState.manifest != null;
  /** Расходы гида - только назначенные на тур (см. API); дата тура не отключает форму. */
  const guideCanSubmitExpense = guideOnThisTour || bookingDispatcherRole || user.role === "dispatcher";
  const canManageBuses = canManageBusesOnTourPage(user.role, readOnlyPast);
  const canEditDispatcherPhoto =
    canEditBookingDispatcherPhoto(user.role) && !readOnlyPast;
  const canIssueReceipt = RECEIPT_ROLES.includes(user.role) && !readOnlyPast;
  const canAddTourist = canCreateBooking(user.role) && !readOnlyPast;
  const canEditDispatcherBooking = canEditTourDispatcherBooking(user.role);
  const canSeeDispatcherBooking =
    canViewTourDispatcherBooking(user.role) && mayViewTouristPii;
  /** Менеджер может вносить доплату по своим броням и на прошедших турах (API тоже проверяет). */
  const canTakePayments =
    financeCapable && (!readOnlyPast || user.role === "manager");
  const tourStandardPickupHhMm = defaultTourPickupHhMmFromStartEndIso(tour.startAtIso, tour.endAtIso);
  const defaultPickupTime = tourStandardPickupHhMm || (tour.pickupWindow.split("-")[0] || "").trim().slice(0, 5);
  const tourPickupWindowLabel = pickupWindowFromStartEndIso(tour.startAtIso, tour.endAtIso) || tour.pickupWindow;
  const pickupOverrides = rows.filter(
    (b) =>
      defaultPickupTime &&
      normalizeTourPickupHhMm(b.pickupTime) &&
      normalizeTourPickupHhMm(b.pickupTime) !== normalizeTourPickupHhMm(defaultPickupTime),
  );
  const isGuideOrDispatcher =
    user.role === "guide" ||
    user.role === "chief_guide" ||
    user.role === "dispatcher" ||
    user.role === "booking_dispatcher";
  const showPickupOverrideAlert =
    isGuideOrDispatcher && pickupOverrides.length > 0;
  /** Гид: только доплата по долгу, только брони своего тура (см. API). */
  const guideDebtTopupBase =
    (user.role === "guide" || user.role === "chief_guide") && assignedAsGuide;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  /** После 17:00 накануне выезда (Asia/Ho_Chi_Minh) правка/удаление брони недоступны, кроме директора. */
  const bookingPolicyCutoffPassed =
    Boolean(tour.startAtIso && String(tour.startAtIso).trim()) &&
    isPastTourBookingEditCutoff(String(tour.startAtIso), nowMs);
  /** Для кнопки «Отмена» и подсказок: дедлайн по оферте наступил. */
  const bookingTimeLockActive = bookingPolicyCutoffPassed;

  const managerCardLockedByPolicy =
    isTourBookingCardLockedForManager(user.role, tour.startAtIso ?? null, nowMs);

  const bookingCards = rowsForBookingCards.map((b) => {
    const isManagerOwner = user.role !== "manager" ? true : b.managerId === user.id;
    const guideDebtTopupAllowed = guideDebtTopupBase && b.dueVnd > 0;
    /** Менеджер после 17:00 накануне выезда не вносит доплаты и не правит карточку (офис/директор). */
    const canTakePaymentsForBooking =
      (((canTakePayments && isManagerOwner) || guideDebtTopupAllowed) && !managerCardLockedByPolicy);
    const touristEditsAllowedByTime = user.role === "director" || user.role === "chief_manager" || user.role === "dispatcher" || user.role === "chief_guide" || !bookingPolicyCutoffPassed;
    const canEditTouristFields = financeCapable && isManagerOwner && touristEditsAllowedByTime && !readOnlyPast;
    /** Время сбора отдельно от остальных полей: менеджер (своя бронь), главный менеджер, директор — не бухгалтерия. */
    const canEditPickupOverride =
      touristEditsAllowedByTime &&
      !readOnlyPast &&
      (user.role === "director" ||
        user.role === "chief_manager" ||
        (user.role === "manager" && isManagerOwner));
    const showPickupOverrideGuideAlert =
      guideOnThisTour &&
      Boolean(defaultPickupTime) &&
      normalizeTourPickupHhMm(b.pickupTime) !== normalizeTourPickupHhMm(defaultPickupTime);
    const createdAtMs = Date.parse(String(b.createdAt || ""));
    const managerDeleteWindowOk =
      user.role !== "manager" ||
      !Number.isFinite(createdAtMs) ||
      nowMs - createdAtMs <= 90 * 60 * 1000;
    const canDeleteBooking =
      !readOnlyPast &&
      canSoftDeleteBooking(user.role, user.id, b.managerId) &&
      touristEditsAllowedByTime &&
      managerDeleteWindowOk;

    const canIssueReceiptThis =
      canIssueReceipt && (user.role !== "manager" || isManagerOwner);
    const canViewPassportPhotosThis =
      canViewBookingPassportPhotos(user.role, user.id, b.managerId, assignedAsGuide) && mayViewTouristPii;

    /** Перенос / вторая запись: владелец брони или офис (не прошлый тур). */
    const canBookingSalesActions =
      !readOnlyPast &&
      (user.role === "director" ||
        user.role === "chief_manager" ||
        user.role === "dispatcher" ||
        (user.role === "manager" && isManagerOwner));

    return (
      <TourBookingCard
        key={`${b.id}-bcard-v2`}
        booking={b}
        tourId={id}
        tourDateYmd={tour.date}
        todayYmd={tourBusinessTodayYmd()}
        tourStandardPickupHhMm={tourStandardPickupHhMm}
        tourPickupWindowLabel={tourPickupWindowLabel}
        showPickupOverrideGuideAlert={showPickupOverrideGuideAlert}
        canTakePayments={canTakePaymentsForBooking}
        guideDebtTopupOnly={guideDebtTopupAllowed && !financeCapable}
        canIssueReceipt={canIssueReceiptThis}
        canEditTouristFields={canEditTouristFields}
        canEditPickupOverride={canEditPickupOverride}
        canDeleteBooking={canDeleteBooking}
        showWhatsApp={(user.role === "manager" ? isManagerOwner : true) && mayViewTouristPii}
        showPhone={(user.role !== "manager" || isManagerOwner) && mayViewTouristPii}
        canEditDispatcherPhoto={canEditDispatcherPhoto}
        hideDispatcherBookingForViewer={user.role === "manager" || user.role === "chief_manager" || !mayViewTouristPii}
        canViewPassportPhotos={canViewPassportPhotosThis}
        canUploadPassportPhotos={
          canUploadBookingPassportPhotos(user.role, user.id, b.managerId) && mayViewTouristPii
        }
        touristPiiHidden={!mayViewTouristPii}
        managerNoShowRefund={managerNoShowRefundForBooking(b.id, isManagerOwner)}
        viewerRole={user.role}
        receiptPdfLabel={user.role === "manager" && isManagerOwner ? tB("downloadReceipt") : undefined}
        templateTouristSendCopy={effectiveTouristMessage}
        briefingSentAt={b.briefingSentAt}
        bookingTimeLockActive={bookingTimeLockActive}
        transferHref={canBookingSalesActions ? `/bookings/${b.id}/transfer` : null}
        duplicateHref={canBookingSalesActions ? `/bookings/${b.id}/duplicate` : null}
      />
    );
  });

  const tourLocationObjects = tourTemplateDescription
    ? parseTemplateDescription(tourTemplateDescription).locations.filter((l) => Boolean(l.name))
    : [];

  // Гид не должен видеть (даже в данных страницы) расходы офиса по этому туру -
  // фильтруем на сервере, а не только в клиентском компоненте.
  const tourExpensesForViewer =
    user.role === "guide" || user.role === "chief_guide"
      ? tourExpenses.filter((e) => e.category === "guide" && e.createdById === user.id)
      : user.role === "dispatcher" || user.role === "booking_dispatcher"
        ? tourExpenses.filter((e) => e.createdByRole !== "guide" && e.createdByRole !== "chief_guide")
        : tourExpenses;

  const tourExpensesPanel =
    showTourExpensesBlock ? (
      <TourExpensesPanel
        tourId={tour.id}
        tourDateYmd={tour.date}
        initial={tourExpensesForViewer}
        guideCanSubmit={guideCanSubmitExpense}
        guideUserId={user.id}
        canConfirmAccountantReview={canConfirmExpenseAccountantReview(user.role)}
        viewerRole={user.role}
        tourLocations={tourLocationObjects.length > 0 ? tourLocationObjects : undefined}
      />
    ) : null;

  const tourLowerBlock = (
    <div className="mb-4 flex flex-col gap-4">
      {showAccountantManifestStage ? (
        <TourManifestAccountantStage
          tourId={tour.id}
          expectedPax={expectedPax}
          actualPax={manifestState.manifest!.actualPax}
          bookings={rows.map((b) => ({
            id: b.id,
            customerName: b.customerName,
            hotel: b.hotel,
            adults: b.adults,
            children: b.children,
            infants: b.infants,
          }))}
          absences={manifestState.absences}
        />
      ) : null}
      {canAssignGuides ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <h2 className="mb-2 text-base font-semibold text-[var(--text)]">{t("guides")}</h2>
          <TourGuidesPanel tourId={tour.id} embedded />
        </div>
      ) : null}
      {includeExpensesInTourLowerBlock ? tourExpensesPanel : null}
      {canConfirmExpenseAccountantReview(user.role) && !chiefManagerRestrictedOnTour ? (
        <TourAdvancePanel
          tourId={tour.id}
          employees={advanceEmployees}
          advances={tourAdvances}
          expenses={tourExpenses}
          canManage
        />
      ) : null}
      {guideOnThisTour || leadershipCanAdjustClosedTour ? (
        <TourGuideExtraEarningsPanel
          tourId={tour.id}
          shopLabel={shopLabel}
          initialOfficialAccruedVnd={guideSalaryRecords.officialAccruedVnd}
          initialOfficialPaidVnd={guideSalaryRecords.officialPaidVnd}
          initialTotalAccruedVnd={guideSalaryRecords.totalAccruedVnd}
          initialTotalPaidVnd={guideSalaryRecords.totalPaidVnd}
          records={guideSalaryRecords.records}
          viewerRole={user.role}
          tourClosed={tour.status === "completed"}
        />
      ) : null}
      {myGuideSlot ? (
        <GuideTourNoteEdit
          tourGuideRowId={myGuideSlot.rowId}
          initialNote={myGuideSlot.note}
        />
      ) : null}
    </div>
  );

  const tourDateParts = tourDateHeaderParts(tour.date, locale);
  const seatOverbook = isPrivateTour ? seatOverflow > 0 : freeSeatsRaw < 0;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      {readOnlyPast ? (
        <div className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-[13px] leading-snug text-[var(--muted)] shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <span className="font-semibold text-[var(--text)]">{t("pastTourTitle")}</span>{" "}
          {user.role === "manager" ? t("pastTourBodyManager") : t("pastTourBody")}{" "}
          <Link
            href="/dashboard?view=all&cal=list&range=archive"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {t("pastTourArchiveLink")}
          </Link>
          .
        </div>
      ) : null}
      <section className="card mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="section-label mb-2">{t("tourDate")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title mb-0">{tour.name}</h1>
              {tour.descriptionOverride?.trim() ? (
                <span
                  className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-300/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-600/50"
                  title="Описание и локации для этого выезда заданы отдельно от стандартного шаблона."
                >
                  {t("statusCustom")}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <div
                  className="min-w-[8.5rem] rounded-xl border border-[var(--border)]/70 bg-[var(--surface-soft)] px-3 py-2 shadow-[var(--shadow-sm)] ring-1 ring-black/[0.03] dark:border-white/[0.08] dark:bg-[var(--surface-elevated)]/55 dark:ring-white/[0.05]"
                  title="Занятые посадочные места по броням: взрослые + дети. Младенцы отдельно — без места."
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("booked")}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight text-[var(--text)]">{seatPaxForCapacity}</p>
                  {infantsTotal > 0 ? (
                    <p className="mt-1 text-[11px] font-medium leading-snug text-[var(--muted)]">
                      +{infantsTotal} {t("infants")}{" "}
                      <span className="text-[var(--muted2)]">{t("noSeat")}</span>
                    </p>
                  ) : null}
                </div>
                <div
                  className={`min-w-[8.5rem] rounded-xl border px-3 py-2 shadow-[var(--shadow-sm)] ring-1 ${
                    seatOverbook
                      ? "border-rose-300/90 bg-rose-50 ring-rose-200/80 dark:border-rose-600/50 dark:bg-rose-950/40 dark:ring-rose-700/40"
                      : freeSeatsAtDeparture <= 3
                        ? "border-amber-300/90 bg-amber-50 ring-amber-200/80 dark:border-amber-600/45 dark:bg-amber-950/35 dark:ring-amber-700/35"
                        : "border-[var(--border)]/70 bg-[var(--surface-soft)] ring-black/[0.03] dark:border-white/[0.08] dark:bg-[var(--surface-elevated)]/55 dark:ring-white/[0.05]"
                  }`}
                  title="Свободные места: вместимость тура минус взрослые и дети по броням (младенцы не занимают место)."
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">
                    {seatOverbook ? t("statusOverbook") : t("free")}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight text-[var(--text)]">
                    {seatOverbook
                      ? isPrivateTour
                        ? `+${seatOverflow}`
                        : t("overbookN", { n: Math.abs(freeSeatsRaw) })
                      : freeSeatsAtDeparture}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-snug text-[var(--muted)]">
                {t("capacity")} <span className="font-semibold tabular-nums text-[var(--text)]">{tour.capacity}</span>
                {tour.tourType ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-[var(--text)]">
                      {tour.tourType === "private" ? t("private") : t("group")}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="shrink-0 pt-1 flex flex-wrap items-center gap-2">
            {user.role === "accountant" ? (
              <Link
                href={`/tours/${tour.id}/accounting`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
              >
                {t("accountingSummary")}
              </Link>
            ) : null}
            {user.role !== "manager" && mayViewTouristPii ? <CopyGroupButton tourId={tour.id} /> : null}
          </div>
        </div>

        {(tourTemplateDescription || user.role === "chief_guide" || user.role === "director" || user.role === "dispatcher") && tour.templateId ? (
          <div className="mt-4 border-b border-[var(--border)] pb-4">
            <TourDescriptionActions
              tourId={tour.id}
              tourName={tour.name}
              tourDate={formatYmdWithWeekday(tour.date, locale)}
              pickupWindow={tour.pickupWindow}
              description={tourTemplateDescription}
              viewerRole={user.role}
              templateId={tour.templateId}
            />
          </div>
        ) : null}
        {isManagerRole && templateTouristSendCopy ? (
          <div className="mt-3">
            <ManagerTourMessageOverride
              tourId={tour.id}
              initialText={managerMessageOverride}
              templateText={templateTouristSendCopy}
            />
          </div>
        ) : null}
        {tour.templateId && (user.role === "chief_guide" || user.role === "chief_manager" || user.role === "director" || user.role === "dispatcher") ? (
          <div className="mt-4 border-b border-[var(--border)] pb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("touristMessages")}</p>
            <TourMessagesEditPanel
              templateId={tour.templateId}
              initialTouristSendCopy={templateTouristSendCopy}
              initialGuideTouristMessage={templateGuideTouristMessage}
              initialReviewMessage={templateReviewMessage}
              viewerRole={user.role}
            />
          </div>
        ) : null}

        <div className="mt-4">
          {tourDateParts ? (
            <div className="rounded-2xl border border-[var(--border)]/60 bg-[var(--surface-soft)]/90 px-4 py-3 shadow-[var(--shadow-sm)] dark:border-white/[0.07] dark:bg-[var(--surface-elevated)]/55">
              <div className="border-b border-[var(--border)]/40 pb-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted2)]">
                  {tourDateParts.weekdayLong}
                </p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-[var(--text)] sm:text-2xl">
                  {tourDateParts.dmy}
                </p>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-x-6">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted2)]">{t("pickup")}</dt>
                  <dd className="mt-1.5 text-[15px] font-medium tabular-nums leading-snug text-[var(--text)]">
                    {tour.pickupWindow}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted2)]">{t("guide")}</dt>
                  <dd className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--text)]">
                    {tour.assignedGuides && tour.assignedGuides.length > 0 ? (
                      <ul className="space-y-1">
                        {tour.assignedGuides.map((g) => (
                          <li key={g.rowId}>
                            {g.fullName}
                            {g.isPrimary ? (
                              <span className="ml-1.5 text-xs font-normal text-[var(--muted2)]">{t("guidePrimary")}</span>
                            ) : null}
                            {g.isInspection ? (
                              <span className="ml-1.5 text-xs font-normal text-[var(--muted2)]">{t("guideInspection")}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : tour.guideName !== "Unassigned" ? (
                      tour.guideName
                    ) : (
                      <span className="font-medium text-[var(--muted)]">{t("notAssigned")}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-base font-medium tabular-nums text-[var(--text)]">
              {tour.date} · {t("pickup")} {tour.pickupWindow}
            </p>
          )}
        </div>

        {canAddTourist ? (
          <div className="mt-4">
            <Link
              href={`/tours/${tour.id}/new-booking`}
              className="btn-primary group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base"
            >
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xl leading-none transition-transform duration-200 group-hover:rotate-90"
              >
                +
              </span>
              <span>{t("addBooking")}</span>
            </Link>
          </div>
        ) : null}
        {showPickupOverrideAlert ? (
          <div className="mt-3 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2.5 text-sm ring-1 ring-amber-200/85 dark:border-amber-600/60 dark:bg-amber-950/45 dark:ring-amber-700/50">
            <div className="font-semibold text-amber-950 dark:text-amber-100">
              {t("pickupOverrideAlert", { n: pickupOverrides.length })}
            </div>
            <div className="mt-0.5 text-amber-900/90 dark:text-amber-200/90">
              {t("pickupOverrideStandard", { time: defaultPickupTime })}
            </div>
          </div>
        ) : null}
        {guideOnThisTour &&
        tour.accountantGuideSalaryVnd != null &&
        tour.accountantGuideSalaryVnd > 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 py-2.5 text-sm ring-1 ring-emerald-200/85 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:ring-emerald-800/50">
            <div className="font-semibold text-emerald-950 dark:text-emerald-100">{t("guideSalaryFixed")}</div>
            <div className="mt-0.5 tabular-nums text-emerald-900/95 dark:text-emerald-200/95">
              {t("guideSalaryFixedHint", { amount: formatVnd(tour.accountantGuideSalaryVnd) })}
            </div>
          </div>
        ) : null}
        {showBookingCommsChannel ? (
          <div className="mt-3">
            {(user.role === "booking_dispatcher" && primaryGuideContact?.phone) ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 shadow-[var(--shadow-sm)] dark:border-white/[0.08] dark:bg-[var(--surface-elevated)]/60">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("guideOnTour")}</p>
                {primaryGuideContact.fullName ? (
                  <p className="mt-1 text-[15px] font-semibold leading-snug text-[var(--text)]">{primaryGuideContact.fullName}</p>
                ) : null}
                <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <a
                    href={`tel:${primaryGuideContact.phone.replace(/[^\d+]/g, "")}`}
                    className="group inline-flex min-h-[44px] flex-col justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 transition-colors hover:border-[var(--accent)]/35 hover:bg-[var(--surface-elevated)]"
                  >
                    <span className="text-[11px] font-medium text-[var(--muted2)]">{t("phone")}</span>
                    <span className="text-base font-semibold tabular-nums tracking-tight text-[var(--text)] group-hover:text-[var(--accent)]">
                      {primaryGuideContact.phone}
                    </span>
                  </a>
                  <a
                    href={`https://wa.me/${primaryGuideContact.phone.replace(/[^\d]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--surface-soft)]"
                  >
                    Контакты
                  </a>
                </div>
              </div>
            ) : null}
            {(user.role === "guide" || user.role === "chief_guide") && bookingDispatcherContactPhone ? (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 shadow-[var(--shadow-sm)] first:mt-0 dark:border-white/[0.08] dark:bg-[var(--surface-elevated)]/60">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("bookingDispatcher")}</p>
                {bookingDispatcherContactName ? (
                  <p className="mt-1 text-[15px] font-semibold leading-snug text-[var(--text)]">{bookingDispatcherContactName}</p>
                ) : null}
                <a
                  href={`tel:${bookingDispatcherContactPhone.replace(/[^\d+]/g, "")}`}
                  className="mt-3 inline-flex min-h-[44px] w-full flex-col justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 transition-colors hover:border-[var(--accent)]/35 hover:bg-[var(--surface-elevated)] sm:max-w-md"
                >
                  <span className="text-[11px] font-medium text-[var(--muted2)]">{t("phone")}</span>
                  <span className="text-base font-semibold tabular-nums tracking-tight text-[var(--text)]">
                    {bookingDispatcherContactPhone}
                  </span>
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {guideOnThisTour ? (
          <>
            <div className="mt-4">
              <TourManifestPanel
                tourId={tour.id}
                expectedPax={expectedPax}
                bookings={rows.map((b) => ({
                  id: b.id,
                  customerName: b.customerName,
                  hotel: b.hotel,
                  adults: b.adults,
                  children: b.children,
                  infants: b.infants,
                }))}
                initialManifest={manifestState.manifest}
                initialAbsences={manifestState.absences}
                editMode={manifestEditMode}
                canAckReview={canAckManifestReview}
              />
            </div>
            {tourExpensesPanel}
            <TourGuideTransportPanel
              buses={tour.buses ?? []}
              tourId={tour.id}
              viewerRole={user.role}
              canCopyBookingAddresses={mayViewTouristPii}
              showBooking={canSeeDispatcherBooking}
              dispatcherBookingEntry={dispatcherBookingEntry}
              canEditDispatcherBooking={canEditDispatcherBooking}
              templateDispatcherNote={templateDispatcherNote}
            />
          </>
        ) : (
          <>
            {user.role !== "manager" ? (
              <TourBusDriverBlock
                buses={tour.buses ?? []}
                tourId={tour.id}
                viewerRole={user.role}
                canCopyBookingAddresses={mayViewTouristPii}
              />
            ) : null}
            {canSeeDispatcherBooking ? (
              <TourDispatcherBookingPanel
                tourId={tour.id}
                entry={dispatcherBookingEntry}
                canEdit={canEditDispatcherBooking}
                noteTemplate={templateDispatcherNote ?? undefined}
              />
            ) : null}
          </>
        )}
        {canManageBuses ? (
          <DispatcherBusQuickForm tourId={tour.id} viewerRole={user.role} buses={tour.buses ?? []} />
        ) : null}
      </section>

      {guideOnThisTour ? (
        <>
          {tourLowerBlock}
          <div className="mt-4 border-t border-[var(--border)] pt-4" />
          {bookingCards.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("tourists")}</p>
              {bookingCards}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mt-4 border-t border-[var(--border)] pt-4" />
          {dispatcherExpensesAboveTourists ? tourExpensesPanel : null}
          {bookingCards.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("tourists")}</p>
              {bookingCards}
            </div>
          ) : null}
          {tourLowerBlock}
        </>
      )}

      {(user.role === "director" || user.role === "chief_manager" || user.role === "dispatcher") ? (
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <TourDeleteButton tourId={tour.id} tourName={tour.name} />
        </div>
      ) : null}
    </main>
  );
}
