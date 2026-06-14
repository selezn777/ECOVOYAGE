export type Role =
  | "director"
  | "chief_manager"
  | "manager"
  | "chief_guide"
  | "guide"
  | "accountant"
  | "dispatcher"
  | "booking_dispatcher";

export interface SessionUser {
  id: string;
  fullName: string;
  /** Логин пользователя из public.users */
  login?: string;
  /** Эффективная роль для прав и UI (с учётом «режима менеджера» у гида) */
  role: Role;
  /** Роль в БД; в cookie сессии хранится именно она */
  baseRole: Role;
  /** Гид/ст. гид временно работает как менеджер */
  managerMode?: boolean;
  /** Публичная ссылка на фото (http/https), для аватарки в шапке */
  avatarUrl?: string | null;
}

export type TourStatus = "active" | "completed" | "deleted";

export interface TourBusAssignment {
  /** id строки bus_assignments (нужен для правки/удаления) */
  id?: string;
  busNumber: string;
  seats: number | null;
  /** Водитель, телефон, прочее - вносит диспетчер */
  comment: string | null;
  langNoteEn?: string | null;
  langNoteVn?: string | null;
  /** Кто внёс запись (обычно диспетчер) */
  assignedByName?: string | null;
}

export interface TourDispatcherBookingEntry {
  tourId: string;
  note: string | null;
  photoUrl: string | null;
  updatedAt: string | null;
  updatedByName?: string | null;
  updatedByPhone?: string | null;
}

/** Assigned guide on a tour (from tour_guides) */
export interface TourGuideSlot {
  rowId: string;
  guideId: string;
  fullName: string;
  role?: Role;
  phone?: string | null;
  note?: string | null;
  isPrimary: boolean;
  isInspection?: boolean;
}

export interface Tour {
  id: string;
  name: string;
  date: string;
  /** Full start timestamp (ISO), used for time-lock rules */
  startAtIso: string;
  /** Full end timestamp (ISO) */
  endAtIso: string;
  pickupWindow: string;
  /** Групповой или частный тур (из tours.tour_type). */
  tourType?: "group" | "private";
  capacity: number;
  /** Посадочные места по броням: взрослые + дети (без младенцев). */
  booked: number;
  /** Мест удержано активными намерениями (не завершёнными бронированиями). */
  heldSeats?: number;
  /** Все туристы по броням: взрослые + дети + младенцы (для «сколько человек на выезде»). */
  paxHeadcount?: number;
  guideName: string;
  status: TourStatus;
  /** Human-readable summary for lists */
  busInfo?: string;
  /** Сколько автобусов назначено (на дашборде без массива buses) */
  busCount?: number;
  buses?: TourBusAssignment[];
  /** All guides on this tour (detail page) */
  assignedGuides?: TourGuideSlot[];
  /** Диспетчер оставил запись/фото на этот тур */
  hasDispatcherBooking?: boolean;
  /** tour_templates.id, если тур создан из шаблона */
  templateId?: string | null;
  /** Полное описание/локации для этого выезда; если задано — перекрывает текст шаблона */
  descriptionOverride?: string | null;
  /** Внутренний рейтинг тура (1-5), ставят директор / ст. менеджер / ст. гид */
  internalRating?: number | null;
  internalRatingNote?: string | null;
  /** Депозит из кассы гиду на тур (₫), только учёт бухгалтерии */
  guideCashDepositVnd?: number | null;
  /** Зарплата гиду по туру (₫), фиксирует бухгалтер */
  accountantGuideSalaryVnd?: number | null;
  /** JSON сетки «таблица зарплат» для бухгалтера */
  accountantSalarySheetJson?: string | null;
  /** Бухгалтер: доплаты от гида в офис зафиксированы */
  guideSettlementGuidePaidOfficeAt?: string | null;
  guideSettlementGuidePaidOfficeProofUrl?: string | null;
  /** Бухгалтер: выплата гиду из офиса зафиксирована */
  guideSettlementOfficePaidGuideAt?: string | null;
  guideSettlementOfficePaidGuideProofUrl?: string | null;
  /** Заметка бухгалтера к блоку расходов водитель/диспетчер/букинг */
  accountantDispatchExpensesNote?: string | null;
  /** Бухгалтер отметил блок расходов водитель/диспетчер/букинг как проверенный */
  accountantDispatchExpensesReviewedAt?: string | null;

