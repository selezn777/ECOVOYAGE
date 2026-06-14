import type { Role } from "./types";

/** Страница /finance (своды и расходы; не путать с оплатой брони на карточке тура) */
export const FINANCE_PAGE_ROLES: Role[] = ["accountant", "chief_manager"];

/** Доступ бухгалтера к разделу «Бухгалтерия» (/accounting) и связанным страницам. Точка входа по умолчанию - /cash. */
export const ACCOUNTING_PANEL_ROLES: Role[] = ["accountant"];
/** Касса: бухгалтер + главный менеджер (только просмотр/поиск для chief_manager). */
export const CASH_VIEW_ROLES: Role[] = ["accountant", "chief_manager"];
export function canEditCashLedger(role: Role): boolean {
  return role === "accountant";
}

/** Расширенный отчёт, выгрузки Excel/JSON (касса, налоговые метки, красный/белый файл). */
export const ACCOUNTING_REPORTS_ACCESS_ROLES: Role[] = ["accountant", "director"];

/** Финансовые отчёты по датам (/finance/reports): директор и главный менеджер. */
export const FINANCE_DATE_REPORT_ROLES: Role[] = ["director", "chief_manager"];

/** Куда вести пользователя после входа и с корня `/` (если сессия есть). */
export function defaultHomePathForRole(role: Role): string {
  if (role === "accountant") return "/accounting";
  if (role === "dispatcher" || role === "booking_dispatcher") return "/dispatcher";
  return "/dashboard";
}

export const DISPATCHER_PAGE_ROLES: Role[] = ["dispatcher", "booking_dispatcher"];