  /**
   * Дашборд гида: агрегат по строкам расходов с категорией «Гид» (ввод с карточки тура).
   * Заполняется на сервере только для назначенных гиду туров.
   */
  guideExpenseLineCount?: number;
  /** Строки «Гид», по которым бухгалтерия ещё не проставила проверку */
  guideExpenseOpenLineCount?: number;
  /**
   * Тур закрыт в учёте по расходам гида: тур завершён, есть хотя бы одна строка «Гид»,
   * и по всем таким строкам есть accountant_reviewed_at.
   */
  guideExpenseAccountingClosed?: boolean;
}

/** Team / roster row (today + upcoming planned off) */
export interface RosterUser {
  id: string;
  fullName: string;
  role: Role;
  offToday: boolean;
  upcomingDaysOff: string[];
  /** Номер для WhatsApp (поле users.phone) */
  whatsappPhone: string | null;
  /** Скрыт из списка для обычных ролей (видят руководство и бухгалтерия) */
  hiddenFromRoster?: boolean;
  /** Телефон скрыт в списке для обычных ролей */
  rosterContactPrivate?: boolean;
  avatarUrl?: string | null;
  /** Менеджер: число броней (не удалённых) - «продажи» */
  salesCount?: number | null;
  /** Гид: число назначенных туров (уникальных выездов) */
  guideTripsCount?: number | null;
  /** Гид: средняя оценка отзывов руководства */
  guideRatingAvg?: number | null;
  guideReviewsCount?: number | null;
  /** Менеджер: средняя оценка отзывов руководства */
  managerRatingAvg?: number | null;
  managerReviewsCount?: number | null;
  /** % от суммы по прайсу для «Мои продажи»; null = 12% по умолчанию */
  managerSalesCommissionPercent?: number | null;
  /** Точка продаж (турточка); назначают директор / главный менеджер */
  rentalPointId?: string | null;
  rentalPointName?: string | null;
}

/** Строка отзыва для списка в команде */
export interface StaffReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  authorName: string;
}

export interface GuideCandidate {
  guideId: string;
  fullName: string;
  role: Role;
  status: "available" | "day_off" | "busy";
  otherTourName?: string;
  avatarUrl?: string | null;
  tripCount?: number;
}

export type TourFeedMode = "all" | "my_tours" | "my_sales" | "my_trips";

export interface FinanceSnapshot {
  incomeVnd: number;
  expenseVnd: number;
  netVnd: number;
}

/** Финансовый период: календарный месяц (UTC-границы) или всё время */
export type FinancePeriod = { kind: "all" } | { kind: "month"; year: number; month: number };

/** Валюта операции. Все расчёты в системе ведём в VND. */
export type MoneyCurrency = "VND" | "USD";

/** Единые статусы денег (никаких других). */
export type FinanceStatus = "created" | "pending" | "approved" | "paid" | "rejected";

/** 6 типов операций (ядро модели). */
export type FinanceOperationKind =
  | "tour_income"
  | "tour_expense"
  | "advance_issue"
  | "advance_return"
  | "accrual"
  | "payout";

/**
 * Единый формат финансовой операции.
 * - Всегда есть amountVnd (основная сумма для отчётов).
 * - amount + currency + fxRateToVnd нужны для корректной поддержки USD.
 */
export interface FinanceOperation {
  id: string;
  kind: FinanceOperationKind;
  status: FinanceStatus;
  createdAt: string;

  /** Привязки (не все операции обязаны иметь tourId). */
  tourId?: string | null;
  bookingId?: string | null;
  employeeId?: string | null;

  /** Кто создал операцию (пользователь/роль), если известно. */
  createdById?: string | null;
  createdByRole?: Role | null;

  /** Деньги */
  currency: MoneyCurrency;
  amount: number;
  fxRateToVnd: number;
  amountVnd: number;

  /** Для UX */
  title?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
}

export interface PaymentRowBrief {
  id: string;
  amountVnd: number;
  kind: string;
  createdAt: string;
  bookingId: string;
  customerName?: string | null;
  onlineCode?: string | null;
  managerName?: string | null;
  tourName?: string | null;
  tourDate?: string | null;
}

export interface TourOption {
  id: string;
  label: string;
  /** Location names from the tour template, for the expense form picker */
  locations?: string[];
}

export interface TicketTypeSummary {
  ticketType: "vinwonders" | "teatro_do";
  soldQty: number;
  officeProfitVnd: number;
}

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface Booking {
  id: string;
  tourId: string;
  /** Selling manager (for permissions / audit) */
  managerId: string;
  managerName: string;
  /** Creation timestamp (ISO) used for correction window */
  createdAt: string;
  hotel: string;
  /** Адрес отеля из справочника (если выбран при оформлении брони). */
  hotelAddress?: string;
  mapsUrl: string;
  room: string;
  customerName: string;
  phone: string;
  /** Второй номер (E.164), если указан при брони. */
  phoneAlt?: string;
  /** Ник в Telegram без @ (если указан при брони). */
  telegramUsername?: string;
  pickupTime: string;
  adults: number;
  children: number;
  infants: number;
  /** Sale total from booking_prices (VND) */
  totalVnd: number;
  /**
   * Разбивка по строкам чека (из booking_prices.person_label) — в т.ч. доп. услуги.
   * Видна гиду на назначенном туре, чтобы видеть нюансы по продаже.
   */
  priceLines?: Array<{ label: string; amountVnd: number }>;
  /** Sum of payments with kind deposit */
  depositVnd: number;
  /** Sum of payments with kind topup */
  topupVnd: number;
  /** Оплата, принятая в кассе офиса по брони (kind office_cash), не у менеджера */
  officeCashVnd?: number;
  /**
   * Зачтено к оплате по брони: депозит + доплаты, уже сданные в кассу офиса + office_cash − возвраты.
   * Для колонок на бухгалтерии: «У менеджера» ≈ depositVnd; «В кассе офиса» ≈ officeCashVnd + (topupVnd − pendingGuideTopupVnd).
   */
  paidVnd: number;
  dueVnd: number;
  paymentStatus: PaymentStatus;
  note?: string;
  /** Фото брони с объекта (диспетчер) - ссылка http(s), видно на туре */
  dispatcherBookingPhotoUrl?: string | null;
  /** URL фото паспортов (сжатые JPEG на клиенте), для отелей/экскурсий */
  passportPhotoUrls?: string[];
  /** Опционально: код онлайн-продажи, если есть в БД */
  onlineCode?: string;
  lastTopupByName?: string;
  lastTopupByRole?: string;
  /** Доплаты, внесённые гидом, ещё не подтверждены в кассе (не входят в paidVnd / долг) */
  pendingGuideTopupVnd?: number;
  pendingGuideTopups?: Array<{ id: string; amountVnd: number; createdAt: string }>;
  /** ISO timestamp: когда приветственное сообщение было отправлено туристу. null = ещё не отправляли. */
  briefingSentAt?: string | null;
}

/** Учёт гида на туре: люди + склад (ром, кола, вода, дождевики). */
export interface TourManifest {
  tourId: string;
  actualPax: number;
  submittedAt: string;
  submittedById: string | null;
  submittedByName: string | null;
  comment: string | null;
  /** Со склада, бут. / шт. */
  rumBottles: number;
  colaBottles: number;
  waterBottles: number;
  raincoatsQty: number;
  /** Правки после дня тура - пометка до подтверждения в финансах */
  needsAccountantReview: boolean;
}