/** Страница /tickets */
export const TICKETS_PAGE_ROLES: Role[] = [
  "director",
  "chief_manager",
  "manager",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

/** Страница /deleted */
export const DELETED_PAGE_ROLES: Role[] = ["director", "chief_manager", "accountant"];

/** See full amounts on tour card + record payments + issue receipts */
export const FINANCE_ROLES: Role[] = ["manager", "chief_manager", "director", "accountant"];

export const PAYMENT_ROLES = FINANCE_ROLES;

/** Доплата по долгу туриста: только свой тур (проверка в API через tour_guides) */
export const GUIDE_BOOKING_TOPUP_ROLES: Role[] = ["guide", "chief_guide"];

export function canRecordGuideBookingDebtTopup(role: Role): boolean {
  return GUIDE_BOOKING_TOPUP_ROLES.includes(role);
}

export const RECEIPT_ROLES = FINANCE_ROLES;

export const BUS_ROLES: Role[] = ["dispatcher", "director"];

/** Назначение автобуса на карточке дашборда и внутри тура (не путать с ролью «менеджер» по продажам). */
export function canAssignTourBuses(role: Role): boolean {
  return BUS_ROLES.includes(role);
}

/**
 * Страница тура: обычно прошедшие туры read-only, но автобус для диспетчера и главного менеджера
 * нужно править и в архиве (как на дашборде).
 */
export function canManageBusesOnTourPage(role: Role, readOnlyPast: boolean): boolean {
  if (!BUS_ROLES.includes(role)) return false;
  if (!readOnlyPast) return true;
  return role === "dispatcher";
}

/** Create new tours */
export const TOUR_CREATE_ROLES: Role[] = ["director", "chief_manager", "chief_guide", "manager"];

/** Create tours from templates */
export const TEMPLATE_TOUR_CREATE_ROLES: Role[] = ["director", "chief_guide"];

/** Register new tourists / sales (гид - только в «режиме менеджера» в профиле) */
export const BOOKING_CREATE_ROLES: Role[] = ["manager", "chief_manager", "chief_guide", "director"];

/** May delete any booking on any tour */
export const BOOKING_DELETE_GLOBAL_ROLES: Role[] = ["director", "chief_manager", "chief_guide"];

/** Добавление новых отелей в справочник (выбор отеля при оформлении брони). */
export const HOTEL_DIRECTORY_MANAGE_ROLES: Role[] = [
  "director",
  "chief_manager",
  "chief_guide",
  "dispatcher",
  "booking_dispatcher",
];

export function canManageHotelDirectory(role: Role): boolean {
  return HOTEL_DIRECTORY_MANAGE_ROLES.includes(role);
}

/** Назначать / менять гидов на туре (главный гид - на любом туре, как в офисе) */
export function canAssignTourGuides(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "chief_guide" || role === "dispatcher";
}

/** See full manager roster (today / planned off) */
export const MANAGER_ROSTER_VIEW_ROLES: Role[] = ["director", "chief_manager", "manager"];

/** See full guide roster */
export const GUIDE_ROSTER_VIEW_ROLES: Role[] = ["director", "chief_guide", "guide", "dispatcher"];

/** Аренда турточек: бухгалтер и главный диспетчер */
export const RENTALS_PAGE_ROLES: Role[] = ["accountant", "dispatcher"];

/** Закрепление менеджера за точкой продаж и сводка по точкам (доходы/расходы/дни) */
export const SALES_POINT_LEADERSHIP_ROLES: Role[] = ["director", "chief_manager", "chief_guide", "accountant"];

export function canAssignManagerSalesPoint(role: Role): boolean {
  return SALES_POINT_LEADERSHIP_ROLES.includes(role);
}

export function canViewSalesPointAnalytics(role: Role): boolean {
  return SALES_POINT_LEADERSHIP_ROLES.includes(role);
}

/** Видят сотрудников с hidden_from_roster и их телефон при roster_contact_private */
export function canSeeHiddenRosterUsers(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "chief_guide" || role === "dispatcher" || role === "accountant";
}

/** Могут менять флаги скрытия в ростере */
export function canEditUserRosterPrivacy(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "chief_guide";
}

/** На каких ролях можно менять флаги скрытия в ростере. */
export function canEditUserRosterPrivacyForTarget(viewerRole: Role, targetRole: Role): boolean {
  if (viewerRole === "director") return true;
  if (viewerRole === "chief_guide") return targetRole === "guide";
  if (viewerRole === "chief_manager") return targetRole === "manager";
  return false;
}

/** День выплаты % менеджерам (календарь компании) */
export const COMPANY_PAYROLL_CALENDAR_EDIT_ROLES: Role[] = ["director", "chief_manager"];

/** Страница /team (ростер менеджеров и/или гидов) */
export const TEAM_PAGE_ROLES: Role[] = [
  "director",
  "chief_manager",
  "manager",
  "chief_guide",
  "guide",
  "accountant",
  "dispatcher",
  "booking_dispatcher",
];

/**
 * Карточка сотрудника `/team/:id` (финансы, выплаты): только руководство и бухгалтер.
 * Остальные роли видят ростер, но не открывают чужую карточку.
 */
export const EMPLOYEE_FINANCE_CARD_ACCESS_ROLES: Role[] = [
  "director",
  "chief_guide",
  "chief_manager",
  "dispatcher",
  "accountant",
];

export function canAccessEmployeeFinanceCard(role: Role): boolean {
  return EMPLOYEE_FINANCE_CARD_ACCESS_ROLES.includes(role);
}

/** Ограничение видимости карточек сотрудников по ролям руководства. */
export function canViewEmployeeFinanceCardForTarget(viewerRole: Role, targetRole: Role): boolean {
  if (viewerRole === "director" || viewerRole === "accountant") return true;
  if (viewerRole === "chief_guide") return targetRole === "guide" || targetRole === "chief_guide";
  if (viewerRole === "chief_manager") return targetRole === "manager";
  if (viewerRole === "dispatcher") return targetRole === "dispatcher" || targetRole === "booking_dispatcher";
  return false;
}

/** Выплата премии из кассы (проводка расхода) - как ручная запись кассы. */
export function canPayEmployeeBonusFromCash(role: Role): boolean {
  return ACCOUNTING_PANEL_ROLES.includes(role);
}

/** Register day off for another manager (≥5 days rule in API) */
export const MANAGER_OFF_ADMIN_ROLES: Role[] = ["director", "chief_manager"];

/** Create team accounts (issue login/password) */
export const TEAM_ACCOUNT_ADMIN_ROLES: Role[] = ["director", "chief_manager", "chief_guide", "dispatcher"];

export function canCreateTeamAccount(role: Role, baseRole?: Role): boolean {
  if (baseRole === "director") return true;
  return TEAM_ACCOUNT_ADMIN_ROLES.includes(role);
}

/** Просмотр/сброс логина-пароля сотрудника внутри команды */
export function canManageTeamCredentials(role: Role, baseRole?: Role): boolean {
  return canCreateTeamAccount(role, baseRole);
}

/** Manage guide profiles from Team page */
export function canManageGuideProfiles(role: Role): boolean {
  return role === "chief_guide" || role === "director" || role === "dispatcher";
}

/** Добавлять отзыв / оценку гиду */
export function canAddGuideReview(role: Role): boolean {
  return role === "director" || role === "chief_guide";
}

/** Добавлять отзыв / оценку менеджеру */
export function canAddManagerReview(role: Role): boolean {
  return role === "director" || role === "chief_manager";
}

/** % от прайса для заработка менеджера в «Мои продажи» (бухгалтер / руководство) */
export function canSetManagerSalesCommission(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "accountant";
}

/** Налоги и взносы + помесячный payroll в карточке сотрудника: только бухгалтер. */
export function canManageEmployeePayrollTaxes(role: Role): boolean {
  return role === "accountant";
}

/** Оперативное решение перебора мест на туре: увеличить места или создать дубль тура. */
export function canResolveTourOverbook(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "chief_guide" || role === "dispatcher";
}

export function canCreateBooking(role: Role): boolean {
  return BOOKING_CREATE_ROLES.includes(role);
}

export function canCreateTour(role: Role): boolean {
  return TOUR_CREATE_ROLES.includes(role);
}

export function canCreateTemplateTour(role: Role): boolean {
  return TEMPLATE_TOUR_CREATE_ROLES.includes(role);
}

export function canEditTemplateDescription(role: Role): boolean {
  return role === "director" || role === "chief_guide" || role === "dispatcher" || role === "chief_manager";
}

/** May choose any manager for booking ownership */
export function canAssignBookingManager(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "manager" || role === "chief_guide";
}

export function canSoftDeleteBooking(role: Role, sessionUserId: string, bookingManagerId: string): boolean {
  if (BOOKING_DELETE_GLOBAL_ROLES.includes(role)) return true;
  if (role === "manager" && sessionUserId === bookingManagerId) return true;
  return false;
}

/** Подтверждение спорных расходов после проверки */
export const EXPENSE_REVIEW_ROLES: Role[] = ["director", "chief_manager", "accountant"];

export function canConfirmExpenseAccountantReview(role: Role): boolean {
  return EXPENSE_REVIEW_ROLES.includes(role);
}

/** Расходы гида в день тура: гид/диспетчер + офис с правом проверки расходов (ввод с карточки тура) */
export function canSubmitGuideTourExpenses(role: Role): boolean {
  return (
    role === "guide" ||
    role === "chief_guide" ||
    role === "dispatcher" ||
    role === "booking_dispatcher" ||
    canConfirmExpenseAccountantReview(role)
  );
}

/** Второй этап учёта на туре: записано / поехало / комментарии по возвратам */
export function canEditTourManifestRefundNotes(role: Role): boolean {
  return FINANCE_PAGE_ROLES.includes(role);
}

/** Фото брони на туре (диспетчер; директор/главный - при необходимости) */
export function canEditBookingDispatcherPhoto(role: Role): boolean {
  return role === "dispatcher" || role === "booking_dispatcher" || role === "director" || role === "chief_manager";
}

/** Комментарий/фото букинга на уровне тура - строго роль dispatcher. */
export function canEditTourDispatcherBooking(role: Role): boolean {
  return role === "dispatcher" || role === "booking_dispatcher";
}

export function canViewTourDispatcherBooking(role: Role): boolean {
  return role === "dispatcher" || role === "booking_dispatcher" || role === "guide" || role === "chief_guide";
}

/** Персональные данные туристов на странице тура: гид видит только на назначенных ему выездах. */
export function guideMayViewTouristPiiOnTour(role: Role, assignedAsGuideOnTour: boolean): boolean {
  if (role !== "guide" && role !== "chief_guide") return true;
  return assignedAsGuideOnTour;
}

/**
 * Просмотр фото паспортов по брони.
 * - Руководство и офис видят все брони.
 * - Менеджер видит только свои брони.
 * - Гиды и прочие роли не видят фото паспортов.
 */
export function canViewBookingPassportPhotos(
  role: Role,
  sessionId?: string,
  bookingManagerId?: string,
  assignedAsGuideOnTour: boolean = false
): boolean {
  if (role === "director" || role === "chief_manager") {
    return true;
  }
  if (role === "manager") {
    return Boolean(sessionId && bookingManagerId && sessionId === bookingManagerId);
  }
  if ((role === "guide" || role === "chief_guide") && assignedAsGuideOnTour) {
    return true;
  }
  return false;
}

/**
 * Загрузка фото паспортов (отдельно от правки полей брони - можно даже при блокировке правок).
 * Менеджер - только своя бронь; остальные роли по политике.
 */
export function canUploadBookingPassportPhotos(role: Role, sessionId: string, bookingManagerId: string): boolean {
  if (role === "director" || role === "chief_manager" || role === "chief_guide") return true;
  if (role === "dispatcher" || role === "booking_dispatcher") return true;
  if (role === "accountant") return true;
  if (role === "manager" && sessionId === bookingManagerId) return true;
  return false;
}