/** Невыход с карточки брони (отель и контакт уже в брони). */
export interface TourManifestAbsence {
  id: string;
  tourId: string;
  bookingId: string;
  absentAdults: number;
  absentChildren: number;
  absentInfants: number;
  note: string | null;
  /** Менеджер: возврата нет (подтверждено) */
  refundNotRequired?: boolean;
  /** Менеджер: сумма возврата в ₫; пересчёт стоимости в booking_prices */
  refundVnd?: number;
  /** Менеджер обработал условия возврата (нет возврата или сумма) */
  managerRefundAcknowledgedAt?: string | null;
  /** Бухгалтерия: как выполнен возврат денег по этой неявке */
  refundExecutionNote?: string | null;
  /** Менеджер: пояснение при возврате по неявке */
  managerRefundNote?: string | null;
  /** Менеджер: фото справки от туриста */
  managerRefundCertificateUrl?: string | null;
  /** Бухгалтер: approved | rejected */
  accountantAbsenceDecision?: "approved" | "rejected" | null;
  accountantAbsenceComment?: string | null;
  accountantTraveledAdults?: number | null;
  accountantTraveledChildren?: number | null;
  accountantTraveledInfants?: number | null;
  accountantAbsenceReviewedAt?: string | null;
}

export interface DeletedBookingItem {
  id: string;
  entityId: string;
  customerName: string;
  tourId: string;
  restoreUntil: string;
}

export type ExpenseCategory = "guide" | "bus" | "salary" | "other";

/** Расход по туру (таблица expenses). */
export interface TourExpense {
  id: string;
  tourId: string;
  category: ExpenseCategory;
  amountVnd: number;
  description: string;
  createdAt: string;
  /** Кто внёс расход в БД (для правки гида). */
  createdById?: string | null;
  /** Роль автора расхода (для ролевой фильтрации в UI). */
  createdByRole?: Role | null;
  createdByName?: string | null;
  /** Подтверждён бухгалтерией (после этого гид не может редактировать/удалять). */
  accountantReviewedAt?: string | null;
  accountantReviewedBy?: string | null;
  /** pending - ждёт проверки, approved - подтверждён, recheck - отправлен на перепроверку с замечанием. */
  accountantReviewState?: "pending" | "approved" | "recheck";
  accountantReviewNote?: string | null;
  /** Устаревшие записи: пометка до автоматической/фоновой обработки */
  pendingAccountantReview: boolean;
  attachmentUrl?: string | null;
}

export type AdvanceKind = "issue" | "return";

export interface TourAdvanceRecord {
  id: string;
  tourId: string;
  employeeId: string;
  employeeName: string | null;
  kind: AdvanceKind;
  amountVnd: number;
  currency: MoneyCurrency;
  fxRateToVnd: number;
  status: FinanceStatus;
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface EmployeeFinanceOperationRow {
  id: string;
  createdAt: string;
  kind: "advance_issue" | "advance_return" | "expense" | "accrual" | "payout";
  tourId: string | null;
  tourName: string | null;
  currency: MoneyCurrency;
  amount: number;
  fxRateToVnd: number;
  amountVnd: number;
  status: FinanceStatus;
  note: string | null;
}

/** Период для блока «наличные / сдача в кассу» в карточке менеджера */
export type ManagerCashPeriodPreset = "day" | "week" | "month" | "all";

/** Принято по броням менеджера vs сдача в центральную кассу (сдачи с тура) */
export interface ManagerCashOnHandSnapshot {
  preset: ManagerCashPeriodPreset;
  periodLabelRu: string;
  rangeFromYmd: string;
  rangeToInclusiveYmd: string;
  /** Платежи deposit/topup − refund по броням менеджера за выбранный период */
  receivedInPeriodVnd: number;
  /** Сумма сдач в кассу (tour_office_cash_handovers, роль менеджер) за период */
  handedToOfficeInPeriodVnd: number;
  /** Оценка «на руках / к сдаче»: за всё время принято − за всё время сдано */
  outstandingAllTimeVnd: number;
  allTimeReceivedVnd: number;
  allTimeHandedVnd: number;
}

export type GuideShopPeriodPreset = "day" | "month" | "all";

export interface GuideShopByDateRow {
  ymd: string;
  accruedVnd: number;
  paidVnd: number;
  recordsCount: number;
}

/** Официальный магазин по гиду: динамика за период + сводка за всё время */
export interface GuideShopSnapshot {
  preset: GuideShopPeriodPreset;
  periodLabelRu: string;
  rangeFromYmd: string;
  rangeToInclusiveYmd: string;
  accruedInPeriodVnd: number;
  paidInPeriodVnd: number;
  allTimeAccruedVnd: number;
  allTimePaidVnd: number;
  allTimeRecordsCount: number;
  byDateRows: GuideShopByDateRow[];
}

/** Оценка для блока «Полный расчёт» у менеджера: сначала сдача наличных по броням, затем выплата % и билетов. */
export interface ManagerFullSettlementSnapshot {
  salesCommissionPercent: number;
  /** Прайс по броням × % (всё время) */
  commissionFromBookingsVnd: number;
  /** Прибыль с билетов (всё время), без % */
  ticketProfitAllTimeVnd: number;
  /** Брони × % + билеты */
  commissionTotalEstimateVnd: number;
  /** То же, что «к сдаче» по броням за всё время */
  cashToHandInFromBookingsVnd: number;
  /** Оценка: заработок − наличные к сдаче (после сдачи кассы знак показывает, кто кому) */
  netAfterBookingsCashVsCommissionVnd: number;
}

export interface ManagerModePerformanceSnapshot {
  monthBookingsCount: number;
  monthPaxClosed: number;
  allBookingsCount: number;
  allPaxClosed: number;
}

export interface EmployeeFinanceCardData {
  employeeId: string;
  employeeName: string;
  employeeRole: Role;
  managerModeEnabled?: boolean;
  /** % от прайса для менеджера (только в карточке, не в общем списке). */
  managerSalesCommissionPercent?: number | null;

  /** База для взносов/налоговых подсказок (может быть ниже фактической выплаты) */
  payrollContributionBaseVnd?: number | null;
  payrollPersonalIncomeTaxPercent?: number | null;
  payrollPensionExtraPercent?: number | null;
  payrollSocialEmployeePercent?: number | null;
  payrollSocialEmployerPercent?: number | null;
  vietnamMrotZone?: "I" | "II" | "III" | "IV" | null;

  /** Фиксация в учёте: НДФЛ удержан (отдельно от указания % в карточке). */
  payrollIncomeTaxWithheldAt?: string | null;
  /** Фиксация: налоговая декларация по сотруднику подана. */
  payrollTaxDeclarationFiledAt?: string | null;

  /** Только для manager / chief_manager: наличные по броням и сдача в кассу */
  managerCashOnHand?: ManagerCashOnHandSnapshot | null;

  /** Только для guide / chief_guide: магазин по периодам и датам. */
  guideShopSnapshot?: GuideShopSnapshot | null;

  /** Только manager / chief_manager: оценка полного расчёта по броням и % */
  managerFullSettlement?: ManagerFullSettlementSnapshot | null;
  /** Для гида в режиме менеджера: результативность именно как менеджера продаж. */
  managerModePerformance?: ManagerModePerformanceSnapshot | null;

  receivedVnd: number;
  spentVnd: number;
  shouldReturnVnd: number;
  accruedVnd: number;
  paidVnd: number;
  shouldReceiveVnd: number;

  operations: EmployeeFinanceOperationRow[];
  pendingSalaryRecords: { id: string; tourId: string; tourName: string | null; amountVnd: number; createdAt: string }[];

  /** С 1-го числа текущего месяца: выходные и активность (брони/туры). */
  monthStats: EmployeeMonthStats;
  /** Последние движения кассы, где фигурирует сотрудник (платёж, ручная запись, сдача, выплата). */
  cashPreviewRows: EmployeeCashPreviewRow[];

  /** Сумма начисленных премий, ещё не выплаченных из кассы */
  bonusPendingVnd: number;
  /** Сумма премий, уже выплаченных из кассы */
  bonusPaidVnd: number;
  bonusRecords: EmployeeBonusRecordRow[];

  /** Включён ли учёт помесячной зарплаты в карточке (офисные сотрудники). */
  monthlyPayrollTrackingEnabled: boolean;
  monthlyPayrollRecords: EmployeeMonthlyPayrollRecordRow[];
}

/** Краткая строка для блока «касса по сотруднику» в карточке. */
export type EmployeeCashPreviewRow = {
  at: string;
  direction: "in" | "out";
  amountVnd: number;
  summary: string;
};

/** Премия: начисление в карточке; доход сотрудника - после выплаты из кассы. */
export type EmployeeBonusRecordRow = {
  id: string;
  amountVnd: number;
  note: string | null;
  accruedAt: string;
  plannedPayDate: string | null;
  paidAt: string | null;
};

/** Строка регистра ежемесячной зарплаты (помесячная ведомость). */
export type EmployeeMonthlyPayrollRecordRow = {
  id: string;
  /** Период YYYY-MM */
  periodYm: string;
  calculationDate: string | null;
  grossSalaryVnd: number;
  personalIncomeTaxVnd: number;
  socialInsuranceEmployeeVnd: number;
  socialInsuranceEmployerVnd: number;
  netSalaryVnd: number;
  paidDate: string | null;
  note: string | null;
  updatedAt: string;
};

export type EmployeeMonthStats = {
  daysOffMonthToDate: number;
  /** Менеджер: число операций по платежам за месяц; гид: число туров с датой старта в месяце. */
  activityMonthToDate: number;
};

export interface CashLedgerRow {
  id: string;
  at: string;
  direction: "in" | "out";
  amountVnd: number;
  kind:
    | "tour_income"
    | "refund"
    | "advance_issue"
    | "advance_return"
    | "payout"
    | "manual_in"
    | "manual_out"
    | "office_cash_handover";
  /** Внутренний id сущности (платёж, подотчёт и т.д.) - не для показа в UI */
  sourceId: string;
  /** Кратко для таблицы: кто, тур, зачем */
  summary: string;
  note: string | null;
  /** Публичный URL вложения (напр. чек по ручной операции) */
  attachmentUrl?: string | null;
  /** Кто зафиксировал операцию в системе (платёж, ручная запись, сдача и т.д.) - для журнала и поиска */
  recordedByName?: string | null;
  /** Нижний регистр: поиск по движениям без утечки скрытых деталей в `note` */
  searchText: string;
  /** Ссылка на тур (бухгалтерия) */
  linkedTourId?: string | null;
  /** Только ручной журнал: контур отражения (см. фиксацию бухгалтером). */
  manualLedgerBucket?: "standard" | "instrumented" | null;
  manualLedgerBucketOkAt?: string | null;
  /** Только ручной журнал: блок «контур» показываем только для банковских переводов. */
  manualLedgerPaymentKind?: "cash" | "bank_transfer" | null;
  /** Права на исправление ручной операции в кассе (вычисляются на сервере по роли/времени). */
  manualCanEdit?: boolean;
  manualCanDelete?: boolean;
}

/** Канал сдачи в кассу (валюта / банк), справочник настраивается на странице «Касса». */
export interface OfficeCashHandoverChannelDef {
  id: string;
  slug: string | null;
  label: string;
  sortOrder: number;
  isSystem: boolean;
  expectsUsdAmount: boolean;
}

/** Сдача наличных менеджером/гидом в центральную кассу (фиксирует бухгалтер на туре). */
export interface TourOfficeCashHandoverRow {
  id: string;
  tourId: string;
  holderRole: "manager" | "guide";
  employeeId: string;
  employeeName: string;
  amountVnd: number;
  amountUsd: number | null;
  channelId: string | null;
  channelLabel: string;
  expectsUsdAmount: boolean;
  note: string | null;
  receivedAt: string;
  recordedByName: string | null;
  /** Если сдача привязана к брони - обновлены платежи в кассу. */
  bookingId: string | null;
  bookingGuestLabel: string | null;
}

/** Строка отчёта сверки кассы: сдача с тура за период. */
export interface CashReconciliationHandoverLine {
  id: string;
  receivedAt: string;
  tourId: string;
  tourLine: string;
  holderRole: "manager" | "guide";
  employeeName: string;
  channelId: string | null;
  channelLabel: string;
  amountVnd: number;
  amountUsd: number | null;
  note: string | null;
}

/** Итог по одному каналу сдачи за период (для таблицы отчёта). */
export interface CashReconciliationHandoverChannelTotalsRow {
  channelId: string;
  label: string;
  count: number;
  sumVnd: number;
  sumUsd: number;
}

/** Ручные движения в иностранной валюте за период (для контроля неучтённой валюты). */
export interface CashReconciliationManualForeignRow {
  key: string;
  direction: "in" | "out";
  paymentKind: "cash" | "bank_transfer" | "unknown";
  currencyCode: string;
  count: number;
  sumVnd: number;
  sumForeign: number;
}

/** Итог ручных проводок за период по одной валюте (эквивалент в ₫ + натуральные суммы для не-VND). */
export interface CashReconciliationManualCurrencyTotalRow {
  currencyCode: string;
  inCount: number;
  outCount: number;
  sumInVnd: number;
  sumOutVnd: number;
  sumInForeign: number;
  sumOutForeign: number;
}

/** Сводка за период для вечерней сверки наличности и поступлений. */
export interface CashReconciliationReport {
  fromYmd: string;
  toYmd: string;
  handoverLines: CashReconciliationHandoverLine[];
  handoverTotalsRows: CashReconciliationHandoverChannelTotalsRow[];
  manualForeignRows: CashReconciliationManualForeignRow[];
  /** Ручной журнал кассы за период: разбивка по валютам (₫ — из поля суммы; FX — из суммы или из валюты×курс). */
  manualLedgerCurrencyTotals: CashReconciliationManualCurrencyTotalRow[];
  paymentsIncomeVnd: number;
  paymentsRefundVnd: number;
  manualInVnd: number;
  manualOutVnd: number;
  advanceIssueVnd: number;
  advanceReturnVnd: number;
  /** Депозиты, дата записи в периоде (обычно на руках у менеджера). */
  paymentsDepositVnd: number;
  /** Оплата в кассу офиса по брони (kind office_cash), дата записи в периоде. */
  paymentsOfficeCashVnd: number;
  /** Доплаты (создание строки в периоде). */
  paymentsTopupCreatedVnd: number;
  /** Доплаты гида с датой «принято в кассу» в периоде. */
  paymentsTopupRemittedInPeriodVnd: number;
  /** Из доплат за период ещё без сдачи в кассу офиса. */
  paymentsTopupPendingFromPeriodVnd: number;
  /** Снимок: суммарный долг по всем неудалённым броням. */
  snapshotTotalBookingDueVnd: number;
  /** Снимок: доплаты гида без подтверждения в кассе (всего). */
  snapshotPendingGuideTopupVnd: number;
}

export type GuideSalaryRecordStatus = "pending" | "paid";

export interface GuideSalaryRecord {
  id: string;
  tourId: string;
  guideId: string;
  amountVnd: number;
  kind?: string | null;
  status: GuideSalaryRecordStatus;
  createdAt: string;
  paidAt?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
  outsideTotalVnd?: number | null;
  outsideDriverPercent?: number | null;
  outsideDriverFixedVnd?: number | null;
  /** Оф. магазин: сколько гид отдал водителю (при «деньги у гида»). */
  shopDriverPaidByGuideVnd?: number | null;
  /** Бухгалтер: итог гиду после сверки. */
  shopAccountantGuideVnd?: number | null;
  /** Бухгалтер: доля офиса в сумме магазина (в кассу при «деньги у гида»). */
  shopAccountantOfficeVnd?: number | null;
  /** Бухгалтер зафиксировал разбивку - строка попадает в кассу (офис). */
  shopAccountantConfirmedAt?: string | null;
}

/** Турточка / аренда */
export interface RentalPointSummary {
  id: string;
  name: string;
  addressNote: string | null;
  photoUrl: string | null;
  monthlyRentVnd: number;
  rentDueDayOfMonth: number;
  nextRentPaymentDate: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface RentalPointExpenseRow {
  id: string;
  amountVnd: number;
  title: string;
  expenseDate: string;
  note: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalNote?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
}

export interface RentalPointClosedDayRow {
  id: string;
  closedDate: string;
  note: string | null;
}

export interface RentalPointRentPaymentRow {
  id: string;
  amountVnd: number;
  paidOn: string;
  note: string | null;
  createdAt: string;
}

export interface RentalPointDetail extends RentalPointSummary {
  expenses: RentalPointExpenseRow[];
  closedDays: RentalPointClosedDayRow[];
  rentPayments: RentalPointRentPaymentRow[];
  expensesTotalVnd: number;
  closedDaysCount: number;
}

export interface ManagerSalesPointStatus {
  pointId: string | null;
  pointName: string | null;
  openedToday: boolean;
  /** Менеджер явно выбрал режим работы сегодня (запись в manager_point_openings). */
  setToday: boolean;
  todayWorkMode: "point" | "promo" | "online";
}

export interface TouristSearchRow {
  bookingId: string;
  tourId: string;
  tourName: string;
  tourDate: string;
  customerName: string;
  hotel: string;
  phone: string;
  telegramUsername?: string | null;
  onlineCode?: string;
  managerId: string;
  managerName: string;
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  paymentStatus: PaymentStatus;
  adults: number;
  children: number;
  infants: number;
}

/** Одна бронь в истории туриста */
export interface TouristHistoryRow {
  bookingId: string;
  tourId: string;
  tourName: string;
  tourDate: string | null;
  adults: number;
  children: number;
  infants: number;
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  paymentStatus: PaymentStatus;
  managerId: string;
  managerName: string;
}

/** Профиль туриста: базовая инфа + история всех броней по телефону */
export interface TouristProfileData {
  entryBookingId: string;
  customerName: string;
  phone: string;
  hotel: string;
  onlineCode: string | null;
  telegramUsername: string | null;
  managerId: string;
  managerName: string;
  adults: number;
  children: number;
  infants: number;
  bookings: TouristHistoryRow[];
}

/** Сводка по менеджеру для ростера chief_manager на странице /finance */
export interface ManagerRosterFinanceSummary {
  id: string;
  fullName: string;
  commissionPercent: number;
  rentalPointName: string | null;
  bookingsMonth: number;
  bookingsAllTime: number;
  receivedAllTimeVnd: number;
  handedAllTimeVnd: number;
  outstandingVnd: number;
  commissionEstimateVnd: number;
}

/** Аналитика продаж менеджера: сегменты + пиковые часы */
export interface ManagerBookingAnalytics {
  totalBookings: number;
  segments: { single: number; couple: number; family: number; group: number };
  peakHours: { hour: number; count: number }[];
}
