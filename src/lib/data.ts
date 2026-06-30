import { bookings as mockBookings, tours as mockTours } from "@/lib/mock-data";
import type {
  Booking,
  DeletedBookingItem,
  FinancePeriod,
  FinanceSnapshot,
  GuideCandidate,
  PaymentRowBrief,
  PaymentStatus,
  GuideSalaryRecord,
  Role,
  RosterUser,
  StaffReviewRow,
  TicketTypeSummary,
  Tour,
  TourStatus,
  TourBusAssignment,
  TourDispatcherBookingEntry,
  EmployeeBonusRecordRow,
  EmployeeMonthlyPayrollRecordRow,
  EmployeeCashPreviewRow,
  EmployeeFinanceCardData,
  EmployeeFinanceOperationRow,
  EmployeeMonthStats,
  ManagerCashOnHandSnapshot,
  ManagerFullSettlementSnapshot,
  ManagerCashPeriodPreset,
  GuideShopSnapshot,
  GuideShopPeriodPreset,
  CashLedgerRow,
  TourOfficeCashHandoverRow,
  CashReconciliationReport,
  CashReconciliationHandoverLine,
  TourAdvanceRecord,
  TourExpense,
  TourFeedMode,
  TourGuideSlot,
  TourManifest,
  TourManifestAbsence,
  TourOption,
  OfficeCashHandoverChannelDef,
  RentalPointSummary,
  RentalPointDetail,
  RentalPointExpenseRow,
  RentalPointClosedDayRow,
  RentalPointRentPaymentRow,
  ManagerSalesPointStatus,
  ManagerRosterFinanceSummary,
  ManagerBookingAnalytics,
  TouristHistoryRow,
  TouristProfileData,
} from "@/lib/types";
import { canSeeHiddenRosterUsers } from "@/lib/role-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRangeUtcIso } from "@/lib/finance-period";
import { parseTemplateDescription } from "@/lib/tour-description-share";
import {
  hhmmFromIsoInTourTz,
  legacyUtcDefaultPickupBugHhMm,
  localDateString,
  parseYmdLocal,
  pickupWindowFromStartEndIso,
  tourBusinessTodayYmd,
  tourCalendarDateFromStartAtIso,
  formatYmdWithWeekdayRu,
  inclusiveCalendarDaysBetween,
  weekDayKeysLocal,
  ymdFromIsoInTimeZone,
} from "@/lib/scheduling";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SalesDayAssignment } from "@/lib/sales-point-status-ui";
import { backfillMissingOnlineCodes } from "@/lib/online-code";
import { ACCT_BOOKING_PREFIX, partitionDispatcherExpenses } from "@/lib/tour-expense-partition";
import {
  computeTourGuideSettlementBreakdown,
  guideOwesOfficeVnd,
  officeOwesGuideVnd,
  type TourGuideSettlementBreakdown,
} from "@/lib/tour-guide-settlement";
import { isShopMoneyWithGuideSettlement, parseShopExtraNote } from "@/lib/shop-salary-note-parse";
import {
  buildGuideSalaryCashLedgerSummary,
  canViewConfidentialGuidePayoutDetail,
  guideSalaryPayoutIsOutsideShopConfidential,
  guideSalaryPayoutIsOfficialShop,
} from "@/lib/cash-ledger-privacy";
import { formatUsd } from "@/lib/format";
import { ACCOUNTANT_TOUR_SALARY_KIND } from "@/lib/sync-accountant-tour-salary-record";

const EXPENSES_LIST_SELECT_FULL =
  "id,tour_id,category,amount_vnd,description,created_at,pending_accountant_review,attachment_url,created_by,accountant_reviewed_at,accountant_reviewed_by,accountant_review_state,accountant_review_note";
const EXPENSES_LIST_SELECT_LEGACY =
  "id,tour_id,category,amount_vnd,description,created_at,attachment_url,created_by,accountant_reviewed_at,accountant_reviewed_by";
const EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT =
  "id,tour_id,category,amount_vnd,description,created_at,pending_accountant_review,attachment_url,created_by,accountant_review_state,accountant_review_note";
const EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT_LEGACY =
  "id,tour_id,category,amount_vnd,description,created_at,attachment_url,created_by";
/** Старые БД: нет attachment_url и прочих полей */
const EXPENSES_LIST_SELECT_MINIMAL = "id,tour_id,category,amount_vnd,description,created_at,created_by";

type ExpenseListRow = {
  id: string;
  tour_id: string;
  category: string;
  amount_vnd: number | string;
  description: string;
  created_at: string;
  pending_accountant_review?: boolean | null;
  attachment_url: string | null;
  created_by?: string | null;
  accountant_reviewed_at?: string | null;
  accountant_reviewed_by?: string | null;
  accountant_review_state?: string | null;
  accountant_review_note?: string | null;
};

type DbTour = {
  id: string;
  human_id: number;
  name: string;
  start_at: string;
  end_at: string;
  /** tours.tour_type: 'group' | 'private' */
  tour_type?: string | null;
  capacity: number;
  status: "active" | "completed" | "deleted";
  template_id?: string | null;
  internal_rating?: number | string | null;
  internal_rating_note?: string | null;
  guide_cash_deposit_vnd?: number | string | null;
  accountant_guide_salary_vnd?: number | string | null;
  /** text или jsonb из PostgREST - иногда приходит объект */
  accountant_salary_sheet_json?: string | Record<string, unknown> | null;
  guide_settlement_guide_paid_office_at?: string | null;
  guide_settlement_guide_paid_office_proof_url?: string | null;
  guide_settlement_office_paid_guide_at?: string | null;
  guide_settlement_office_paid_guide_proof_url?: string | null;
  accountant_dispatch_expenses_reviewed_at?: string | null;
  accountant_dispatch_expenses_note?: string | null;
  description_override?: string | null;
};

type DbBooking = {
  id: string;
  tour_id: string;
  manager_id: string;
  customer_name: string;
  hotel_name: string;
  hotel_address?: string | null;
  hotel_maps_url: string | null;
  room: string | null;
  phone_e164: string;
  phone_alt_e164?: string | null;
  pickup_time: string | null;
  created_at: string;
  adults: number;
  children: number;
  infants: number;
  note: string | null;
  dispatcher_booking_photo_url?: string | null;
  passport_photo_urls?: unknown;
  online_code?: string | null;
  users: { full_name: string }[] | null;
};

function startDateOnly(startAt: string): string {
  return tourCalendarDateFromStartAtIso(startAt) || new Date(startAt).toISOString().slice(0, 10);
}

/**
 * Только если в тексте ошибки явно фигурирует колонка и признак «нет в схеме».
 * Нельзя матчить одно слово `column` - иначе PostgREST/Postgres подставляет его в чужие ошибки,
 * срабатывает fallback-select без accountant_guide_salary_vnd, и зарплата в UI всегда пустая.
 */
function tourErrMissingColumn(message: unknown, columnNeedle: string): boolean {
  const m = String(message ?? "").toLowerCase();
  const needle = columnNeedle.toLowerCase();
  if (!m.includes(needle)) return false;
  return (
    m.includes("does not exist") ||
    m.includes("undefined column") ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    m.includes("not present in")
  );
}

type TourBookingIntentAggRow = {
  tour_id: string;
  adults?: number;
  children?: number;
  infants?: number;
  editing_booking_id?: string | null;
};

/** Черновики мест: обычный intent суммируется целиком; при правке брони — только дельта к уже учтённой брони. */
function applyTourBookingIntentsToTourMaps(
  bookedByTour: Map<string, number>,
  headcountByTour: Map<string, number>,
  intents: TourBookingIntentAggRow[],
  bookingSeatById: Map<string, { seats: number; heads: number; tour_id: string }>,
  heldByTour?: Map<string, number>,
) {
  for (const r of intents) {
    const tourId = r.tour_id;
    const a = Math.max(0, Number(r.adults ?? 0));
    const c = Math.max(0, Number(r.children ?? 0));
    const i = Math.max(0, Number(r.infants ?? 0));
    const intentSeats = a + c;
    const intentHeads = a + c + i;
    const editRaw = r.editing_booking_id != null ? String(r.editing_booking_id).trim() : "";
    if (editRaw) {
      const prev = bookingSeatById.get(editRaw);
      if (prev && prev.tour_id === tourId) {
        bookedByTour.set(tourId, (bookedByTour.get(tourId) || 0) + intentSeats - prev.seats);
        headcountByTour.set(tourId, (headcountByTour.get(tourId) || 0) + intentHeads - prev.heads);
      }
    } else {
      bookedByTour.set(tourId, (bookedByTour.get(tourId) || 0) + intentSeats);
      headcountByTour.set(tourId, (headcountByTour.get(tourId) || 0) + intentHeads);
      if (heldByTour) heldByTour.set(tourId, (heldByTour.get(tourId) || 0) + intentSeats);
    }
  }
}

/** Номер автобуса и комментарий (водитель, телефон, встреча) - с переносами строк, без склейки в «(…)». */
function formatTourBusInfoSummary(
  rows: readonly { plate: string; comment: string | null }[],
): string | undefined {
  if (rows.length === 0) return undefined;
  const blocks = rows.map(({ plate, comment }) => {
    const c = (comment ?? "").trim();
    return c ? `${plate}\n${c}` : plate;
  });
  return blocks.join("\n\n────────\n\n");
}

function mapTourRow(
  row: DbTour,
  guideName: string,
  booked: number,
  busMeta?: {
    busInfo?: string;
    busCount?: number;
    buses?: TourBusAssignment[];
    assignedGuides?: TourGuideSlot[];
    paxHeadcount?: number;
    heldSeats?: number;
    hasDispatcherBooking?: boolean;
  },
): Tour {
  const pickupWindow = pickupWindowFromStartEndIso(row.start_at, row.end_at);
  const tourTypeRaw = String(row.tour_type ?? "").toLowerCase();
  const tourType: Tour["tourType"] =
    tourTypeRaw === "private" ? "private" : tourTypeRaw === "group" ? "group" : undefined;
  const busCount =
    busMeta?.busCount != null
      ? busMeta.busCount
      : busMeta?.buses != null
        ? busMeta.buses.length
        : busMeta?.busInfo?.trim()
          ? 1
          : 0;
  return {
    id: row.id,
    name: row.name,
    date: startDateOnly(row.start_at),
    startAtIso: row.start_at,
    endAtIso: row.end_at,
    pickupWindow,
    ...(tourType ? { tourType } : {}),
    capacity: row.capacity,
    booked,
    ...(busMeta?.heldSeats != null && busMeta.heldSeats > 0 ? { heldSeats: busMeta.heldSeats } : {}),
    ...(busMeta?.paxHeadcount != null ? { paxHeadcount: busMeta.paxHeadcount } : {}),
    guideName: guideName || "Unassigned",
    status: row.status,
    busInfo: busMeta?.busInfo,
    busCount,
    buses: busMeta?.buses,
    assignedGuides: busMeta?.assignedGuides,
    hasDispatcherBooking: busMeta?.hasDispatcherBooking ?? false,
    templateId: row.template_id ?? null,
    ...(row.description_override != null && String(row.description_override).trim()
      ? { descriptionOverride: String(row.description_override) }
      : {}),
    internalRating:
      row.internal_rating != null && row.internal_rating !== ""
        ? Math.round(Number(row.internal_rating) * 10) / 10
        : null,
    internalRatingNote: row.internal_rating_note?.trim() || null,
    guideCashDepositVnd: (() => {
      if (row.guide_cash_deposit_vnd == null || row.guide_cash_deposit_vnd === "") return null;
      const v = Math.max(0, Math.round(Number(row.guide_cash_deposit_vnd)));
      return v > 0 ? v : null;
    })(),
    accountantGuideSalaryVnd: (() => {
      if (row.accountant_guide_salary_vnd == null || row.accountant_guide_salary_vnd === "") return null;
      const v = Math.max(0, Math.round(Number(row.accountant_guide_salary_vnd)));
      return v > 0 ? v : null;
    })(),
    accountantSalarySheetJson: (() => {
      const raw = row.accountant_salary_sheet_json;
      if (raw == null) return null;
      if (typeof raw === "string") {
        const t = raw.trim();
        return t ? t : null;
      }
      if (typeof raw === "object") {
        try {
          const s = JSON.stringify(raw);
          return s && s !== "{}" ? s : null;
        } catch {
          return null;
        }
      }
      return null;
    })(),
    guideSettlementGuidePaidOfficeAt:
      typeof row.guide_settlement_guide_paid_office_at === "string" && row.guide_settlement_guide_paid_office_at.trim()
        ? row.guide_settlement_guide_paid_office_at.trim()
        : null,
    guideSettlementGuidePaidOfficeProofUrl:
      typeof row.guide_settlement_guide_paid_office_proof_url === "string" &&
      row.guide_settlement_guide_paid_office_proof_url.trim()
        ? row.guide_settlement_guide_paid_office_proof_url.trim()
        : null,
    guideSettlementOfficePaidGuideAt:
      typeof row.guide_settlement_office_paid_guide_at === "string" && row.guide_settlement_office_paid_guide_at.trim()
        ? row.guide_settlement_office_paid_guide_at.trim()
        : null,
    guideSettlementOfficePaidGuideProofUrl:
      typeof row.guide_settlement_office_paid_guide_proof_url === "string" &&
      row.guide_settlement_office_paid_guide_proof_url.trim()
        ? row.guide_settlement_office_paid_guide_proof_url.trim()
        : null,
    accountantDispatchExpensesNote:
      typeof row.accountant_dispatch_expenses_note === "string" && row.accountant_dispatch_expenses_note.trim()
        ? row.accountant_dispatch_expenses_note.trim()
        : null,
    accountantDispatchExpensesReviewedAt:
      typeof row.accountant_dispatch_expenses_reviewed_at === "string" && row.accountant_dispatch_expenses_reviewed_at.trim()
        ? row.accountant_dispatch_expenses_reviewed_at.trim()
        : null,
  };
}

function embedFullName(users: unknown): string {
  if (!users) return "?";
  if (Array.isArray(users)) return (users[0] as { full_name?: string })?.full_name ?? "?";
  if (typeof users === "object" && users !== null && "full_name" in users) {
    return String((users as { full_name: string }).full_name);
  }
  return "?";
}

function embedPhone(users: unknown): string | null {
  if (!users) return null;
  const pick = Array.isArray(users) ? (users[0] as { phone?: string | null } | undefined) : (users as { phone?: string | null });
  const p = pick?.phone;
  return p != null && String(p).trim() ? String(p).trim() : null;
}

/** Supabase FK к users может вернуть объект или массив - для имени менеджера брони. */
function bookingManagerFullName(users: unknown): string {
  if (!users) return "-";
  if (Array.isArray(users)) {
    const n = (users[0] as { full_name?: string } | undefined)?.full_name?.trim();
    return n || "-";
  }
  if (typeof users === "object" && users !== null && "full_name" in users) {
    const n = String((users as { full_name: string }).full_name).trim();
    return n || "-";
  }
  return "-";
}

function paymentStatusFrom(totalVnd: number, paidVnd: number): PaymentStatus {
  if (totalVnd <= 0) return "paid";
  if (paidVnd <= 0) return "unpaid";
  if (paidVnd >= totalVnd) return "paid";
  return "partial";
}

type PayAgg = { deposit: number; topup: number; refund: number };

/** Строка платежа для агрегации (topup без remitted_to_cash_at не считается в оплату в кассу). */
export type PaymentRowAgg = {
  booking_id: string;
  amount_vnd: number;
  kind: string;
  id?: string;
  created_at?: string;
  /** null = ещё не сдано гидом в кассу; если колонка не выбрана (undefined) - считаем принято (старые клиенты) */
  remitted_to_cash_at?: string | null;
};

export type PayAggEx = {
  deposit: number;
  topupRemitted: number;
  topupPending: number;
  refund: number;
  /** Оплата в кассе офиса по брони (не у менеджера) */
  officeCash: number;
  pendingTopups: Array<{ id: string; amountVnd: number; createdAt: string }>;
};

export function emptyPayAggEx(): PayAggEx {
  return { deposit: 0, topupRemitted: 0, topupPending: 0, refund: 0, officeCash: 0, pendingTopups: [] };
}

/** Учтённая оплата по брони (долг, чек, сдача гидом): депозит + доплаты в кассе − возвраты + офисная касса. */
export function paidOfficialFromAgg(agg: PayAggEx): number {
  return agg.deposit + agg.topupRemitted + agg.officeCash - agg.refund;
}

export function topupRemittedToCash(p: PaymentRowAgg): boolean {
  if (p.kind !== "topup") return true;
  if (p.remitted_to_cash_at === undefined) return true;
  return p.remitted_to_cash_at != null && String(p.remitted_to_cash_at).trim() !== "";
}

export function aggregatePaymentsEx(paymentRows: PaymentRowAgg[]): Map<string, PayAggEx> {
  const map = new Map<string, PayAggEx>();
  for (const p of paymentRows) {
    const cur = map.get(p.booking_id) || emptyPayAggEx();
    const amt = Number(p.amount_vnd) || 0;
    if (p.kind === "refund") {
      cur.refund += amt;
    } else if (p.kind === "deposit") {
      cur.deposit += amt;
    } else if (p.kind === "topup") {
      if (topupRemittedToCash(p)) {
        cur.topupRemitted += amt;
      } else {
        cur.topupPending += amt;
        if (p.id) {
          cur.pendingTopups.push({
            id: p.id,
            amountVnd: amt,
            createdAt: p.created_at || "",
          });
        }
      }
    } else if (p.kind === "office_cash") {
      cur.officeCash += amt;
    } else {
      cur.topupRemitted += amt;
    }
    map.set(p.booking_id, cur);
  }
  return map;
}

function aggregatePayments(
  paymentRows: { booking_id: string; amount_vnd: number; kind: string }[],
): Map<string, PayAgg> {
  const map = new Map<string, PayAgg>();
  for (const p of paymentRows) {
    const cur = map.get(p.booking_id) || { deposit: 0, topup: 0, refund: 0 };
    const amt = Number(p.amount_vnd) || 0;
    if (p.kind === "refund") cur.refund += amt;
    else if (p.kind === "deposit") cur.deposit += amt;
    else cur.topup += amt;
    map.set(p.booking_id, cur);
  }
  return map;
}

const GUIDE_EXPENSE_PENDING_DESC_RE = /в обработке \(дата чека/i;

type GuideExpenseAgg = { total: number; open: number };

function accumulateGuideExpenseAgg(m: Map<string, GuideExpenseAgg>, tourId: string, row: { open: boolean }): void {
  const tid = String(tourId);
  let rec = m.get(tid);
  if (!rec) {
    rec = { total: 0, open: 0 };
    m.set(tid, rec);
  }
  rec.total += 1;
  if (row.open) rec.open += 1;
}

/**
 * Для карточек гида на дашборде: сколько строк «Гид» по туру и сколько ещё без отметки бухгалтерии.
 * Не тянет роли авторов - считаем все category=guide (как в учёте на карточке тура).
 */
async function loadGuideExpenseAggForTourIds(tourIds: string[]): Promise<Map<string, GuideExpenseAgg>> {
  const out = new Map<string, GuideExpenseAgg>();
  const supabase = getSupabaseAdmin();
  if (!supabase || tourIds.length === 0) return out;

  const uniq = Array.from(new Set(tourIds.map((id) => String(id))));
  const selectsToTry = [
    "tour_id,category,pending_accountant_review,accountant_reviewed_at,description",
    "tour_id,category,accountant_reviewed_at,description",
    "tour_id,category,pending_accountant_review,description",
    "tour_id,category,description",
  ];

  for (const select of selectsToTry) {
    const res = await supabase.from("expenses").select(select).eq("category", "guide").in("tour_id", uniq);
    if (res.error) continue;
    const hasReviewedAt = select.includes("accountant_reviewed_at");
    const hasPending = select.includes("pending_accountant_review");
    for (const raw of (res.data as unknown as Record<string, unknown>[] | null) || []) {
      const tourId = String(raw.tour_id ?? "");
      if (!tourId) continue;
      const pendingFlag = hasPending ? Boolean(raw.pending_accountant_review) : false;
      const reviewedAt = hasReviewedAt && typeof raw.accountant_reviewed_at === "string" ? raw.accountant_reviewed_at : null;
      const desc = typeof raw.description === "string" ? raw.description : "";
      const open = hasReviewedAt
        ? !reviewedAt?.trim()
        : pendingFlag || GUIDE_EXPENSE_PENDING_DESC_RE.test(desc);
      accumulateGuideExpenseAgg(out, tourId, { open });
    }
    return out;
  }

  return out;
}

export async function mergeGuideDashboardExpenseBadges(tours: Tour[], userId: string, role: Role): Promise<Tour[]> {
  if (role !== "guide" && role !== "chief_guide") return tours;
  const supabase = getSupabaseAdmin();
  if (!supabase || tours.length === 0) return tours;

  const { data: assignRows } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", userId);
  const assigned = new Set((assignRows || []).map((r: { tour_id: string }) => String(r.tour_id)));
  if (assigned.size === 0) return tours;

  const onPage = tours.filter((t) => assigned.has(t.id));
  if (onPage.length === 0) return tours;

  const tourIds = onPage.map((t) => t.id);
  const expAgg = await loadGuideExpenseAggForTourIds(tourIds);

  const extraById = new Map<
    string,
    { guideExpenseLineCount: number; guideExpenseOpenLineCount: number; guideExpenseAccountingClosed: boolean }
  >();

  for (const t of onPage) {
    const tid = t.id;
    const q = expAgg.get(tid) || { total: 0, open: 0 };
    const guideExpenseAccountingClosed =
      t.status === "completed" && q.total > 0 && q.open === 0;
    extraById.set(tid, {
      guideExpenseLineCount: q.total,
      guideExpenseOpenLineCount: q.open,
      guideExpenseAccountingClosed,
    });
  }

  return tours.map((t) => {
    const x = extraById.get(t.id);
    if (!x) return t;
    return {
      ...t,
      guideExpenseLineCount: x.guideExpenseLineCount,
      guideExpenseOpenLineCount: x.guideExpenseOpenLineCount,
      guideExpenseAccountingClosed: x.guideExpenseAccountingClosed,
    };
  });
}

export async function listTours(opts?: { demoMode?: boolean }): Promise<Tour[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...mockTours].sort((a, b) => a.booked - b.booked);
  }

  const tourSelectWithDescOv =
    "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,description_override";
  const tourSelectNoDescOv = "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id";

  const demo = opts?.demoMode ?? false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demoFilter = (q: any) => demo ? q.eq("is_demo", true) : q.not("is_demo", "eq", true);

  const [{ data: tourRows, error: tourErr }, { data: bookingRows }] = await Promise.all([
    (async () => {
      const a = await demoFilter(
        supabase.from("tours").select(tourSelectWithDescOv).is("deleted_at", null).neq("status", "deleted")
      ).order("start_at", { ascending: true });
      if (a.error && tourErrMissingColumn(a.error.message, "description_override")) {
        return demoFilter(
          supabase.from("tours").select(tourSelectNoDescOv).is("deleted_at", null).neq("status", "deleted")
        ).order("start_at", { ascending: true });
      }
      return a;
    })(),
    supabase.from("bookings").select("id,tour_id,adults,children,infants").is("deleted_at", null),
  ]);

  const intentPrimary = await supabase
    .from("tour_booking_intents")
    .select("tour_id,adults,children,infants,expires_at,editing_booking_id")
    .gt("expires_at", new Date().toISOString());
  let intentRowsSafe: TourBookingIntentAggRow[] = [];
  if (intentPrimary.error && tourErrMissingColumn(intentPrimary.error.message, "editing_booking_id")) {
    const intentFb = await supabase
      .from("tour_booking_intents")
      .select("tour_id,adults,children,infants,expires_at")
      .gt("expires_at", new Date().toISOString());
    intentRowsSafe =
      intentFb.error || !intentFb.data ? [] : (intentFb.data as TourBookingIntentAggRow[]);
  } else if (intentPrimary.error || !intentPrimary.data) {
    intentRowsSafe = [];
  } else {
    intentRowsSafe = intentPrimary.data as TourBookingIntentAggRow[];
  }

  if (tourErr || !tourRows) {
    return [...mockTours].sort((a, b) => a.booked - b.booked);
  }

  const tourIds = (tourRows as DbTour[]).map((r) => r.id);
  const { data: busRowsAll } =
    tourIds.length > 0
      ? await supabase.from("bus_assignments").select("tour_id,id,bus_number,seats,comment").in("tour_id", tourIds)
      : { data: [] as { tour_id: string; id: string; bus_number: string; seats: number | null; comment: string | null }[] | null };
  const { data: guideRowsAll } =
    tourIds.length > 0
      ? await supabase
          .from("tour_guides")
          .select("tour_id,is_primary,users(full_name)")
          .in("tour_id", tourIds)
      : { data: [] as { tour_id: string; is_primary: boolean; users: unknown }[] | null };

  const { data: dispBookingRows } =
    tourIds.length > 0
      ? await supabase.from("tour_dispatcher_bookings").select("tour_id").in("tour_id", tourIds)
      : { data: [] as { tour_id: string }[] | null };
  const dispBookingSet = new Set<string>((dispBookingRows || []).map((r) => (r as { tour_id: string }).tour_id));

  const bookedByTour = new Map<string, number>();
  const headcountByTour = new Map<string, number>();
  const bookingSeatById = new Map<string, { seats: number; heads: number; tour_id: string }>();
  (bookingRows || []).forEach((b) => {
    const row = b as {
      id: string;
      tour_id: string;
      adults?: number;
      children?: number;
      infants?: number;
    };
    /** Посадочные места: взрослые + дети (младенцы не занимают место). */
    const pax =
      Math.max(0, Number(row.adults ?? 0)) + Math.max(0, Number(row.children ?? 0));
    bookedByTour.set(row.tour_id, (bookedByTour.get(row.tour_id) || 0) + pax);
    const heads =
      Math.max(0, Number(row.adults ?? 0)) +
      Math.max(0, Number(row.children ?? 0)) +
      Math.max(0, Number(row.infants ?? 0));
    headcountByTour.set(row.tour_id, (headcountByTour.get(row.tour_id) || 0) + heads);
    bookingSeatById.set(row.id, { seats: pax, heads, tour_id: row.tour_id });
  });
  const heldByTour = new Map<string, number>();
  applyTourBookingIntentsToTourMaps(bookedByTour, headcountByTour, intentRowsSafe, bookingSeatById, heldByTour);

  type GuidePick = { tour_id: string; is_primary: boolean; users: unknown };
  const byTour = new Map<string, GuidePick[]>();
  for (const g of (guideRowsAll as GuidePick[] | null) || []) {
    const arr = byTour.get(g.tour_id) || [];
    arr.push(g);
    byTour.set(g.tour_id, arr);
  }

  const guideByTour = new Map<string, string>();
  for (const [tid, rows] of byTour) {
    const primary = rows.find((r) => r.is_primary);
    const pick = primary ?? rows[0];
    const name = embedFullName(pick?.users);
    guideByTour.set(tid, name === "?" ? "Unassigned" : name);
  }

  const busesByTour = new Map<
    string,
    { id: string; bus_number: string; seats: number | null; comment: string | null }[]
  >();
  for (const b of (busRowsAll as { tour_id: string; id: string; bus_number: string; seats: number | null; comment: string | null }[] | null) || []) {
    const arr = busesByTour.get(b.tour_id) || [];
    arr.push(b);
    busesByTour.set(b.tour_id, arr);
  }

  return (tourRows as DbTour[])
    .map((row) => {
      const rawBuses = busesByTour.get(row.id) || [];
      const buses: TourBusAssignment[] = rawBuses.map((x) => ({
        id: x.id,
        busNumber: x.bus_number,
        seats: x.seats,
        comment: x.comment,
      }));
      const busInfo =
        rawBuses.length > 0
          ? formatTourBusInfoSummary(rawBuses.map((x) => ({ plate: x.bus_number, comment: x.comment })))
          : undefined;
      return mapTourRow(row, guideByTour.get(row.id) || "Unassigned", bookedByTour.get(row.id) || 0, {
        busInfo,
        busCount: rawBuses.length,
        buses,
        paxHeadcount: headcountByTour.get(row.id) || 0,
        heldSeats: heldByTour.get(row.id) || 0,
        hasDispatcherBooking: dispBookingSet.has(row.id),
      });
    })
    .sort((a, b) => a.booked - b.booked);
}

export type TourTemplateFilterOption = { id: string; name: string };

/** Активные шаблоны туров - для фильтра на дашборде */
export async function listActiveTourTemplateOptions(): Promise<TourTemplateFilterOption[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase.from("tour_templates").select("id,name").eq("active", true).order("name");
  if (error || !data) return [];
  return (data as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Лента туров на дашборде:
 * - «Все туры», «Мои туры» — из БД: сегодня и будущее (без прошлых дат).
 * - На странице дашборда список по умолчанию тоже только ≥ сегодня; прошлое — чип «Архив», календарь или «Мои выезды».
 * - «Мои продажи» — все даты, где у менеджера есть брони.
 * - «Мои выезды» — сегодня и прошлые назначения (расходы); вместе с «Мои туры» подтягиваются и будущие назначения.
 */
export async function listToursForDashboard(userId: string, mode: TourFeedMode, demoMode = false): Promise<Tour[]> {
  const all = await listTours({ demoMode });
  const today = tourBusinessTodayYmd();
  if (mode === "all") return all.filter((t) => t.date >= today);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (mode === "my_tours") return [];
    if (mode === "my_trips") return [];
    if (mode === "my_sales") {
      return all.filter((t) => mockBookings.some((b) => b.tourId === t.id && b.managerId === userId));
    }
    return all.filter((t) => t.date >= today);
  }

  if (mode === "my_tours") {
    const { data } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", userId);
    const ids = new Set((data || []).map((r: { tour_id: string }) => r.tour_id));
    return all.filter((t) => ids.has(t.id) && t.date >= today);
  }

  if (mode === "my_trips") {
    const { data } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", userId);
    const ids = new Set((data || []).map((r: { tour_id: string }) => r.tour_id));
    return all.filter((t) => ids.has(t.id) && t.date <= today);
  }

  const { data: bookRows } = await supabase
    .from("bookings")
    .select("tour_id")
    .eq("manager_id", userId)
    .is("deleted_at", null);
  const ids = new Set((bookRows || []).map((r: { tour_id: string }) => r.tour_id));
  return all.filter((t) => ids.has(t.id));
}

const DEFAULT_MANAGER_SALES_COMMISSION = 12;

export type ManagerDashboardSalesStats = {
  salesCommissionPercent: number;
  dayBookingsCount: number;
  daySalesTotalVnd: number;
  monthBookingsCount: number;
  monthSalesTotalVnd: number;
  allTimeBookingsCount: number;
  allTimeSalesTotalVnd: number;
  ticketDayProfitVnd: number;
  ticketWeekProfitVnd: number;
  ticketMonthProfitVnd: number;
  ticketAllTimeProfitVnd: number;

  dayPayrollNetAccruedVnd: number;
  monthPayrollNetAccruedVnd: number;
  allPayrollNetAccruedVnd: number;
  dayPayrollNetPaidVnd: number;
  monthPayrollNetPaidVnd: number;
  allPayrollNetPaidVnd: number;
  dayBonusAccruedVnd: number;
  monthBonusAccruedVnd: number;
  allBonusAccruedVnd: number;
  dayBonusPaidVnd: number;
  monthBonusPaidVnd: number;
  allBonusPaidVnd: number;

  /** Денежный поток менеджера: принято по броням / сдано в офис (календарный день или месяц). */
  dayManagerCashReceivedVnd: number;
  dayManagerCashHandedVnd: number;
  monthManagerCashReceivedVnd: number;
  monthManagerCashHandedVnd: number;
  allManagerCashReceivedVnd: number;
  allManagerCashHandedVnd: number;
  /** max(0, всё время принято − всё время сдано) */
  managerCashOutstandingAllTimeVnd: number;
};

function emptyManagerDashboardSalesStats(percent: number): ManagerDashboardSalesStats {
  return {
    salesCommissionPercent: percent,
    dayBookingsCount: 0,
    daySalesTotalVnd: 0,
    monthBookingsCount: 0,
    monthSalesTotalVnd: 0,
    allTimeBookingsCount: 0,
    allTimeSalesTotalVnd: 0,
    ticketDayProfitVnd: 0,
    ticketWeekProfitVnd: 0,
    ticketMonthProfitVnd: 0,
    ticketAllTimeProfitVnd: 0,
    ...emptyPayrollBonusSlice(),
    dayManagerCashReceivedVnd: 0,
    dayManagerCashHandedVnd: 0,
    monthManagerCashReceivedVnd: 0,
    monthManagerCashHandedVnd: 0,
    allManagerCashReceivedVnd: 0,
    allManagerCashHandedVnd: 0,
    managerCashOutstandingAllTimeVnd: 0,
  };
}

export type DirectorSalesPulse = {
  windowDays: number;
  recentBookings: Array<{
    bookingId: string;
    createdAt: string;
    tourName: string;
    tourDateYmd: string;
    managerName: string;
    pax: number;
  }>;
  byManager: Array<{ managerId: string; managerName: string; bookings: number; pax: number }>;
  byTour: Array<{ tourId: string; tourName: string; bookings: number; pax: number }>;
  byHour: Array<{ hour: string; bookings: number; pax: number; solo: number; pair: number; family: number; group: number }>;
};

/** Директорский срез продаж: кто, куда и во сколько записывает.
 *  fromYmd — начало периода YYYY-MM-DD (если не передан — windowDays от сегодня). */
export async function getDirectorSalesPulse(windowDays = 30, fromYmd?: string): Promise<DirectorSalesPulse> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { windowDays, recentBookings: [], byManager: [], byTour: [], byHour: [] };
  }
  const days = Math.max(1, Math.min(120, Math.round(windowDays)));
  const sinceIso = fromYmd
    ? new Date(`${fromYmd}T00:00:00.000Z`).toISOString()
    : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: bookingRows, error } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,created_at,adults,children,infants")
    .is("deleted_at", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error || !bookingRows) {
    return { windowDays: days, recentBookings: [], byManager: [], byTour: [], byHour: [] };
  }

  const rows = bookingRows as Array<{
    id: string;
    tour_id: string;
    manager_id: string;
    created_at: string;
    adults?: number | string | null;
    children?: number | string | null;
    infants?: number | string | null;
  }>;
  const tourIds = [...new Set(rows.map((r) => String(r.tour_id)).filter(Boolean))];
  const managerIds = [...new Set(rows.map((r) => String(r.manager_id)).filter(Boolean))];

  const [tourRes, userRes] = await Promise.all([
    tourIds.length ? supabase.from("tours").select("id,name,start_at").in("id", tourIds) : Promise.resolve({ data: [] as unknown[] }),
    managerIds.length ? supabase.from("users").select("id,full_name").in("id", managerIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const tourMap = new Map(
    ((tourRes.data as Array<{ id: string; name?: string | null; start_at?: string | null }> | null) ?? []).map((t) => [
      String(t.id),
      { name: String(t.name || "Тур"), ymd: t.start_at ? startDateOnly(String(t.start_at)) : "" },
    ]),
  );
  const userMap = new Map(
    ((userRes.data as Array<{ id: string; full_name?: string | null }> | null) ?? []).map((u) => [
      String(u.id),
      String(u.full_name || "Сотрудник"),
    ]),
  );

  const byManagerMap = new Map<string, { managerId: string; managerName: string; bookings: number; pax: number }>();
  const byHourMap = new Map<string, { hour: string; bookings: number; pax: number; solo: number; pair: number; family: number; group: number }>();
  const recentBookings: DirectorSalesPulse["recentBookings"] = [];
  const byTourMap = new Map<string, { tourId: string; tourName: string; bookings: number; pax: number }>();

  for (const r of rows) {
    const pax =
      Math.max(0, Number(r.adults || 0)) +
      Math.max(0, Number(r.children || 0)) +
      Math.max(0, Number(r.infants || 0));
    const managerId = String(r.manager_id);
    const managerName = userMap.get(managerId) || "Сотрудник";
    const tourId = String(r.tour_id);
    const tourMeta = tourMap.get(tourId);
    const tourName = tourMeta?.name || "Тур";
    const tourDateYmd = tourMeta?.ymd || "";
    recentBookings.push({
      bookingId: String(r.id),
      createdAt: String(r.created_at),
      tourName,
      tourDateYmd,
      managerName,
      pax,
    });

    const mgr = byManagerMap.get(managerId) || { managerId, managerName, bookings: 0, pax: 0 };
    mgr.bookings += 1;
    mgr.pax += pax;
    byManagerMap.set(managerId, mgr);

    // Группируем по имени тура — один "Далат Чудес" из разных дат = одна строка
    const tourKey = tourName.trim().toLowerCase();
    const tour = byTourMap.get(tourKey) || { tourId: tourKey, tourName, bookings: 0, pax: 0 };
    tour.bookings += 1;
    tour.pax += pax;
    byTourMap.set(tourKey, tour);

    const hh = hhmmFromIsoInTourTz(String(r.created_at)).slice(0, 2) || "00";
    const bucket = `${hh}:00`;
    const hour = byHourMap.get(bucket) || { hour: bucket, bookings: 0, pax: 0, solo: 0, pair: 0, family: 0, group: 0 };
    const adults = Math.max(0, Number(r.adults || 0));
    const hasKids = Math.max(0, Number(r.children || 0)) > 0 || Math.max(0, Number(r.infants || 0)) > 0;
    hour.bookings += 1;
    hour.pax += pax;
    if (hasKids)         hour.family++;
    else if (adults <= 1) hour.solo++;
    else if (adults === 2) hour.pair++;
    else                   hour.group++;
    byHourMap.set(bucket, hour);
  }

  return {
    windowDays: days,
    recentBookings: recentBookings.slice(0, 30),
    byManager: [...byManagerMap.values()].sort((a, b) => b.bookings - a.bookings || b.pax - a.pax).slice(0, 10),
    byTour: [...byTourMap.values()].sort((a, b) => b.bookings - a.bookings || b.pax - a.pax).slice(0, 10),
    byHour: [...byHourMap.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

/** Брони менеджера по дате старта тура: день / месяц / всё время; суммы по прайсу; билеты (manager_profit_vnd).
 *  `dayYmd` - день для вкладки «День» и для недели билетов (обычно выбранный день в календаре или сегодня). */
export async function getManagerDashboardSalesStats(
  userId: string,
  monthYyyyMm: string,
  dayYmd: string,
): Promise<ManagerDashboardSalesStats> {
  const supabase = getSupabaseAdmin();
  const weekKeys = new Set(weekDayKeysLocal(dayYmd));

  if (!supabase) {
    return emptyManagerDashboardSalesStats(DEFAULT_MANAGER_SALES_COMMISSION);
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("manager_sales_commission_percent")
    .eq("id", userId)
    .maybeSingle();
  const pctRaw = (userRow as { manager_sales_commission_percent?: number | string | null } | null)
    ?.manager_sales_commission_percent;
  const salesCommissionPercent =
    pctRaw != null && pctRaw !== "" && Number.isFinite(Number(pctRaw))
      ? Math.min(100, Math.max(0, Number(pctRaw)))
      : DEFAULT_MANAGER_SALES_COMMISSION;

  const { data: ownRows, error: ownErr } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id")
    .eq("manager_id", userId)
    .is("deleted_at", null);

  let shareIds: string[] = [];
  const sharesForUser = await supabase
    .from("booking_commission_shares")
    .select("booking_id,percent")
    .eq("beneficiary_id", userId);
  if (!sharesForUser.error && sharesForUser.data) {
    shareIds = (sharesForUser.data as { booking_id: string }[]).map((r) => String(r.booking_id));
  }

  const extraRows =
    shareIds.length > 0
      ? await supabase.from("bookings").select("id,tour_id,manager_id").in("id", shareIds).is("deleted_at", null)
      : ({ data: [] } as { data: unknown[] });

  const bookRows = [
    ...(((ownRows as { id: string; tour_id: string; manager_id: string }[]) || []) as { id: string; tour_id: string; manager_id: string }[]),
    ...(((extraRows.data as { id: string; tour_id: string; manager_id: string }[]) || []) as { id: string; tour_id: string; manager_id: string }[]),
  ];
  const uniqById = new Map<string, { id: string; tour_id: string; manager_id: string }>();
  for (const r of bookRows) {
    if (!r?.id) continue;
    uniqById.set(String(r.id), { id: String(r.id), tour_id: String(r.tour_id), manager_id: String(r.manager_id) });
  }
  const uniqRows = [...uniqById.values()];

  if (ownErr || (extraRows as { error?: unknown }).error || uniqRows.length === 0) {
    const empty = emptyManagerDashboardSalesStats(salesCommissionPercent);
    return finalizeManagerDashboardSalesStats(supabase, userId, monthYyyyMm, dayYmd, weekKeys, empty);
  }

  const tourIds = [...new Set(uniqRows.map((r) => r.tour_id))];
  if (!tourIds.length) {
    const empty = emptyManagerDashboardSalesStats(salesCommissionPercent);
    return finalizeManagerDashboardSalesStats(supabase, userId, monthYyyyMm, dayYmd, weekKeys, empty);
  }

  const { data: tourRows } = await supabase.from("tours").select("id,start_at").in("id", tourIds);
  const tourStartYmd = new Map(
    ((tourRows as { id: string; start_at: string }[]) || []).map((t) => [t.id, startDateOnly(t.start_at)]),
  );

  const dayIds: string[] = [];
  const monthIds: string[] = [];
  const allIds: string[] = [];

  for (const b of uniqRows) {
    const ymd = tourStartYmd.get(b.tour_id);
    if (!ymd) continue;
    const bid = String(b.id);
    allIds.push(bid);
    if (ymd === dayYmd) dayIds.push(bid);
    if (ymd.slice(0, 7) === monthYyyyMm) monthIds.push(bid);
  }

  const uniqueAll = [...new Set(allIds)];
  if (uniqueAll.length === 0) {
    const empty = emptyManagerDashboardSalesStats(salesCommissionPercent);
    return finalizeManagerDashboardSalesStats(supabase, userId, monthYyyyMm, dayYmd, weekKeys, empty);
  }

  const { data: priceRows } = await supabase
    .from("booking_prices")
    .select("booking_id,amount_vnd")
    .in("booking_id", uniqueAll);
  const sumByBooking = new Map<string, number>();
  for (const p of priceRows || []) {
    const bid = String((p as { booking_id: string }).booking_id);
    const amt = Number((p as { amount_vnd: number }).amount_vnd) || 0;
    sumByBooking.set(bid, (sumByBooking.get(bid) || 0) + amt);
  }

  const byBooking = new Map<string, { managerId: string; tourId: string }>();
  for (const r of uniqRows) byBooking.set(r.id, { managerId: r.manager_id, tourId: r.tour_id });

  // Load shares for all relevant bookings (for manager остаток and beneficiary доля).
  const sharesAll = await supabase
    .from("booking_commission_shares")
    .select("booking_id,beneficiary_id,percent")
    .in("booking_id", uniqueAll);
  const outPctByBooking = new Map<string, number>();
  const pctByBookingUser = new Map<string, Map<string, number>>();
  if (!sharesAll.error && sharesAll.data) {
    for (const s of sharesAll.data as { booking_id: string; beneficiary_id: string; percent: number | string }[]) {
      const bid = String(s.booking_id);
      const uid = String(s.beneficiary_id);
      const pct = Math.max(0, Math.min(100, Number(s.percent) || 0));
      outPctByBooking.set(bid, (outPctByBooking.get(bid) || 0) + pct);
      const m = pctByBookingUser.get(bid) || new Map<string, number>();
      m.set(uid, (m.get(uid) || 0) + pct);
      pctByBookingUser.set(bid, m);
    }
  }

  function effectivePercentForBooking(bookingId: string): number {
    const meta = byBooking.get(bookingId);
    if (!meta) return 0;
    if (meta.managerId === userId) {
      const out = outPctByBooking.get(bookingId) || 0;
      return Math.max(0, Math.min(100, 100 - out));
    }
    const m = pctByBookingUser.get(bookingId);
    return Math.max(0, Math.min(100, m?.get(userId) || 0));
  }

  function sumFor(ids: string[]): { count: number; sum: number } {
    const u = [...new Set(ids)];
    let s = 0;
    let c = 0;
    for (const id of u) {
      const total = sumByBooking.get(id) || 0;
      const pct = effectivePercentForBooking(id);
      if (pct <= 0) continue;
      s += Math.round((total * pct) / 100);
      c += 1;
    }
    return { count: c, sum: s };
  }

  const day = sumFor(dayIds);
  const month = sumFor(monthIds);
  const all = sumFor(allIds);

  const base: ManagerDashboardSalesStats = {
    salesCommissionPercent,
    dayBookingsCount: day.count,
    daySalesTotalVnd: day.sum,
    monthBookingsCount: month.count,
    monthSalesTotalVnd: month.sum,
    allTimeBookingsCount: all.count,
    allTimeSalesTotalVnd: all.sum,
    ticketDayProfitVnd: 0,
    ticketWeekProfitVnd: 0,
    ticketMonthProfitVnd: 0,
    ticketAllTimeProfitVnd: 0,
    ...emptyPayrollBonusSlice(),
    dayManagerCashReceivedVnd: 0,
    dayManagerCashHandedVnd: 0,
    monthManagerCashReceivedVnd: 0,
    monthManagerCashHandedVnd: 0,
    allManagerCashReceivedVnd: 0,
    allManagerCashHandedVnd: 0,
    managerCashOutstandingAllTimeVnd: 0,
  };

  return finalizeManagerDashboardSalesStats(supabase, userId, monthYyyyMm, dayYmd, weekKeys, base);
}

async function mergeTicketProfits(
  supabase: SupabaseClient,
  userId: string,
  monthYyyyMm: string,
  dayYmd: string,
  weekKeys: Set<string>,
  base: ManagerDashboardSalesStats,
): Promise<ManagerDashboardSalesStats> {
  const { data: ticketRows } = await supabase
    .from("ticket_sales")
    .select("sold_at,manager_profit_vnd")
    .eq("manager_id", userId);

  let ticketDay = 0;
  let ticketWeek = 0;
  let ticketMonth = 0;
  let ticketAll = 0;

  for (const row of ticketRows || []) {
    const soldAt = String((row as { sold_at: string }).sold_at);
    const prof = Number((row as { manager_profit_vnd: number }).manager_profit_vnd) || 0;
    ticketAll += prof;
    const d = localDateString(new Date(soldAt));
    if (d === dayYmd) ticketDay += prof;
    if (weekKeys.has(d)) ticketWeek += prof;
    if (d.slice(0, 7) === monthYyyyMm) ticketMonth += prof;
  }

  return {
    ...base,
    ticketDayProfitVnd: ticketDay,
    ticketWeekProfitVnd: ticketWeek,
    ticketMonthProfitVnd: ticketMonth,
    ticketAllTimeProfitVnd: ticketAll,
  };
}

async function finalizeManagerDashboardSalesStats(
  supabase: SupabaseClient,
  userId: string,
  monthYyyyMm: string,
  dayYmd: string,
  weekKeys: Set<string>,
  base: ManagerDashboardSalesStats,
): Promise<ManagerDashboardSalesStats> {
  const merged = await mergeTicketProfits(supabase, userId, monthYyyyMm, dayYmd, weekKeys, base);
  const pb = await loadEmployeePayrollBonusDashboardSlice(supabase, userId, dayYmd, monthYyyyMm);
  const monthEndYmd = calendarMonthEndYmd(monthYyyyMm);
  const monthEndExclusive = nextDayYmd(monthEndYmd);
  const dayExclusive = nextDayYmd(dayYmd);
  const tomorrowYmd = nextDayYmd(localDateString());
  const [dayCash, monthCash, allCash, snapAll] = await Promise.all([
    getManagerCashFlowForYmdRange(supabase, userId, dayYmd, dayExclusive),
    getManagerCashFlowForYmdRange(supabase, userId, `${monthYyyyMm}-01`, monthEndExclusive),
    getManagerCashFlowForYmdRange(supabase, userId, "2010-01-01", tomorrowYmd),
    getManagerCashOnHandSnapshot(supabase, userId, "all"),
  ]);
  return {
    ...merged,
    ...pb,
    dayManagerCashReceivedVnd: dayCash.receivedVnd,
    dayManagerCashHandedVnd: dayCash.handedVnd,
    monthManagerCashReceivedVnd: monthCash.receivedVnd,
    monthManagerCashHandedVnd: monthCash.handedVnd,
    allManagerCashReceivedVnd: allCash.receivedVnd,
    allManagerCashHandedVnd: allCash.handedVnd,
    managerCashOutstandingAllTimeVnd: snapAll.outstandingAllTimeVnd,
  };
}

export type BookingsByHourRow = {
  hour: number;
  count: number;
  totalPax?: number;
  solo?: number;    // 1 человек
  pair?: number;    // 2 взрослых, без детей
  family?: number;  // есть дети (children > 0 || infants > 0)
  group?: number;   // 4+ человек без детей (компании)
};

/** Распределение броней по часу создания (Вьетнам UTC+7) за период. */
export async function getBookingsByHour(period: FinancePeriod): Promise<BookingsByHourRow[]> {
  const supabase = getSupabaseAdmin();
  const empty: BookingsByHourRow[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  if (!supabase) return empty;

  let q = supabase
    .from("bookings")
    .select("created_at,adults,children,infants")
    .is("deleted_at", null);

  if (period.kind === "month") {
    const { start, end } = monthRangeUtcIso(period.year, period.month);
    q = q.gte("created_at", start).lt("created_at", end);
  }

  const { data, error } = await q;
  if (error || !data) return empty;

  type HourStats = { count: number; pax: number; solo: number; pair: number; family: number; group: number };
  const hourMap = new Map<number, HourStats>();

  for (const row of data as { created_at: string; adults?: number; children?: number; infants?: number }[]) {
    const d = new Date(row.created_at);
    const h = (d.getUTCHours() + 7) % 24; // UTC+7 Vietnam
    const adults = Number(row.adults) || 0;
    const children = Number(row.children) || 0;
    const infants = Number(row.infants) || 0;
    const pax = adults + children + infants;
    const hasKids = children > 0 || infants > 0;

    const s = hourMap.get(h) ?? { count: 0, pax: 0, solo: 0, pair: 0, family: 0, group: 0 };
    s.count++;
    s.pax += pax;
    if (hasKids)           s.family++;
    else if (adults <= 1)  s.solo++;
    else if (adults === 2) s.pair++;
    else                   s.group++;
    hourMap.set(h, s);
  }

  return empty.map(({ hour }) => {
    const s = hourMap.get(hour);
    return {
      hour,
      count: s?.count ?? 0,
      totalPax: s?.pax ?? 0,
      solo: s?.solo ?? 0,
      pair: s?.pair ?? 0,
      family: s?.family ?? 0,
      group: s?.group ?? 0,
    };
  });
}

export async function getFinanceSnapshot(period: FinancePeriod): Promise<FinanceSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { incomeVnd: 0, expenseVnd: 0, netVnd: 0 };
  }

  let payQuery = supabase.from("payments").select("amount_vnd");
  let expQuery = supabase.from("expenses").select("amount_vnd");

  if (period.kind === "month") {
    const { start, end } = monthRangeUtcIso(period.year, period.month);
    payQuery = payQuery.gte("created_at", start).lt("created_at", end);
    expQuery = expQuery.gte("created_at", start).lt("created_at", end);
  }

  const [{ data: pay }, { data: exp }] = await Promise.all([payQuery, expQuery]);
  const incomeVnd = (pay || []).reduce((s, r) => s + Number((r as { amount_vnd: number }).amount_vnd), 0);
  const expenseVnd = (exp || []).reduce((s, r) => s + Number((r as { amount_vnd: number }).amount_vnd), 0);
  return { incomeVnd, expenseVnd, netVnd: incomeVnd - expenseVnd };
}

/** Суммы платежей и расходов туров за календарный интервал YYYY-MM-DD (границы как у сверки кассы, UTC). */
export async function getFinanceSnapshotForYmdRange(fromYmd: string, toYmd: string): Promise<FinanceSnapshot> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd) || fromYmd > toYmd) {
    return { incomeVnd: 0, expenseVnd: 0, netVnd: 0 };
  }
  const rangeStart = `${fromYmd}T00:00:00.000Z`;
  const rangeEndExclusive = `${nextDayYmd(toYmd)}T00:00:00.000Z`;
  const payQuery = supabase
    .from("payments")
    .select("amount_vnd")
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEndExclusive);
  const expQuery = supabase
    .from("expenses")
    .select("amount_vnd")
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEndExclusive);
  const [{ data: pay }, { data: exp }] = await Promise.all([payQuery, expQuery]);
  const incomeVnd = (pay || []).reduce((s, r) => s + Number((r as { amount_vnd: number }).amount_vnd), 0);
  const expenseVnd = (exp || []).reduce((s, r) => s + Number((r as { amount_vnd: number }).amount_vnd), 0);
  return { incomeVnd, expenseVnd, netVnd: incomeVnd - expenseVnd };
}

export async function listRecentPayments(period: FinancePeriod, limit: number): Promise<PaymentRowBrief[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let q = supabase
    .from("payments")
    .select(`
      id, amount_vnd, kind, created_at, booking_id,
      bookings(customer_name, online_code, manager_id,
        users!bookings_manager_id_fkey(full_name),
        tours(name, date)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (period.kind === "month") {
    const { start, end } = monthRangeUtcIso(period.year, period.month);
    q = q.gte("created_at", start).lt("created_at", end);
  }

  const { data } = await q;
  type RawPayment = {
    id: string; amount_vnd: number; kind: string; created_at: string; booking_id: string;
    bookings?: {
      customer_name?: string | null; online_code?: string | null;
      users?: { full_name?: string | null } | null;
      tours?: { name?: string | null; date?: string | null } | null;
    } | null;
  };
  return ((data as RawPayment[]) || []).map((r) => ({
    id: r.id,
    amountVnd: Number(r.amount_vnd),
    kind: r.kind,
    createdAt: r.created_at,
    bookingId: r.booking_id,
    customerName: r.bookings?.customer_name ?? null,
    onlineCode: r.bookings?.online_code ?? null,
    managerName: r.bookings?.users?.full_name ?? null,
    tourName: r.bookings?.tours?.name ?? null,
    tourDate: r.bookings?.tours?.date ?? null,
  }));
}

/** Список платежей за произвольный календарный диапазон YYYY-MM-DD (UTC). */
export async function listPaymentsForYmdRange(fromYmd: string, toYmd: string, limit = 200): Promise<PaymentRowBrief[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) return [];
  const rangeStart = `${fromYmd}T00:00:00.000Z`;
  const rangeEndExclusive = `${nextDayYmd(toYmd)}T00:00:00.000Z`;
  const { data } = await supabase
    .from("payments")
    .select("id, amount_vnd, kind, created_at, booking_id")
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEndExclusive)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as { id: string; amount_vnd: number; kind: string; created_at: string; booking_id: string }[]) || []).map(
    (r) => ({
      id: r.id,
      amountVnd: Number(r.amount_vnd),
      kind: r.kind,
      createdAt: r.created_at,
      bookingId: r.booking_id,
    }),
  );
}

export type AccountingTourRow = {
  tourId: string;
  tourName: string;
  tourDate: string;
  tourStatus: TourStatus;
  accountingStatus: "open" | "closed";

  managerId: string | null;
  managerName: string | null;
  guideId: string | null;
  guideName: string | null;
  pax: number;

  incomeVnd: number;
  expenseVnd: number;
  profitVnd: number;
  /** Депозит гиду из кассы (₫), если задан */
  guideCashDepositVnd?: number | null;
  /**
   * Оценка «на руках у менеджера по этому туру»: принято по броням этого менеджера минус сдачи в кассу
   * с ролью «менеджер» по туру (как в карточке сотрудника). Только для «главного» менеджера строки.
   */
  managerTourCashOutstandingVnd: number | null;
};

/** Список туров для бухгалтера: доход/расход/прибыль + менеджер + pax (без тяжёлых join-ов по карточкам). */
export async function listAccountingTours(period: FinancePeriod, limit = 120): Promise<AccountingTourRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [...mockTours]
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map((t) => ({
        tourId: t.id,
        tourName: t.name,
        tourDate: t.date,
        tourStatus: t.status,
        accountingStatus: "open" as const,
        managerId: null,
        managerName: null,
        guideId: null,
        guideName: null,
        pax: 0,
        incomeVnd: 0,
        expenseVnd: 0,
        profitVnd: 0,
        guideCashDepositVnd: null,
        managerTourCashOutstandingVnd: null,
      }));
  }

  const sb = supabase;
  function toursQuery(selectCols: string) {
    let tq = sb
      .from("tours")
      .select(selectCols)
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("start_at", { ascending: false })
      .limit(limit);

    if (period.kind === "month") {
      const { start, end } = monthRangeUtcIso(period.year, period.month);
      tq = tq.gte("start_at", start).lt("start_at", end);
    }
    return tq;
  }

  const tourSelectVariants = [
    "id,name,start_at,status,guide_cash_deposit_vnd,accountant_dispatch_expenses_reviewed_at",
    "id,name,start_at,status,guide_cash_deposit_vnd",
    "id,name,start_at,status,accountant_dispatch_expenses_reviewed_at",
    "id,name,start_at,status",
  ];
  let tours: unknown = null;
  let toursErr: { message?: string } | null = null;
  for (const sel of tourSelectVariants) {
    const r = await toursQuery(sel);
    if (!r.error) {
      tours = r.data;
      toursErr = null;
      break;
    }
    toursErr = r.error;
  }
  if (toursErr) return [];

  type TourRowAcc = {
    id: string;
    name: string;
    start_at: string;
    status: TourStatus;
    guide_cash_deposit_vnd?: number | string | null;
    accountant_dispatch_expenses_reviewed_at?: string | null;
  };
  const tourRows = ((tours as unknown) as TourRowAcc[] | null) || [];
  if (tourRows.length === 0) return [];

  const tourIds = tourRows.map((t) => t.id);

  const [{ data: bookingRows }, { data: guideRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id,tour_id,manager_id,adults,children,infants,users!bookings_manager_id_fkey(full_name)")
      .in("tour_id", tourIds)
      .is("deleted_at", null),
    supabase
      .from("tour_guides")
      .select("tour_id,guide_id,is_primary,users!tour_guides_guide_id_fkey(full_name)")
      .in("tour_id", tourIds),
  ]);

  const primaryGuideByTour = new Map<string, { guideId: string; guideName: string }>();
  for (const r of (guideRows as { tour_id: string; guide_id: string; is_primary: boolean; users: unknown }[] | null) ?? []) {
    const name = String((r.users as { full_name?: string } | null)?.full_name || "").trim() || null;
    const existing = primaryGuideByTour.get(r.tour_id);
    if (!existing || r.is_primary) {
      primaryGuideByTour.set(r.tour_id, { guideId: r.guide_id, guideName: name || "-" });
    }
  }

  type BR = {
    id: string;
    tour_id: string;
    manager_id: string | null;
    adults: number;
    children: number;
    infants: number;
    users?: unknown;
  };

  const byTourPax = new Map<string, number>();
  /** Счётчик броней по (tour_id → manager_id), чтобы выбрать менеджера с максимумом броней (не «первую строку»). */
  const mgrCountByTour = new Map<string, Map<string, { managerName: string; n: number }>>();
  const bookingIdToTourId = new Map<string, string>();
  const bookingIdToManagerId = new Map<string, string>();
  const bookingIds: string[] = [];

  for (const r of ((bookingRows as BR[]) || [])) {
    bookingIds.push(r.id);
    bookingIdToTourId.set(r.id, r.tour_id);
    if (r.manager_id) bookingIdToManagerId.set(r.id, String(r.manager_id));
    /** Занято мест по броням: без младенцев. */
    byTourPax.set(
      r.tour_id,
      (byTourPax.get(r.tour_id) || 0) + Number(r.adults || 0) + Number(r.children || 0),
    );

    const midRaw = r.manager_id ? String(r.manager_id) : "";
    if (midRaw) {
      const name = bookingManagerFullName(r.users);
      let inner = mgrCountByTour.get(r.tour_id);
      if (!inner) {
        inner = new Map();
        mgrCountByTour.set(r.tour_id, inner);
      }
      const curM = inner.get(midRaw) || { managerName: name || "-", n: 0 };
      curM.n += 1;
      if (name && name !== "-") curM.managerName = name;
      inner.set(midRaw, curM);
    }
  }

  const byTourManager = new Map<string, { managerId: string | null; managerName: string | null; n: number }>();
  for (const [tid, inner] of mgrCountByTour) {
    let bestMid: string | null = null;
    let bestN = 0;
    let bestName: string | null = null;
    for (const [mid, v] of inner) {
      if (v.n > bestN) {
        bestN = v.n;
        bestMid = mid;
        bestName = v.managerName && v.managerName !== "-" ? v.managerName : null;
      }
    }
    byTourManager.set(tid, { managerId: bestMid, managerName: bestName, n: bestN });
  }

  const incomeByTour = new Map<string, number>();
  /** Принято менеджером по броням (как getManagerCashOnHandSnapshot): депозит/доплата минус возврат. */
  const mgrRecvByTourMgr = new Map<string, Map<string, number>>();
  if (bookingIds.length) {
    let pq = supabase.from("payments").select("booking_id,amount_vnd,kind,remitted_to_cash_at").in("booking_id", bookingIds);
    if (period.kind === "month") {
      const { start, end } = monthRangeUtcIso(period.year, period.month);
      pq = pq.gte("created_at", start).lt("created_at", end);
    }
    const payRes = await pq;
    let payRows = payRes.data as PaymentRowAgg[] | null;
    if (payRes.error && /remitted_to_cash_at|column|does not exist/i.test(String(payRes.error.message))) {
      let pq2 = supabase.from("payments").select("booking_id,amount_vnd,kind").in("booking_id", bookingIds);
      if (period.kind === "month") {
        const { start, end } = monthRangeUtcIso(period.year, period.month);
        pq2 = pq2.gte("created_at", start).lt("created_at", end);
      }
      const r2 = await pq2;
      payRows = ((r2.data || []) as PaymentRowAgg[]).map((r) => ({ ...r, remitted_to_cash_at: undefined }));
    } else if (payRes.error) {
      payRows = [];
    }
    for (const p of payRows || []) {
      const tourId = bookingIdToTourId.get(String(p.booking_id));
      if (!tourId) continue;
      const amt = Number(p.amount_vnd) || 0;
      let net = 0;
      if (p.kind === "refund") net = -amt;
      else if (p.kind === "office_cash") net = amt;
      else if (p.kind === "deposit") net = amt;
      else if (p.kind === "topup") {
        if (topupRemittedToCash(p)) net = amt;
      } else {
        net = amt;
      }
      incomeByTour.set(tourId, (incomeByTour.get(tourId) || 0) + net);

      const mgrId = bookingIdToManagerId.get(String(p.booking_id));
      if (mgrId) {
        let mgrNet = 0;
        if (p.kind === "refund") mgrNet = -amt;
        else if (p.kind === "office_cash") mgrNet = 0;
        else if (p.kind === "deposit") mgrNet = amt;
        else if (p.kind === "topup") mgrNet = topupRemittedToCash(p) ? amt : 0;
        else mgrNet = amt;
        if (mgrNet !== 0) {
          let inner = mgrRecvByTourMgr.get(tourId);
          if (!inner) {
            inner = new Map();
            mgrRecvByTourMgr.set(tourId, inner);
          }
          inner.set(mgrId, (inner.get(mgrId) || 0) + mgrNet);
        }
      }
    }
  }

  const mgrHandedByTourMgr = new Map<string, Map<string, number>>();
  {
    const hoRes = await supabase
      .from("tour_office_cash_handovers")
      .select("tour_id,employee_id,amount_vnd")
      .in("tour_id", tourIds)
      .eq("holder_role", "manager");
    if (!hoRes.error && hoRes.data) {
      for (const h of hoRes.data as { tour_id: string; employee_id: string; amount_vnd: number | string }[]) {
        const tid = String(h.tour_id);
        const eid = String(h.employee_id);
        const v = Math.round(Number(h.amount_vnd || 0));
        let inner = mgrHandedByTourMgr.get(tid);
        if (!inner) {
          inner = new Map();
          mgrHandedByTourMgr.set(tid, inner);
        }
        inner.set(eid, (inner.get(eid) || 0) + v);
      }
    }
  }

  const expenseByTour = new Map<string, number>();
  const pendingExpenseByTour = new Map<string, boolean>();
  /** Расходы блока «водитель / диспетчер·букинг» - без отметки бухгалтера тур не «Проверено». */
  const tourIdsWithDispatchBlockExpenses = new Set<string>();
  {
    const selectsToTry = [
      "tour_id,category,amount_vnd,description,pending_accountant_review,accountant_reviewed_at,created_at",
      "tour_id,amount_vnd,description,pending_accountant_review,accountant_reviewed_at,created_at",
      "tour_id,amount_vnd,description,accountant_reviewed_at,created_at",
      "tour_id,amount_vnd,description,pending_accountant_review,created_at",
      "tour_id,amount_vnd,description,created_at",
    ];
    for (const select of selectsToTry) {
      let eq = supabase.from("expenses").select(select).in("tour_id", tourIds);
      if (period.kind === "month") {
        const { start, end } = monthRangeUtcIso(period.year, period.month);
        eq = eq.gte("created_at", start).lt("created_at", end);
      }
      const res = await eq;
      if (res.error) {
        continue;
      }
      for (const e of
        (res.data as unknown as
          | {
              tour_id: string;
              category?: string | null;
              amount_vnd: number | string;
              description?: string;
              pending_accountant_review?: boolean | null;
              accountant_reviewed_at?: string | null;
            }[]
          | null) || []) {
        const tid = String(e.tour_id);
        expenseByTour.set(tid, (expenseByTour.get(tid) || 0) + Number(e.amount_vnd || 0));
        const desc = String(e.description || "");
        if (String(e.category || "") === "bus" || desc.trimStart().startsWith(ACCT_BOOKING_PREFIX)) {
          tourIdsWithDispatchBlockExpenses.add(tid);
        }
        const pending = Boolean(e.pending_accountant_review) || /в обработке \(дата чека/i.test(String(e.description || ""));
        const reviewed = Boolean(e.accountant_reviewed_at);
        if (pending && !reviewed) pendingExpenseByTour.set(tid, true);
      }
      break;
    }
  }

  const manifestPendingByTour = new Map<string, boolean>();
  {
    const res = await supabase.from("tour_manifests").select("tour_id,needs_accountant_review").in("tour_id", tourIds);
    if (!res.error && res.data) {
      for (const r of (res.data as { tour_id: string; needs_accountant_review?: boolean | null }[]) || []) {
        if (Boolean(r.needs_accountant_review)) manifestPendingByTour.set(String(r.tour_id), true);
      }
    }
  }

  const pendingGuideTopupTour = new Set<string>();
  if (bookingIds.length) {
    const pr = await supabase
      .from("payments")
      .select("booking_id")
      .eq("kind", "topup")
      .is("remitted_to_cash_at", null)
      .in("booking_id", bookingIds);
    if (!pr.error && pr.data) {
      for (const r of pr.data as { booking_id: string }[]) {
        const tid = bookingIdToTourId.get(String(r.booking_id));
        if (tid) pendingGuideTopupTour.add(tid);
      }
    }
  }

  const absenceAccountantPendingTour = new Set<string>();
  {
    type AbsPendingRow = {
      tour_id: string;
      absent_adults: number | string;
      absent_children: number | string;
      absent_infants: number | string;
      accountant_absence_reviewed_at?: string | null;
      refund_not_required?: boolean | null;
      manager_refund_acknowledged_at?: string | null;
      refund_vnd?: number | string | null;
    };
    const fullSelect =
      "tour_id,absent_adults,absent_children,absent_infants,accountant_absence_reviewed_at,refund_not_required,manager_refund_acknowledged_at,refund_vnd";
    let absenceRows: AbsPendingRow[] | null = null;
    let legacyAbsencePending = false;
    const arFull = await supabase.from("tour_manifest_absences").select(fullSelect).in("tour_id", tourIds);
    if (!arFull.error && arFull.data) {
      absenceRows = arFull.data as AbsPendingRow[];
    } else {
      const arLeg = await supabase
        .from("tour_manifest_absences")
        .select("tour_id,absent_adults,absent_children,absent_infants,accountant_absence_reviewed_at")
        .in("tour_id", tourIds);
      if (!arLeg.error && arLeg.data) {
        absenceRows = arLeg.data as AbsPendingRow[];
        legacyAbsencePending = true;
      }
    }

    for (const r of absenceRows || []) {
      const abs =
        Number(r.absent_adults || 0) + Number(r.absent_children || 0) + Number(r.absent_infants || 0);
      if (abs <= 0) continue;
      const reviewed =
        typeof r.accountant_absence_reviewed_at === "string" && r.accountant_absence_reviewed_at.trim() !== "";
      if (legacyAbsencePending) {
        if (!reviewed) absenceAccountantPendingTour.add(String(r.tour_id));
        continue;
      }
      const refundNotRequired = Boolean(r.refund_not_required);
      const mgrAck =
        typeof r.manager_refund_acknowledged_at === "string" && r.manager_refund_acknowledged_at.trim() !== "";
      const refundVnd = Math.max(0, Math.round(Number(r.refund_vnd ?? 0)));
      if (refundNotRequired) continue;
      if (!mgrAck) {
        absenceAccountantPendingTour.add(String(r.tour_id));
        continue;
      }
      if (refundVnd > 0) {
        if (!reviewed) absenceAccountantPendingTour.add(String(r.tour_id));
      } else if (!reviewed) {
        absenceAccountantPendingTour.add(String(r.tour_id));
      }
    }
  }

  const unpaidSalaryByTour = new Map<string, boolean>();
  {
    const res = await supabase.from("guide_salary_records").select("tour_id,status").in("tour_id", tourIds);
    if (!res.error && res.data) {
      for (const r of (res.data as { tour_id: string; status: string | null }[]) || []) {
        if (String(r.status || "").toLowerCase() !== "paid") unpaidSalaryByTour.set(String(r.tour_id), true);
      }
    }
  }

  return tourRows.map((t) => {
    const mgr = byTourManager.get(t.id) || { managerId: null, managerName: null, n: 0 };
    const pax = byTourPax.get(t.id) || 0;
    const incomeVnd = Math.round(incomeByTour.get(t.id) || 0);
    const expenseVnd = Math.round(expenseByTour.get(t.id) || 0);
    const dispatchBlockNeedsReview =
      t.status === "completed" &&
      tourIdsWithDispatchBlockExpenses.has(t.id) &&
      (!t.accountant_dispatch_expenses_reviewed_at ||
        String(t.accountant_dispatch_expenses_reviewed_at).trim() === "");
    const hasPending =
      Boolean(pendingExpenseByTour.get(t.id)) ||
      Boolean(manifestPendingByTour.get(t.id)) ||
      Boolean(unpaidSalaryByTour.get(t.id)) ||
      pendingGuideTopupTour.has(t.id) ||
      absenceAccountantPendingTour.has(t.id) ||
      dispatchBlockNeedsReview;
    const accountingStatus: "open" | "closed" = t.status === "completed" && !hasPending ? "closed" : "open";
    const dep =
      t.guide_cash_deposit_vnd != null && t.guide_cash_deposit_vnd !== ""
        ? Math.max(0, Math.round(Number(t.guide_cash_deposit_vnd)))
        : null;
    const mid = mgr.managerId;
    let managerTourCashOutstandingVnd: number | null = null;
    if (mid) {
      const rec = mgrRecvByTourMgr.get(t.id)?.get(mid) ?? 0;
      const handed = mgrHandedByTourMgr.get(t.id)?.get(mid) ?? 0;
      managerTourCashOutstandingVnd = Math.max(0, rec - handed);
    }
    const guideInfo = primaryGuideByTour.get(t.id) ?? null;
    return {
      tourId: t.id,
      tourName: t.name,
      tourDate: startDateOnly(t.start_at),
      tourStatus: t.status,
      accountingStatus,
      managerId: mgr.managerId,
      managerName: mgr.managerName,
      guideId: guideInfo?.guideId ?? null,
      guideName: guideInfo?.guideName ?? null,
      pax,
      incomeVnd,
      expenseVnd,
      profitVnd: incomeVnd - expenseVnd,
      guideCashDepositVnd: dep && dep > 0 ? dep : null,
      managerTourCashOutstandingVnd,
    };
  });
}

export async function listToursForExpenseForm(): Promise<TourOption[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  type TourRow = {
    id: string;
    human_id?: string | number | null;
    name: string;
    start_at: string;
    template_id?: string | null;
    description_override?: string | null;
  };
  let rows: TourRow[] | null = null;
  const first = await supabase
    .from("tours")
    .select("id,human_id,name,start_at,template_id,description_override")
    .is("deleted_at", null)
    .neq("status", "deleted")
    .order("start_at", { ascending: false })
    .limit(400);
  if (first.error && /human_id|column|does not exist/i.test(String(first.error.message ?? ""))) {
    const leg = await supabase
      .from("tours")
      .select("id,name,start_at,template_id,description_override")
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("start_at", { ascending: false })
      .limit(400);
    rows = (leg.data as TourRow[] | null) ?? null;
  } else if (!first.error) {
    rows = (first.data as TourRow[] | null) ?? null;
  }
  const tourRows = rows ?? [];

  // Load template descriptions for location extraction
  const templateIds = [...new Set(tourRows.map((r) => r.template_id).filter(Boolean) as string[])];
  const templateDescMap = new Map<string, string>();
  if (templateIds.length > 0) {
    const { data: tmplRows } = await supabase
      .from("tour_templates")
      .select("id,description")
      .in("id", templateIds);
    for (const t of (tmplRows as { id: string; description?: string | null }[] | null) ?? []) {
      if (t.description) templateDescMap.set(t.id, t.description);
    }
  }

  return tourRows.map((r) => {
    const hid = r.human_id != null && String(r.human_id).trim() !== "" ? ` · #${String(r.human_id)}` : "";
    const rawDesc = r.description_override?.trim() || (r.template_id ? templateDescMap.get(r.template_id) : null) || "";
    let locations: string[] = [];
    if (rawDesc) {
      try {
        locations = parseTemplateDescription(rawDesc).locations.map((l) => l.name).filter(Boolean);
      } catch { /* ignore */ }
    }
    return {
      id: r.id,
      label: `${r.name} · ${startDateOnly(r.start_at)}${hid}`,
      ...(locations.length > 0 ? { locations } : {}),
    };
  });
}

export async function listTourAdvancesForTour(tourId: string): Promise<TourAdvanceRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tour_advances")
    .select("id,tour_id,employee_id,created_by,kind,amount_vnd,currency,fx_rate_to_vnd,status,note,created_at")
    .eq("tour_id", tourId)
    .order("created_at", { ascending: false });
  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    tour_id: string;
    employee_id: string;
    created_by?: string | null;
    kind: "issue" | "return";
    amount_vnd: number | string;
    currency?: "VND" | "USD" | null;
    fx_rate_to_vnd?: number | string | null;
    status?: "created" | "pending" | "approved" | "paid" | "rejected" | null;
    note?: string | null;
    created_at: string;
  }[];

  const employeeIds = [...new Set(rows.map((r) => r.employee_id))];
  let nameById = new Map<string, string>();
  if (employeeIds.length) {
    const { data: users } = await supabase.from("users").select("id,full_name").in("id", employeeIds);
    nameById = new Map((users as { id: string; full_name: string }[] | null)?.map((u) => [u.id, u.full_name]) ?? []);
  }

  return rows.map((r) => ({
    id: r.id,
    tourId: r.tour_id,
    employeeId: r.employee_id,
    employeeName: nameById.get(r.employee_id) ?? null,
    kind: r.kind,
    amountVnd: Math.round(Number(r.amount_vnd || 0)),
    currency: r.currency === "USD" ? "USD" : "VND",
    fxRateToVnd: Math.max(1, Number(r.fx_rate_to_vnd || 1)),
    status: r.status ?? "approved",
    note: r.note ?? null,
    createdAt: r.created_at,
    createdById: r.created_by ?? null,
  }));
}

export async function listAdvanceEmployeeOptions(): Promise<{ id: string; fullName: string }[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id,full_name,role,is_active")
    .eq("is_active", true)
    .in("role", [
      "director",
      "guide",
      "chief_guide",
      "manager",
      "chief_manager",
      "dispatcher",
      "accountant",
      "booking_dispatcher",
    ])
    .order("full_name");
  if (error || !data) return [];
  return (data as { id: string; full_name: string }[]).map((u) => ({ id: u.id, fullName: u.full_name }));
}

const MANAGER_CASH_PAYMENTS_CHUNK = 200;

export async function sumPaymentsReceivedForBookingIds(supabase: SupabaseClient, bookingIds: string[]): Promise<number> {
  if (!bookingIds.length) return 0;
  const paymentRowsRaw: PaymentRowAgg[] = [];
  for (let i = 0; i < bookingIds.length; i += MANAGER_CASH_PAYMENTS_CHUNK) {
    const chunk = bookingIds.slice(i, i + MANAGER_CASH_PAYMENTS_CHUNK);
    const payFull = await supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
      .in("booking_id", chunk);
    if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
      const leg = await supabase.from("payments").select("id,booking_id,amount_vnd,kind,created_at").in("booking_id", chunk);
      for (const r of (leg.data || []) as PaymentRowAgg[]) {
        paymentRowsRaw.push({ ...r, remitted_to_cash_at: undefined });
      }
    } else if (!payFull.error && payFull.data) {
      paymentRowsRaw.push(...(payFull.data as PaymentRowAgg[]));
    }
  }
  const payAggMap = aggregatePaymentsEx(paymentRowsRaw);
  let received = 0;
  for (const bid of bookingIds) {
    const agg = payAggMap.get(bid) || emptyPayAggEx();
    received += agg.deposit + agg.topupRemitted - agg.refund;
  }
  return Math.round(received);
}

export async function sumManagerHandoversOnTour(supabase: SupabaseClient, tourId: string, managerId: string): Promise<number> {
  const hoRes = await supabase
    .from("tour_office_cash_handovers")
    .select("amount_vnd")
    .eq("tour_id", tourId)
    .eq("employee_id", managerId)
    .eq("holder_role", "manager");
  if (hoRes.error || !hoRes.data) return 0;
  let handed = 0;
  for (const h of hoRes.data as { amount_vnd: number | string }[]) {
    handed += Math.round(Number(h.amount_vnd || 0));
  }
  return handed;
}

export function parseManagerCashPeriodPreset(v: string | string[] | undefined): ManagerCashPeriodPreset {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw === "day" || raw === "week" || raw === "month" || raw === "all") return raw;
  return "week";
}

export function parseGuideShopPeriodPreset(v: string | string[] | undefined): GuideShopPeriodPreset {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw === "day" || raw === "month" || raw === "all") return raw;
  return "all";
}

type ManagerPayRow = { amount_vnd: number | string; kind: string; created_at: string };

function sumManagerBookingPaymentFlow(rows: ManagerPayRow[], fromIsoInclusive: string, toIsoExclusive: string): number {
  let s = 0;
  for (const r of rows) {
    const t = r.created_at;
    if (t < fromIsoInclusive || t >= toIsoExclusive) continue;
    const a = Math.round(Number(r.amount_vnd || 0));
    const k = String(r.kind || "");
    if (k === "refund") s -= a;
    else if (k === "deposit" || k === "topup") s += a;
  }
  return s;
}

function sumManagerHandovers(
  rows: { amount_vnd: number | string; received_at: string }[],
  fromIsoInclusive: string,
  toIsoExclusive: string,
): number {
  let s = 0;
  for (const r of rows) {
    if (r.received_at < fromIsoInclusive || r.received_at >= toIsoExclusive) continue;
    s += Math.round(Number(r.amount_vnd || 0));
  }
  return s;
}

function managerCashPeriodBounds(preset: ManagerCashPeriodPreset): { fromYmd: string; toInclusiveYmd: string; toExclusiveYmd: string } {
  const todayStr = localDateString();
  const today = parseYmdLocal(todayStr) ?? new Date();
  const from = new Date(today);
  if (preset === "day") {
    /* same day */
  } else if (preset === "week") {
    from.setDate(from.getDate() - 6);
  } else if (preset === "month") {
    from.setDate(from.getDate() - 29);
  } else {
    const early = parseYmdLocal("2010-01-01");
    if (early) from.setTime(early.getTime());
  }
  const fromYmd = localDateString(from);
  const toInclusiveYmd = todayStr;
  const toExclusiveYmd = nextDayYmd(toInclusiveYmd);
  return { fromYmd, toInclusiveYmd, toExclusiveYmd };
}

function managerCashPeriodLabelRu(
  preset: ManagerCashPeriodPreset,
  fromYmd: string,
  toInclusiveYmd: string,
): string {
  if (preset === "all") return "За всё время";
  if (preset === "day") return `За день · ${formatYmdWithWeekdayRu(toInclusiveYmd)}`;
  return `С ${formatYmdWithWeekdayRu(fromYmd)} по ${formatYmdWithWeekdayRu(toInclusiveYmd)}`;
}

function guideShopPeriodBounds(preset: GuideShopPeriodPreset): {
  fromYmd: string;
  toInclusiveYmd: string;
  toExclusiveYmd: string;
} {
  const todayYmd = localDateString();
  const d = parseYmdLocal(todayYmd) ?? new Date();
  const from = new Date(d);
  if (preset === "day") {
    /* same day */
  } else if (preset === "month") {
    from.setDate(1);
  } else {
    const early = parseYmdLocal("2010-01-01");
    if (early) from.setTime(early.getTime());
  }
  const fromYmd = localDateString(from);
  const toInclusiveYmd = todayYmd;
  const toExclusiveYmd = nextDayYmd(todayYmd);
  return { fromYmd, toInclusiveYmd, toExclusiveYmd };
}

function guideShopPeriodLabelRu(preset: GuideShopPeriodPreset, fromYmd: string, toInclusiveYmd: string): string {
  if (preset === "all") return "За всё время";
  if (preset === "day") return `За день · ${formatYmdWithWeekdayRu(toInclusiveYmd)}`;
  return `С ${formatYmdWithWeekdayRu(fromYmd)} по ${formatYmdWithWeekdayRu(toInclusiveYmd)}`;
}

async function getGuideShopSnapshot(
  supabase: SupabaseClient,
  guideId: string,
  preset: GuideShopPeriodPreset,
): Promise<GuideShopSnapshot> {
  const { fromYmd, toInclusiveYmd } = guideShopPeriodBounds(preset);
  const periodStart = fromYmd;
  const periodEnd = toInclusiveYmd;

  const empty: GuideShopSnapshot = {
    preset,
    periodLabelRu: guideShopPeriodLabelRu(preset, fromYmd, toInclusiveYmd),
    rangeFromYmd: fromYmd,
    rangeToInclusiveYmd: toInclusiveYmd,
    accruedInPeriodVnd: 0,
    paidInPeriodVnd: 0,
    allTimeAccruedVnd: 0,
    allTimePaidVnd: 0,
    allTimeRecordsCount: 0,
    byDateRows: [],
  };

  const res = await supabase
    .from("guide_salary_records")
    .select("tour_id,amount_vnd,status,kind")
    .eq("guide_id", guideId)
    .eq("kind", "shop");
  if (res.error || !res.data?.length) return empty;

  const rows = res.data as { tour_id: string; amount_vnd: number | string; status: string; kind: string | null }[];
  const tourIds = [...new Set(rows.map((r) => r.tour_id).filter(Boolean))];
  if (!tourIds.length) return empty;

  const tRes = await supabase.from("tours").select("id,start_at").in("id", tourIds);
  const ymdByTour = new Map<string, string>();
  for (const t of (tRes.data as { id: string; start_at: string }[] | null) ?? []) {
    ymdByTour.set(t.id, startDateOnly(t.start_at));
  }

  const periodMap = new Map<string, { accruedVnd: number; paidVnd: number; recordsCount: number }>();
  let accruedInPeriodVnd = 0;
  let paidInPeriodVnd = 0;
  let allTimeAccruedVnd = 0;
  let allTimePaidVnd = 0;

  for (const r of rows) {
    const ymd = ymdByTour.get(r.tour_id);
    if (!ymd) continue;
    const amount = Math.max(0, Math.round(Number(r.amount_vnd || 0)));
    const paid = String(r.status).toLowerCase() === "paid";
    allTimeAccruedVnd += amount;
    if (paid) allTimePaidVnd += amount;
    if (ymd < periodStart || ymd > periodEnd) continue;
    accruedInPeriodVnd += amount;
    if (paid) paidInPeriodVnd += amount;
    const prev = periodMap.get(ymd) ?? { accruedVnd: 0, paidVnd: 0, recordsCount: 0 };
    prev.accruedVnd += amount;
    if (paid) prev.paidVnd += amount;
    prev.recordsCount += 1;
    periodMap.set(ymd, prev);
  }

  const byDateRows = [...periodMap.entries()]
    .map(([ymd, v]) => ({ ymd, accruedVnd: v.accruedVnd, paidVnd: v.paidVnd, recordsCount: v.recordsCount }))
    .sort((a, b) => b.ymd.localeCompare(a.ymd));

  return {
    preset,
    periodLabelRu: guideShopPeriodLabelRu(preset, fromYmd, toInclusiveYmd),
    rangeFromYmd: fromYmd,
    rangeToInclusiveYmd: toInclusiveYmd,
    accruedInPeriodVnd,
    paidInPeriodVnd,
    allTimeAccruedVnd,
    allTimePaidVnd,
    allTimeRecordsCount: rows.length,
    byDateRows,
  };
}

async function getManagerCashOnHandSnapshot(
  supabase: SupabaseClient,
  managerId: string,
  preset: ManagerCashPeriodPreset,
): Promise<ManagerCashOnHandSnapshot> {
  const { fromYmd, toInclusiveYmd, toExclusiveYmd } = managerCashPeriodBounds(preset);
  const periodStartIso = `${fromYmd}T00:00:00.000Z`;
  const periodEndExclusiveIso = `${toExclusiveYmd}T00:00:00.000Z`;
  const allStartIso = "2010-01-01T00:00:00.000Z";
  const tomorrowYmd = nextDayYmd(localDateString());
  const allEndExclusiveIso = `${tomorrowYmd}T00:00:00.000Z`;

  const { data: bkRows } = await supabase.from("bookings").select("id").eq("manager_id", managerId).is("deleted_at", null);
  const bookingIds = ((bkRows as { id: string }[] | null) || []).map((b) => b.id);

  const payRows: ManagerPayRow[] = [];
  for (let i = 0; i < bookingIds.length; i += MANAGER_CASH_PAYMENTS_CHUNK) {
    const chunk = bookingIds.slice(i, i + MANAGER_CASH_PAYMENTS_CHUNK);
    if (!chunk.length) continue;
    const { data } = await supabase.from("payments").select("amount_vnd,kind,created_at").in("booking_id", chunk);
    payRows.push(...(((data as ManagerPayRow[] | null) || [])));
  }

  const receivedInPeriodVnd = sumManagerBookingPaymentFlow(payRows, periodStartIso, periodEndExclusiveIso);
  const allTimeReceivedVnd = sumManagerBookingPaymentFlow(payRows, allStartIso, allEndExclusiveIso);

  let hoList: { amount_vnd: number | string; received_at: string }[] = [];
  const hoRes = await supabase
    .from("tour_office_cash_handovers")
    .select("amount_vnd,received_at")
    .eq("employee_id", managerId)
    .eq("holder_role", "manager");
  if (!hoRes.error && hoRes.data) {
    hoList = hoRes.data as { amount_vnd: number | string; received_at: string }[];
  }

  const handedToOfficeInPeriodVnd = sumManagerHandovers(hoList, periodStartIso, periodEndExclusiveIso);
  const allTimeHandedVnd = sumManagerHandovers(hoList, allStartIso, allEndExclusiveIso);
  const outstandingAllTimeVnd = Math.max(0, allTimeReceivedVnd - allTimeHandedVnd);

  return {
    preset,
    periodLabelRu: managerCashPeriodLabelRu(preset, fromYmd, toInclusiveYmd),
    rangeFromYmd: fromYmd,
    rangeToInclusiveYmd: toInclusiveYmd,
    receivedInPeriodVnd,
    handedToOfficeInPeriodVnd,
    outstandingAllTimeVnd,
    allTimeReceivedVnd,
    allTimeHandedVnd,
  };
}

async function getEmployeeMonthStats(
  supabase: SupabaseClient,
  employeeId: string,
  role: Role,
): Promise<EmployeeMonthStats> {
  const empty: EmployeeMonthStats = { daysOffMonthToDate: 0, activityMonthToDate: 0 };
  try {
    const todayYmd = localDateString();
    const d = parseYmdLocal(todayYmd) ?? new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthStartYmd = localDateString(monthStart);
    const rangeEndExclusive = nextDayYmd(todayYmd);
    const startIso = `${monthStartYmd}T00:00:00.000Z`;
    const endIso = `${rangeEndExclusive}T00:00:00.000Z`;

    let daysOff = 0;
    if (role === "manager" || role === "chief_manager") {
      const off = await supabase
        .from("manager_days_off")
        .select("id", { count: "exact", head: true })
        .eq("manager_id", employeeId)
        .gte("day_off", monthStartYmd)
        .lte("day_off", todayYmd);
      if (!off.error && off.count != null) daysOff = off.count;
    } else if (role === "guide" || role === "chief_guide") {
      const off = await supabase
        .from("guide_days_off")
        .select("id", { count: "exact", head: true })
        .eq("guide_id", employeeId)
        .gte("day_off", monthStartYmd)
        .lte("day_off", todayYmd);
      if (!off.error && off.count != null) daysOff = off.count;
    }

    let activity = 0;
    if (role === "manager" || role === "chief_manager") {
      const bk = await supabase.from("bookings").select("id").eq("manager_id", employeeId).is("deleted_at", null);
      const ids = ((bk.data as { id: string }[] | null) || []).map((r) => r.id);
      if (ids.length) {
        const { count } = await supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .in("booking_id", ids)
          .gte("created_at", startIso)
          .lt("created_at", endIso);
        activity = count ?? 0;
      }
    } else if (role === "guide" || role === "chief_guide") {
      const tg = await supabase.from("tour_guides").select("tour_id").eq("guide_id", employeeId);
      const tourIds = [...new Set(((tg.data as { tour_id: string }[] | null) || []).map((r) => r.tour_id))];
      if (tourIds.length) {
        const tr = await supabase.from("tours").select("id,start_at").in("id", tourIds);
        for (const t of (tr.data as { start_at: string }[] | null) || []) {
          const sa = t.start_at;
          if (sa >= startIso && sa < endIso) activity += 1;
        }
      }
    }

    return { daysOffMonthToDate: daysOff, activityMonthToDate: activity };
  } catch {
    return empty;
  }
}

async function loadEmployeeBonusForCard(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<{
  bonusPendingVnd: number;
  bonusPaidVnd: number;
  bonusRecords: EmployeeBonusRecordRow[];
}> {
  const empty: {
    bonusPendingVnd: number;
    bonusPaidVnd: number;
    bonusRecords: EmployeeBonusRecordRow[];
  } = { bonusPendingVnd: 0, bonusPaidVnd: 0, bonusRecords: [] };
  const res = await supabase
    .from("employee_bonus_records")
    .select("id,amount_vnd,note,accrued_at,planned_pay_date,paid_at")
    .eq("employee_id", employeeId)
    .order("accrued_at", { ascending: false })
    .limit(100);
  if (res.error) {
    if (/employee_bonus|relation|does not exist/i.test(String(res.error.message))) return empty;
    return empty;
  }
  let bonusPendingVnd = 0;
  let bonusPaidVnd = 0;
  const bonusRecords: EmployeeBonusRecordRow[] = [];
  for (const r of (res.data as {
    id: string;
    amount_vnd: number | string;
    note: string | null;
    accrued_at: string;
    planned_pay_date: string | null;
    paid_at: string | null;
  }[]) || []) {
    const amt = Math.round(Number(r.amount_vnd || 0));
    if (r.paid_at) bonusPaidVnd += amt;
    else bonusPendingVnd += amt;
    bonusRecords.push({
      id: r.id,
      amountVnd: amt,
      note: r.note ?? null,
      accruedAt: r.accrued_at,
      plannedPayDate: r.planned_pay_date ?? null,
      paidAt: r.paid_at ?? null,
    });
  }
  return { bonusPendingVnd, bonusPaidVnd, bonusRecords };
}

async function loadEmployeeMonthlyPayrollRecords(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<EmployeeMonthlyPayrollRecordRow[]> {
  const res = await supabase
    .from("employee_monthly_payroll_records")
    .select(
      "id,period_ym,calculation_date,gross_salary_vnd,personal_income_tax_vnd,social_insurance_employee_vnd,social_insurance_employer_vnd,net_salary_vnd,paid_date,note,updated_at",
    )
    .eq("employee_id", employeeId)
    .order("period_ym", { ascending: false })
    .limit(48);
  if (res.error) {
    if (/employee_monthly_payroll|relation|does not exist/i.test(String(res.error.message))) return [];
    return [];
  }
  const rows: EmployeeMonthlyPayrollRecordRow[] = [];
  for (const r of (res.data as {
    id: string;
    period_ym: string;
    calculation_date: string | null;
    gross_salary_vnd: number | string;
    personal_income_tax_vnd: number | string;
    social_insurance_employee_vnd: number | string;
    social_insurance_employer_vnd: number | string;
    net_salary_vnd: number | string;
    paid_date: string | null;
    note: string | null;
    updated_at: string;
  }[]) || []) {
    rows.push({
      id: r.id,
      periodYm: r.period_ym,
      calculationDate: r.calculation_date,
      grossSalaryVnd: Math.round(Number(r.gross_salary_vnd || 0)),
      personalIncomeTaxVnd: Math.round(Number(r.personal_income_tax_vnd || 0)),
      socialInsuranceEmployeeVnd: Math.round(Number(r.social_insurance_employee_vnd || 0)),
      socialInsuranceEmployerVnd: Math.round(Number(r.social_insurance_employer_vnd || 0)),
      netSalaryVnd: Math.round(Number(r.net_salary_vnd || 0)),
      paidDate: r.paid_date,
      note: r.note ?? null,
      updatedAt: r.updated_at,
    });
  }
  return rows;
}

async function listEmployeeCashPreviewRows(
  supabase: SupabaseClient,
  employeeId: string,
  employeeRole: Role,
  limit: number,
): Promise<EmployeeCashPreviewRow[]> {
  const rows: EmployeeCashPreviewRow[] = [];

  const payRes = await supabase
    .from("payments")
    .select("amount_vnd,kind,created_at")
    .eq("actor_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(120);
  const payRowsRaw =
    payRes.error && /actor_id|column|does not exist/i.test(String(payRes.error.message))
      ? []
      : ((payRes.data as { amount_vnd: number | string; kind: string; created_at: string }[] | null) || []);
  for (const p of payRowsRaw) {
    const amt = Math.round(Number(p.amount_vnd || 0));
    const refund = p.kind === "refund";
    rows.push({
      at: p.created_at,
      direction: refund ? "out" : "in",
      amountVnd: amt,
      summary: refund ? "Возврат туристу (учёт в кассе)" : `Платёж по брони · ${p.kind}`,
    });
  }

  type ManualLedgerPreviewRow = {
    direction: string;
    amount_vnd: number | string;
    title: string;
    created_at: string;
    employee_id?: string | null;
    employee_income_included?: boolean | null;
  };
  let manualRows: ManualLedgerPreviewRow[] = [];
  let manRes = await supabase
    .from("cash_manual_ledger_entries")
    .select("direction,amount_vnd,title,created_at,employee_id,employee_income_included")
    .or(`created_by.eq.${employeeId},employee_id.eq.${employeeId}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (manRes.error && /employee_income_included|column|does not exist/i.test(String(manRes.error.message))) {
    manRes = (await supabase
      .from("cash_manual_ledger_entries")
      .select("direction,amount_vnd,title,created_at,employee_id")
      .or(`created_by.eq.${employeeId},employee_id.eq.${employeeId}`)
      .order("created_at", { ascending: false })
      .limit(100)) as typeof manRes;
  }
  if (manRes.error && /employee_id|column|does not exist/i.test(String(manRes.error.message))) {
    const manLegacy = await supabase
      .from("cash_manual_ledger_entries")
      .select("direction,amount_vnd,title,created_at")
      .eq("created_by", employeeId)
      .order("created_at", { ascending: false })
      .limit(100);
    manualRows = ((manLegacy.data as ManualLedgerPreviewRow[]) || []);
  } else if (!manRes.error && manRes.data) {
    manualRows = manRes.data as ManualLedgerPreviewRow[];
  }
  if (manualRows.length) {
    for (const m of manualRows) {
      const amt = Math.round(Number(m.amount_vnd || 0));
      const inn = m.direction === "in";
      const title = String(m.title || "").trim();
      const linked = m.employee_id === employeeId;
      const inc = m.employee_income_included;
      let summary =
        linked && title
          ? title
          : `Ручная запись кассы: ${title || "операция"}`;
      if (linked && title && inc === false) {
        summary = `Без дохода: ${title}`;
      }
      rows.push({
        at: m.created_at,
        direction: inn ? "in" : "out",
        amountVnd: amt,
        summary,
      });
    }
  }

  const hoRes = await supabase
    .from("tour_office_cash_handovers")
    .select("amount_vnd,received_at,note")
    .eq("employee_id", employeeId)
    .order("received_at", { ascending: false })
    .limit(100);
  if (!hoRes.error && hoRes.data) {
    for (const h of hoRes.data as { amount_vnd: number | string; received_at: string; note: string | null }[]) {
      const amt = Math.round(Number(h.amount_vnd || 0));
      const note = h.note?.trim();
      rows.push({
        at: h.received_at,
        direction: "in",
        amountVnd: amt,
        summary: note ? `Сдача с тура · ${note}` : "Сдача с тура в центральную кассу",
      });
    }
  }

  if (employeeRole === "guide" || employeeRole === "chief_guide") {
    const gsRes = await supabase
      .from("guide_salary_records")
      .select("amount_vnd,paid_at,status,guide_id")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .eq("guide_id", employeeId)
      .order("paid_at", { ascending: false })
      .limit(100);
    if (!gsRes.error && gsRes.data) {
      for (const g of gsRes.data as {
        amount_vnd: number | string;
        paid_at: string | null;
      }[]) {
        if (!g.paid_at) continue;
        const amt = Math.round(Number(g.amount_vnd || 0));
        rows.push({
          at: g.paid_at,
          direction: "out",
          amountVnd: amt,
          summary: "Выплата по начислению гиду",
        });
      }
    }
  }

  rows.sort((a, b) => b.at.localeCompare(a.at));
  return rows.slice(0, limit);
}

export async function getEmployeeFinanceCardData(
  employeeId: string,
  options?: { managerCashPreset?: ManagerCashPeriodPreset; guideShopPreset?: GuideShopPeriodPreset },
): Promise<EmployeeFinanceCardData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let userRow: Record<string, unknown> | null = null;
  const selUserFull =
    "id,full_name,role,manager_mode,manager_sales_commission_percent,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,payroll_pension_extra_percent,payroll_social_employee_percent,payroll_social_employer_percent,vietnam_mrot_zone,payroll_income_tax_withheld_at,payroll_tax_declaration_filed_at,monthly_payroll_tracking_enabled";
  const selUserNoTaxFlags =
    "id,full_name,role,manager_mode,manager_sales_commission_percent,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,payroll_pension_extra_percent,payroll_social_employee_percent,payroll_social_employer_percent,vietnam_mrot_zone";
  let userTry = await supabase.from("users").select(selUserFull).eq("id", employeeId).maybeSingle();
  if (userTry.error && /manager_mode|column|does not exist/i.test(String(userTry.error.message))) {
    userTry = await supabase
      .from("users")
      .select(
        "id,full_name,role,manager_sales_commission_percent,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,payroll_pension_extra_percent,payroll_social_employee_percent,payroll_social_employer_percent,vietnam_mrot_zone,payroll_income_tax_withheld_at,payroll_tax_declaration_filed_at,monthly_payroll_tracking_enabled",
      )
      .eq("id", employeeId)
      .maybeSingle();
  }
  if (
    userTry.error &&
    /monthly_payroll_tracking_enabled|column|does not exist/i.test(String(userTry.error.message))
  ) {
    userTry = await supabase
      .from("users")
      .select(
        "id,full_name,role,manager_sales_commission_percent,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,payroll_pension_extra_percent,payroll_social_employee_percent,payroll_social_employer_percent,vietnam_mrot_zone,payroll_income_tax_withheld_at,payroll_tax_declaration_filed_at",
      )
      .eq("id", employeeId)
      .maybeSingle();
  }
  if (
    userTry.error &&
    /payroll_income_tax_withheld_at|payroll_tax_declaration_filed_at|column|does not exist/i.test(String(userTry.error.message))
  ) {
    userTry = await supabase.from("users").select(selUserNoTaxFlags).eq("id", employeeId).maybeSingle();
  }
  if (userTry.error && /payroll_|vietnam_mrot_zone|column|does not exist/i.test(String(userTry.error.message))) {
    const legacy = await supabase
      .from("users")
      .select("id,full_name,role,manager_mode,manager_sales_commission_percent")
      .eq("id", employeeId)
      .maybeSingle();
    if (legacy.error || !legacy.data) return null;
    userRow = legacy.data as Record<string, unknown>;
  } else if (userTry.error || !userTry.data) {
    return null;
  } else {
    userRow = userTry.data as Record<string, unknown>;
  }
  const employeeName = String(userRow.full_name);
  const employeeRole = userRow.role as Role;
  const managerModeEnabled = userRow.manager_mode === true;
  const managerActsAsManager =
    employeeRole === "manager" ||
    employeeRole === "chief_manager" ||
    ((employeeRole === "guide" || employeeRole === "chief_guide") && managerModeEnabled);
  const rawPct = userRow.manager_sales_commission_percent as number | string | null | undefined;
  const managerSalesCommissionPercent =
    rawPct != null && rawPct !== "" && Number.isFinite(Number(rawPct)) ? Number(rawPct) : null;

  const baseRaw = userRow.payroll_contribution_base_vnd as number | string | null | undefined;
  const payrollContributionBaseVnd =
    baseRaw != null && baseRaw !== "" && Number.isFinite(Number(baseRaw)) ? Math.max(0, Math.round(Number(baseRaw))) : null;
  const pitRaw = userRow.payroll_personal_income_tax_percent as number | string | null | undefined;
  const payrollPersonalIncomeTaxPercent =
    pitRaw != null && pitRaw !== "" && Number.isFinite(Number(pitRaw)) ? Number(pitRaw) : null;
  const penRaw = userRow.payroll_pension_extra_percent as number | string | null | undefined;
  const payrollPensionExtraPercent =
    penRaw != null && penRaw !== "" && Number.isFinite(Number(penRaw)) ? Number(penRaw) : null;
  const seRaw = userRow.payroll_social_employee_percent as number | string | null | undefined;
  const payrollSocialEmployeePercent =
    seRaw != null && seRaw !== "" && Number.isFinite(Number(seRaw)) ? Number(seRaw) : null;
  const sempRaw = userRow.payroll_social_employer_percent as number | string | null | undefined;
  const payrollSocialEmployerPercent =
    sempRaw != null && sempRaw !== "" && Number.isFinite(Number(sempRaw)) ? Number(sempRaw) : null;
  const z = userRow.vietnam_mrot_zone as string | null | undefined;
  const vietnamMrotZone =
    z === "I" || z === "II" || z === "III" || z === "IV" ? (z as "I" | "II" | "III" | "IV") : null;
  const payrollIncomeTaxWithheldAt =
    userRow.payroll_income_tax_withheld_at != null ? String(userRow.payroll_income_tax_withheld_at) : null;
  const payrollTaxDeclarationFiledAt =
    userRow.payroll_tax_declaration_filed_at != null ? String(userRow.payroll_tax_declaration_filed_at) : null;
  const monthlyPayrollTrackingEnabled = userRow.monthly_payroll_tracking_enabled === true;

  const [advRows, expRows, salRows] = await Promise.all([
    supabase
      .from("tour_advances")
      .select("id,tour_id,kind,amount_vnd,currency,fx_rate_to_vnd,status,note,created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("expenses")
      .select("id,tour_id,amount_vnd,description,created_at,accountant_reviewed_at")
      .eq("created_by", employeeId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("guide_salary_records")
      .select("id,tour_id,amount_vnd,status,kind,note,created_at,paid_at")
      .eq("guide_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  const tourIds = new Set<string>();
  for (const r of ((advRows.data as { tour_id: string }[] | null) || [])) tourIds.add(r.tour_id);
  for (const r of ((expRows.data as { tour_id: string }[] | null) || [])) tourIds.add(r.tour_id);
  for (const r of ((salRows.data as { tour_id: string }[] | null) || [])) tourIds.add(r.tour_id);

  const tourNameById = new Map<string, string>();
  if (tourIds.size) {
    const { data: tours } = await supabase.from("tours").select("id,name").in("id", [...tourIds]);
    for (const t of ((tours as { id: string; name: string }[] | null) || [])) tourNameById.set(t.id, t.name);
  }

  let receivedVnd = 0;
  let spentVnd = 0;
  let accruedVnd = 0;
  let paidVnd = 0;
  const operations: EmployeeFinanceOperationRow[] = [];
  const pendingSalaryRecords: EmployeeFinanceCardData["pendingSalaryRecords"] = [];

  for (const r of ((advRows.data as {
    id: string; tour_id: string; kind: "issue" | "return"; amount_vnd: number | string; currency?: "VND" | "USD" | null; fx_rate_to_vnd?: number | string | null; status: string; note: string | null; created_at: string;
  }[] | null) || [])) {
    const amount = Math.round(Number(r.amount_vnd || 0));
    const currency = r.currency === "USD" ? "USD" : "VND";
    const fxRateToVnd = Math.max(1, Number(r.fx_rate_to_vnd || 1));
    const sourceAmount = currency === "USD" ? Number((amount / fxRateToVnd).toFixed(2)) : amount;
    const status = (["created", "pending", "approved", "paid", "rejected"].includes(r.status) ? r.status : "approved") as EmployeeFinanceOperationRow["status"];
    if (status !== "rejected") {
      if (r.kind === "issue" && (status === "approved" || status === "paid")) receivedVnd += amount;
      if (r.kind === "return" && (status === "approved" || status === "paid")) spentVnd += amount;
    }
    operations.push({
      id: `adv:${r.id}`,
      createdAt: r.created_at,
      kind: r.kind === "issue" ? "advance_issue" : "advance_return",
      tourId: r.tour_id,
      tourName: tourNameById.get(r.tour_id) ?? null,
      currency,
      amount: sourceAmount,
      fxRateToVnd,
      amountVnd: amount,
      status,
      note: r.note ?? null,
    });
  }

  for (const r of ((expRows.data as {
    id: string; tour_id: string; amount_vnd: number | string; description: string; created_at: string; accountant_reviewed_at?: string | null;
  }[] | null) || [])) {
    const amount = Math.round(Number(r.amount_vnd || 0));
    const approved = Boolean(r.accountant_reviewed_at);
    if (approved) spentVnd += amount;
    operations.push({
      id: `exp:${r.id}`,
      createdAt: r.created_at,
      kind: "expense",
      tourId: r.tour_id,
      tourName: tourNameById.get(r.tour_id) ?? null,
      currency: "VND",
      amount,
      fxRateToVnd: 1,
      amountVnd: amount,
      status: approved ? "approved" : "pending",
      note: r.description ?? null,
    });
  }

  for (const r of ((salRows.data as {
    id: string; tour_id: string; amount_vnd: number | string; status: string; kind?: string | null; note?: string | null; created_at: string; paid_at?: string | null;
  }[] | null) || [])) {
    const amount = Math.round(Number(r.amount_vnd || 0));
    const isPaid = String(r.status).toLowerCase() === "paid";
    accruedVnd += amount;
    if (isPaid) paidVnd += amount;
    if (isPaid) {
      operations.push({
        id: `pay:${r.id}`,
        createdAt: r.paid_at ?? r.created_at,
        kind: "payout",
        tourId: r.tour_id,
        tourName: tourNameById.get(r.tour_id) ?? null,
        currency: "VND",
        amount,
        fxRateToVnd: 1,
        amountVnd: amount,
        status: "paid",
        note: r.note ?? "Выплата",
      });
    } else {
      operations.push({
        id: `acr:${r.id}`,
        createdAt: r.created_at,
        kind: "accrual",
        tourId: r.tour_id,
        tourName: tourNameById.get(r.tour_id) ?? null,
        currency: "VND",
        amount,
        fxRateToVnd: 1,
        amountVnd: amount,
        status: "approved",
        note: r.note ?? r.kind ?? null,
      });
      pendingSalaryRecords.push({
        id: r.id,
        tourId: r.tour_id,
        tourName: tourNameById.get(r.tour_id) ?? null,
        amountVnd: amount,
        createdAt: r.created_at,
      });
    }
  }

  /** Бухг. зарплата в tours без строки guide_salary_records - как в getGuideDashboardEarningsStats. */
  if (employeeRole === "guide" || employeeRole === "chief_guide") {
    const salData = (salRows.data as { tour_id: string; kind?: string | null }[] | null) ?? [];
    const accountantSyncedTourIds = new Set(
      salData.filter((r) => r.kind === ACCOUNTANT_TOUR_SALARY_KIND).map((r) => r.tour_id),
    );
    const { data: myTg } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", employeeId);
    const myTourIds = [...new Set(((myTg as { tour_id: string }[] | null) ?? []).map((r) => r.tour_id))];
    if (myTourIds.length) {
      const { data: allAssign } = await supabase
        .from("tour_guides")
        .select("tour_id,guide_id,is_primary")
        .in("tour_id", myTourIds);
      const byTour = new Map<string, { guide_id: string; is_primary: boolean }[]>();
      for (const r of (allAssign as { tour_id: string; guide_id: string; is_primary: boolean }[] | null) ?? []) {
        const list = byTour.get(r.tour_id) ?? [];
        list.push({ guide_id: r.guide_id, is_primary: Boolean(r.is_primary) });
        byTour.set(r.tour_id, list);
      }
      const primaryByTour = new Map<string, string>();
      for (const [tid, list] of byTour) {
        const primary = list.find((x) => x.is_primary) ?? list[0];
        if (primary) primaryByTour.set(tid, primary.guide_id);
      }
      const { data: acctTours } = await supabase
        .from("tours")
        .select("id,name,start_at,accountant_guide_salary_vnd")
        .in("id", myTourIds);
      for (const t of (acctTours as {
        id: string;
        name: string;
        start_at: string;
        accountant_guide_salary_vnd?: number | string | null;
      }[] | null) ?? []) {
        if (primaryByTour.get(t.id) !== employeeId) continue;
        if (accountantSyncedTourIds.has(t.id)) continue;
        const raw = t.accountant_guide_salary_vnd;
        const amt = raw == null || raw === "" ? 0 : Math.max(0, Math.round(Number(raw)));
        if (amt <= 0) continue;
        tourNameById.set(t.id, t.name);
        accruedVnd += amt;
        paidVnd += amt;
        const createdAt = `${startDateOnly(t.start_at)}T12:00:00.000Z`;
        operations.push({
          id: `pay:accountant-tour:${t.id}`,
          createdAt,
          kind: "payout",
          tourId: t.id,
          tourName: t.name,
          currency: "VND",
          amount: amt,
          fxRateToVnd: 1,
          amountVnd: amt,
          status: "paid",
          note: "Зарплата по туру (бухгалтерия)",
        });
      }
    }
  }

  operations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const shouldReturnVnd = Math.max(0, receivedVnd - spentVnd);
  const shouldReceiveVnd = Math.max(0, accruedVnd - paidVnd);

  let managerCashOnHand: ManagerCashOnHandSnapshot | null = null;
  if (managerActsAsManager) {
    managerCashOnHand = await getManagerCashOnHandSnapshot(supabase, employeeId, options?.managerCashPreset ?? "week");
  }

  let guideShopSnapshot: GuideShopSnapshot | null = null;
  if (employeeRole === "guide" || employeeRole === "chief_guide") {
    guideShopSnapshot = await getGuideShopSnapshot(supabase, employeeId, options?.guideShopPreset ?? "month");
  }

  let managerFullSettlement: ManagerFullSettlementSnapshot | null = null;
  let managerModePerformance: EmployeeFinanceCardData["managerModePerformance"] = null;
  if (managerActsAsManager) {
    const dayYmd = localDateString();
    const monthYyyyMm = dayYmd.slice(0, 7);
    const salesStats = await getManagerDashboardSalesStats(employeeId, monthYyyyMm, dayYmd);
    const pct = salesStats.salesCommissionPercent;
    const commissionFromBookingsVnd = Math.round((salesStats.allTimeSalesTotalVnd * pct) / 100);
    const ticketProfitAllTimeVnd = salesStats.ticketAllTimeProfitVnd;
    const commissionTotalEstimateVnd = commissionFromBookingsVnd + ticketProfitAllTimeVnd;
    const cashToHandInFromBookingsVnd = Math.max(0, managerCashOnHand?.outstandingAllTimeVnd ?? 0);
    const netAfterBookingsCashVsCommissionVnd = commissionTotalEstimateVnd - cashToHandInFromBookingsVnd;
    managerFullSettlement = {
      salesCommissionPercent: pct,
      commissionFromBookingsVnd,
      ticketProfitAllTimeVnd,
      commissionTotalEstimateVnd,
      cashToHandInFromBookingsVnd,
      netAfterBookingsCashVsCommissionVnd,
    };
    // "Сколько людей закрыл": считаем по всем броням, привязанным к менеджеру.
    const { data: mgrBookings } = await supabase
      .from("bookings")
      .select("id,tour_id,adults,children,infants")
      .eq("manager_id", employeeId)
      .is("deleted_at", null);
    const mgrRows =
      ((mgrBookings as {
        id: string;
        tour_id: string;
        adults: number | string | null;
        children: number | string | null;
        infants: number | string | null;
      }[] | null) ?? []);
    const tourIds = [...new Set(mgrRows.map((x) => x.tour_id).filter(Boolean))];
    const startYmdByTour = new Map<string, string>();
    if (tourIds.length > 0) {
      const { data: tRows } = await supabase.from("tours").select("id,start_at").in("id", tourIds);
      for (const t of (tRows as { id: string; start_at: string }[] | null) ?? []) {
        startYmdByTour.set(t.id, startDateOnly(t.start_at));
      }
    }
    let monthBookingsCount = 0;
    let monthPaxClosed = 0;
    let allPaxClosed = 0;
    for (const b of mgrRows) {
      const pax =
        Math.max(0, Number(b.adults || 0)) +
        Math.max(0, Number(b.children || 0)) +
        Math.max(0, Number(b.infants || 0));
      allPaxClosed += pax;
      const ymd = startYmdByTour.get(b.tour_id) ?? "";
      if (ymd.startsWith(monthYyyyMm)) {
        monthBookingsCount += 1;
        monthPaxClosed += pax;
      }
    }
    managerModePerformance = {
      monthBookingsCount,
      monthPaxClosed,
      allBookingsCount: mgrRows.length,
      allPaxClosed,
    };
  }

  // Revshare для любых сотрудников: если сотрудник не работает в контуре «менеджерского»
  // расчёта, но является бенефициаром сплита по броням, добавляем это в начисления.
  if (!managerActsAsManager) {
    const dayYmd = localDateString();
    const monthYyyyMm = dayYmd.slice(0, 7);
    const salesStats = await getManagerDashboardSalesStats(employeeId, monthYyyyMm, dayYmd);
    const pct = salesStats.salesCommissionPercent;
    const revshareAccruedVnd = Math.round((salesStats.allTimeSalesTotalVnd * pct) / 100);
    if (revshareAccruedVnd > 0) {
      accruedVnd += revshareAccruedVnd;
      operations.push({
        id: "accrual:booking-revshare",
        createdAt: `${dayYmd}T12:00:00.000Z`,
        kind: "accrual",
        tourId: null,
        tourName: "Revshare по броням",
        currency: "VND",
        amount: revshareAccruedVnd,
        fxRateToVnd: 1,
        amountVnd: revshareAccruedVnd,
        status: "approved",
        note: `Процент с продаж по сплитам брони (${pct}%)`,
      });
    }
  }

  const [monthStats, cashPreviewRows, bonusPack, monthlyPayrollRecords] = await Promise.all([
    getEmployeeMonthStats(supabase, employeeId, employeeRole),
    listEmployeeCashPreviewRows(supabase, employeeId, employeeRole, 50),
    loadEmployeeBonusForCard(supabase, employeeId),
    loadEmployeeMonthlyPayrollRecords(supabase, employeeId),
  ]);

  return {
    employeeId,
    employeeName,
    employeeRole,
    managerModeEnabled,
    managerSalesCommissionPercent:
      managerActsAsManager ? managerSalesCommissionPercent : undefined,
    payrollContributionBaseVnd,
    payrollPersonalIncomeTaxPercent,
    payrollPensionExtraPercent,
    payrollSocialEmployeePercent,
    payrollSocialEmployerPercent,
    vietnamMrotZone,
    payrollIncomeTaxWithheldAt,
    payrollTaxDeclarationFiledAt,
    managerCashOnHand,
    guideShopSnapshot,
    managerFullSettlement,
    managerModePerformance,
    receivedVnd,
    spentVnd,
    shouldReturnVnd,
    accruedVnd,
    paidVnd,
    shouldReceiveVnd,
    operations,
    pendingSalaryRecords,
    monthStats,
    cashPreviewRows,
    bonusPendingVnd: bonusPack.bonusPendingVnd,
    bonusPaidVnd: bonusPack.bonusPaidVnd,
    bonusRecords: bonusPack.bonusRecords,
    monthlyPayrollTrackingEnabled,
    monthlyPayrollRecords,
  };
}

export type CashBoxBalance = {
  cashVnd: number;
  bankVnd: number;
  cashUsd: number;
};

export async function getCashBoxBalance(): Promise<CashBoxBalance> {
  const supabase = getSupabaseAdmin();
  const empty: CashBoxBalance = { cashVnd: 0, bankVnd: 0, cashUsd: 0 };
  if (!supabase) return empty;

  const { data: ledgerRows } = await supabase
    .from("cash_manual_ledger_entries")
    .select("direction, payment_kind, currency_code, amount_vnd, amount_foreign");

  let cashVnd = 0;
  let bankVnd = 0;
  let cashUsd = 0;

  for (const r of (ledgerRows as { direction: string; payment_kind: string; currency_code: string; amount_vnd: unknown; amount_foreign: unknown }[] | null) ?? []) {
    const sign = r.direction === "in" ? 1 : -1;
    const vnd = Math.round(Number(r.amount_vnd || 0));
    const foreign = Number(r.amount_foreign || 0);
    const cur = String(r.currency_code || "VND").toUpperCase();
    const kind = r.payment_kind;

    if (kind === "bank_transfer") {
      bankVnd += sign * vnd;
    } else if (cur === "USD" && Number.isFinite(foreign) && foreign > 0) {
      cashUsd += sign * foreign;
    } else {
      cashVnd += sign * vnd;
    }
  }

  const { data: handoverRows } = await supabase
    .from("tour_office_cash_handovers")
    .select("amount_vnd, amount_usd, channel_id");

  type HandoverRow = { amount_vnd: unknown; amount_usd: unknown; channel_id: string | null };
  const hRows = (handoverRows as HandoverRow[] | null) ?? [];
  const handoverChannelIds = [...new Set(hRows.map((h) => h.channel_id).filter((x): x is string => Boolean(x)))];
  const channelById = new Map<string, { slug: string; expectsUsd: boolean }>();
  if (handoverChannelIds.length > 0) {
    const { data: chRows } = await supabase
      .from("office_cash_handover_channels")
      .select("id, slug, expects_usd_amount")
      .in("id", handoverChannelIds);
    for (const c of (chRows as { id: string; slug: string; expects_usd_amount: boolean }[] | null) ?? []) {
      channelById.set(c.id, { slug: String(c.slug || ""), expectsUsd: Boolean(c.expects_usd_amount) });
    }
  }

  for (const h of hRows) {
    const vnd = Math.round(Number(h.amount_vnd || 0));
    const usd = Number(h.amount_usd || 0);
    const ch = h.channel_id ? channelById.get(h.channel_id) : null;
    const slug = ch?.slug ?? "";
    const expectsUsd = ch?.expectsUsd ?? false;

    if (expectsUsd && Number.isFinite(usd) && usd > 0) {
      cashUsd += usd;
    } else if (slug.includes("bank")) {
      bankVnd += vnd;
    } else {
      cashVnd += vnd;
    }
  }

  return { cashVnd, bankVnd, cashUsd };
}

export type CashDashboardData = {
  currentBalanceVnd: number;
  rows: CashLedgerRow[];
  /** Число записей в полном журнале до среза (при limit/offset совпадает с полным списком; иначе равно rows.length) */
  totalRowCount: number;
};

/** Срез отсортированного журнала кассы (после объединения источников). */
export type CashDashboardMovementsOptions = {
  offset?: number;
  limit?: number | null;
};

/** Фильтр периода для выгрузки отчётов (все движения кассы за интервал включительно). */
export type CashDashboardPeriodFilter = {
  fromYmd: string;
  toYmd: string;
  /** Полные суммы/формулировки по выплатам гидам (как у директора) - для бухгалтерской выгрузки. */
  fullGuideDisclosure?: boolean;
};

export type AccountingTaxEmployeeRow = {
  id: string;
  fullName: string;
  role: Role;
  payrollContributionBaseVnd: number | null;
  payrollPersonalIncomeTaxPercent: number | null;
  vietnamMrotZone: "I" | "II" | "III" | "IV" | null;
  payrollIncomeTaxWithheldAt: string | null;
  payrollTaxDeclarationFiledAt: string | null;
};

function nextDayYmd(ymd: string): string {
  const d = parseYmdLocal(ymd) ?? new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return localDateString(d);
}

function unwrapSupabaseOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function cashPaymentKindRu(kind: string): string {
  if (kind === "deposit") return "предоплата";
  if (kind === "topup") return "доплата";
  if (kind === "refund") return "возврат туристу";
  if (kind === "office_cash") return "оплата в кассе офиса";
  return kind;
}

function cashTourLineRu(tourName: string, startAtIso: string | null | undefined): string {
  const n = tourName.trim() || "тур";
  const iso = startAtIso ? String(startAtIso) : "";
  const ymd = iso ? tourCalendarDateFromStartAtIso(iso) : "";
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return `тур «${n}», ${formatYmdWithWeekdayRu(ymd)}`;
  }
  return `тур «${n}»`;
}

export async function getCashDashboardData(
  _dayYmd: string,
  viewer: { role: Role; id: string } | null = null,
  period?: CashDashboardPeriodFilter | null,
  movements?: CashDashboardMovementsOptions | null,
): Promise<CashDashboardData> {
  const supabase = getSupabaseAdmin();
  const empty: CashDashboardData = { currentBalanceVnd: 0, rows: [], totalRowCount: 0 };
  if (!supabase) return empty;

  const pf = period ?? undefined;
  let rangeStart = "";
  let rangeEndExclusive = "";
  if (pf) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pf.fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(pf.toYmd) || pf.fromYmd > pf.toYmd) {
      return empty;
    }
    rangeStart = `${pf.fromYmd}T00:00:00.000Z`;
    rangeEndExclusive = `${nextDayYmd(pf.toYmd)}T00:00:00.000Z`;
  }
  const viewerEff =
    pf?.fullGuideDisclosure && viewer
      ? ({ role: "director" as Role, id: viewer.id } as { role: Role; id: string })
      : viewer;

  const rows: CashLedgerRow[] = [];
  let currentBalanceVnd = 0;

  function pushLedgerRow(r: Omit<CashLedgerRow, "searchText"> & { searchText?: string }): void {
    const base = (r.searchText ?? `${r.summary} ${r.note ?? ""} ${r.kind} ${r.amountVnd}`).toLowerCase();
    const bits: string[] = [base];
    const byName = r.recordedByName?.trim();
    if (byName) {
      bits.push(byName.toLowerCase(), "записал", "оформил", "учёл", "учет", "отметил", "автор");
    }
    if (r.attachmentUrl?.trim()) {
      bits.push("фото", "чек", "вложение", "скан", "подтверждение", "прикреплено");
    }
    const searchText = bits.join(" ");
    const row: CashLedgerRow = { ...(r as Omit<CashLedgerRow, "searchText">), searchText };
    const signed = row.direction === "in" ? row.amountVnd : -row.amountVnd;
    currentBalanceVnd += signed;
    rows.push(row);
  }

  let payQ = supabase.from("payments").select("id,booking_id,amount_vnd,kind,created_at,actor_id");
  if (pf) {
    payQ = payQ.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
  }
  const payRes = await payQ.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 12_000 : 450);
  const payments =
    (payRes.data as {
      id: string;
      booking_id: string;
      amount_vnd: number | string;
      kind: string;
      created_at: string;
      actor_id: string | null;
    }[] | null) || [];

  const bookingIds = [...new Set(payments.map((p) => p.booking_id).filter(Boolean))];
  const bookingTourById = new Map<
    string,
    { customerName: string; tourLine: string; onlineCode: string | null; tourId: string | null; managerId: string | null }
  >();
  if (bookingIds.length > 0) {
    type BkRow = {
      id: string;
      customer_name: string;
      tour_id?: string | null;
      manager_id?: string | null;
      online_code?: string | null;
      tours: unknown;
    };
    const bkWithOn = await supabase
      .from("bookings")
      .select("id,customer_name,online_code,tour_id,manager_id,tours(name,start_at)")
      .in("id", bookingIds);
    let bkList: BkRow[] | null = null;
    if (!bkWithOn.error && bkWithOn.data) {
      bkList = bkWithOn.data as BkRow[];
    } else if (bkWithOn.error && /online_code|column|does not exist/i.test(String(bkWithOn.error.message))) {
      const bkNoOn = await supabase
        .from("bookings")
        .select("id,customer_name,tour_id,manager_id,tours(name,start_at)")
        .in("id", bookingIds);
      if (!bkNoOn.error && bkNoOn.data) {
        bkList = bkNoOn.data as BkRow[];
      }
    }
    if (bkList) {
      for (const b of bkList) {
        const t = unwrapSupabaseOne(b.tours) as { name?: string; start_at?: string } | null;
        const oc = b.online_code != null && String(b.online_code).trim() ? String(b.online_code).trim() : null;
        const tid = b.tour_id != null && String(b.tour_id).trim() ? String(b.tour_id).trim() : null;
        bookingTourById.set(b.id, {
          customerName: String(b.customer_name || "").trim() || "турист",
          tourLine: cashTourLineRu(String(t?.name || ""), t?.start_at ?? null),
          onlineCode: oc,
          tourId: tid,
          managerId: b.manager_id ? String(b.manager_id).trim() : null,
        });
      }
    }
  }
  const actorIds = [...new Set(payments.map((p) => p.actor_id).filter((x): x is string => Boolean(x)))];
  const actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const actRes = await supabase.from("users").select("id,full_name").in("id", actorIds);
    for (const u of (actRes.data as { id: string; full_name: string }[] | null) || []) {
      actorNameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
    }
  }

  for (const p of payments) {
    if (viewerEff?.role === "chief_manager") {
      if (p.kind !== "deposit" && p.kind !== "topup" && p.kind !== "office_cash" && p.kind !== "refund") continue;
    }
    const amount = Math.round(Number(p.amount_vnd || 0));
    const isRefund = p.kind === "refund";
    const direction: "in" | "out" = isRefund ? "out" : "in";
    const bk = bookingTourById.get(p.booking_id);
    const who = bk?.customerName || "турист";
    const tourPart = bk?.tourLine || "бронь (тур не подгружен)";
    const onPart = bk?.onlineCode ? ` · ${bk.onlineCode}` : " · без кода ON";
    const kindRu = cashPaymentKindRu(p.kind);
    const actorPart = p.actor_id ? actorNameById.get(p.actor_id) : null;
    const summary =
      direction === "in"
        ? `Поступление в кассу: ${kindRu} · турист ${who}${onPart} · ${tourPart}${actorPart ? ` · учёл(а): ${actorPart}` : ""}`
        : `Выплата из кассы: ${kindRu} · ${who}${onPart} · ${tourPart}${actorPart ? ` · оформил(а): ${actorPart}` : ""}`;
    pushLedgerRow({
      id: `pay:${p.id}`,
      at: p.created_at,
      direction,
      amountVnd: amount,
      kind: isRefund ? "refund" : "tour_income",
      sourceId: p.id,
      summary,
      note: null,
      recordedByName: actorPart ?? null,
      linkedTourId: bk?.tourId ?? null,
    });
  }

  let advQ = supabase
    .from("tour_advances")
    .select("id,tour_id,employee_id,created_by,kind,amount_vnd,status,note,created_at");
  if (pf) {
    advQ = advQ.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
  }
  const advRes = await advQ.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 320);
  const advances =
    (advRes.data as {
      id: string;
      tour_id: string;
      employee_id: string;
      created_by: string | null;
      kind: "issue" | "return";
      amount_vnd: number | string;
      status: string;
      note: string | null;
      created_at: string;
    }[] | null) || [];

  const advTourIds = [...new Set(advances.map((a) => a.tour_id))];
  const advEmpIds = [...new Set(advances.map((a) => a.employee_id))];
  const advCreatorIds = [...new Set(advances.map((a) => a.created_by).filter((x): x is string => Boolean(x)))];
  const tourMetaById = new Map<string, { name: string; startAt: string | null }>();
  if (advTourIds.length > 0) {
    const tRes = await supabase.from("tours").select("id,name,start_at").in("id", advTourIds);
    for (const t of (tRes.data as { id: string; name: string; start_at: string | null }[] | null) || []) {
      tourMetaById.set(t.id, { name: String(t.name || ""), startAt: t.start_at != null ? String(t.start_at) : null });
    }
  }
  const empNameById = new Map<string, string>();
  const advUserIds = [...new Set([...advEmpIds, ...advCreatorIds])];
  if (advUserIds.length > 0) {
    const uRes = await supabase.from("users").select("id,full_name").in("id", advUserIds);
    for (const u of (uRes.data as { id: string; full_name: string }[] | null) || []) {
      empNameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
    }
  }

  for (const a of advances) {
    if (a.status === "rejected") continue;
    const amount = Math.round(Number(a.amount_vnd || 0));
    const direction: "in" | "out" = a.kind === "return" ? "in" : "out";
    const tm = tourMetaById.get(a.tour_id);
    const tourLine = cashTourLineRu(tm?.name || "тур", tm?.startAt);
    const emp = empNameById.get(a.employee_id) || "сотрудник";
    const noteTrim = a.note?.trim();
    const creatorName = a.created_by ? empNameById.get(a.created_by) : null;
    const byCreator = creatorName ? ` · оформил(а): ${creatorName}` : "";
    const summary =
      direction === "in"
        ? `Возврат в кассу подотчёта · ${emp} · ${tourLine}${noteTrim ? ` · ${noteTrim}` : ""}${byCreator}`
        : `Выдача из кассы подотчёт · ${emp} · ${tourLine}${noteTrim ? ` · ${noteTrim}` : ""}${byCreator}`;
    pushLedgerRow({
      id: `adv:${a.id}`,
      at: a.created_at,
      direction,
      amountVnd: amount,
      kind: a.kind === "return" ? "advance_return" : "advance_issue",
      sourceId: a.id,
      summary,
      note: noteTrim || null,
      recordedByName: creatorName ?? null,
      linkedTourId: a.tour_id,
    });
  }

  const gsSelectBase =
    "id,tour_id,guide_id,amount_vnd,paid_at,status,kind,note,outside_total_vnd,paid_by,attachment_url";
  const gsSelectWithShopAcct = `${gsSelectBase},shop_accountant_confirmed_at,shop_accountant_office_vnd,shop_accountant_guide_vnd,shop_driver_paid_by_guide_vnd`;

  type GsCashRow = {
    id: string;
    tour_id: string;
    guide_id: string;
    amount_vnd: number | string;
    paid_at: string | null;
    status: string;
    kind: string | null;
    note: string | null;
    outside_total_vnd: number | string | null;
    paid_by: string | null;
    attachment_url: string | null;
    shop_accountant_confirmed_at?: string | null;
    shop_accountant_office_vnd?: number | string | null;
    shop_accountant_guide_vnd?: number | string | null;
    shop_driver_paid_by_guide_vnd?: number | string | null;
  };

  let gsSelect = gsSelectWithShopAcct;
  let gsPaidRes = await (() => {
    let q = supabase.from("guide_salary_records").select(gsSelect).eq("status", "paid");
    if (pf) {
      q = q.gte("paid_at", rangeStart).lt("paid_at", rangeEndExclusive);
    }
    return q.order("paid_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 220);
  })();

  if (gsPaidRes.error && /shop_accountant|shop_driver_paid|column|does not exist/i.test(String(gsPaidRes.error.message))) {
    gsSelect = gsSelectBase;
    gsPaidRes = await (() => {
      let q = supabase.from("guide_salary_records").select(gsSelect).eq("status", "paid");
      if (pf) {
        q = q.gte("paid_at", rangeStart).lt("paid_at", rangeEndExclusive);
      }
      return q.order("paid_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 220);
    })();
  }

  let gsRows: GsCashRow[] = (gsPaidRes.data as GsCashRow[] | null) || [];

  if (!gsPaidRes.error && gsSelect === gsSelectWithShopAcct) {
    let extraQ = supabase
      .from("guide_salary_records")
      .select(gsSelectWithShopAcct)
      .eq("kind", "shop")
      .eq("status", "pending")
      .not("shop_accountant_confirmed_at", "is", null);
    if (pf) {
      extraQ = extraQ
        .gte("shop_accountant_confirmed_at", rangeStart)
        .lt("shop_accountant_confirmed_at", rangeEndExclusive);
    }
    const extraRes = await extraQ.order("shop_accountant_confirmed_at", { ascending: Boolean(pf) }).limit(pf ? 2_000 : 80);
    if (!extraRes.error && extraRes.data?.length) {
      const seen = new Set(gsRows.map((r) => r.id));
      for (const r of extraRes.data as GsCashRow[]) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          gsRows.push(r);
        }
      }
    }
  }

  const gsTourIds = [...new Set(gsRows.map((s) => s.tour_id))];
  const gsGuideIds = [...new Set(gsRows.map((s) => s.guide_id))];
  const gsPaidByIds = [...new Set(gsRows.map((s) => s.paid_by).filter((x): x is string => Boolean(x)))];
  const gsTourMetaById = new Map<string, { name: string; startAt: string | null }>();
  if (gsTourIds.length > 0) {
    const tRes = await supabase.from("tours").select("id,name,start_at").in("id", gsTourIds);
    for (const t of (tRes.data as { id: string; name: string; start_at: string | null }[] | null) || []) {
      gsTourMetaById.set(t.id, { name: String(t.name || ""), startAt: t.start_at != null ? String(t.start_at) : null });
    }
  }
  const guideNameById = new Map<string, string>();
  const gsUserIds = [...new Set([...gsGuideIds, ...gsPaidByIds])];
  if (gsUserIds.length > 0) {
    const uRes = await supabase.from("users").select("id,full_name").in("id", gsUserIds);
    for (const u of (uRes.data as { id: string; full_name: string }[] | null) || []) {
      guideNameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
    }
  }

  for (const s of gsRows) {
    const parsedShopEarly = parseShopExtraNote(s.note);
    const isShopKind = guideSalaryPayoutIsOfficialShop(s.kind, s.note);
    const hasShopAcctCols = gsSelect === gsSelectWithShopAcct;
    if (isShopKind && hasShopAcctCols) {
      const c = s.shop_accountant_confirmed_at;
      if (c == null || String(c).trim() === "") continue;
    }

    const paidAtOk = Boolean(s.paid_at && String(s.paid_at).trim());
    if (!paidAtOk) {
      const allowPendingShopIn =
        isShopKind &&
        hasShopAcctCols &&
        isShopMoneyWithGuideSettlement(parsedShopEarly.settlement) &&
        s.shop_accountant_confirmed_at != null &&
        String(s.shop_accountant_confirmed_at).trim() !== "";
      if (!allowPendingShopIn) continue;
    }

    const amount = Math.round(Number(s.amount_vnd || 0));
    const tm = gsTourMetaById.get(s.tour_id);
    const tourLine = cashTourLineRu(tm?.name || "тур", tm?.startAt);
    const guide = guideNameById.get(s.guide_id) || "гид";
    const paidByName = s.paid_by ? guideNameById.get(s.paid_by) : null;
    const attGsl = s.attachment_url?.trim() || null;
    const outsideRaw = s.outside_total_vnd;
    const outsideTotalVnd =
      outsideRaw != null && outsideRaw !== "" ? Number(outsideRaw) : null;
    const ot = Number.isFinite(outsideTotalVnd as number) ? (outsideTotalVnd as number) : null;
    const confidentialOutside =
      guideSalaryPayoutIsOutsideShopConfidential(s.kind, s.note, ot) &&
      !canViewConfidentialGuidePayoutDetail(viewerEff, s.guide_id);
    if (confidentialOutside) {
      continue;
    }
    const parsedShop = parseShopExtraNote(s.note);
    const shopMoneyWithGuide =
      guideSalaryPayoutIsOfficialShop(s.kind, s.note) && isShopMoneyWithGuideSettlement(parsedShop.settlement);
    const direction: "in" | "out" = shopMoneyWithGuide ? "in" : "out";
    const acctOffRaw = s.shop_accountant_office_vnd;
    const acctOff =
      acctOffRaw != null && acctOffRaw !== "" && Number.isFinite(Number(acctOffRaw)) ? Math.round(Number(acctOffRaw)) : null;
    let effectiveOffice = parsedShop.officeVnd != null && parsedShop.officeVnd > 0 ? parsedShop.officeVnd : 0;
    if (acctOff != null && acctOff >= 0) effectiveOffice = acctOff;
    const ledgerAmount = shopMoneyWithGuide && effectiveOffice > 0 ? effectiveOffice : amount;
    const built = buildGuideSalaryCashLedgerSummary({
      kind: s.kind,
      note: s.note,
      outsideTotalVnd: ot,
      guideName: guide,
      guideId: s.guide_id,
      tourLine,
      amountVnd: ledgerAmount,
      viewer: viewerEff,
      cashFlow: direction,
    });
    const summaryGsl = paidByName ? `${built.summary} · отметил(а) выплату: ${paidByName}` : built.summary;
    const searchGsl = paidByName ? `${built.searchText} ${paidByName}`.toLowerCase() : built.searchText;
    const atIso =
      (s.paid_at && String(s.paid_at).trim()) ||
      (s.shop_accountant_confirmed_at && String(s.shop_accountant_confirmed_at).trim()) ||
      "";
    if (!atIso) continue;
    pushLedgerRow({
      id: `gsl:${s.id}`,
      at: atIso,
      direction,
      amountVnd: ledgerAmount,
      kind: "payout",
      sourceId: s.id,
      summary: summaryGsl,
      note: built.ledgerNote,
      searchText: searchGsl,
      attachmentUrl: attGsl,
      recordedByName: paidByName ?? null,
      linkedTourId: s.tour_id,
    });
  }

  type ManualLedgerDbRow = {
    id: string;
    direction: "in" | "out";
    amount_vnd: number | string;
    title: string;
    note: string | null;
    attachment_url: string | null;
    created_at: string;
    created_by: string | null;
    tour_id: string | null;
    booking_id?: string | null;
    category_id?: string | null;
    currency_code?: string | null;
    amount_foreign?: number | string | null;
    fx_rate_to_vnd?: number | string | null;
    payment_kind?: string | null;
    ledger_bucket?: string | null;
    ledger_bucket_ok_at?: string | null;
    rental_point_id?: string | null;
  };
  const manualSelectCore =
    "id,direction,amount_vnd,title,note,attachment_url,created_at,created_by,tour_id,category_id,currency_code,amount_foreign,fx_rate_to_vnd,payment_kind,ledger_bucket,ledger_bucket_ok_at";
  const manualSelectWithBooking = `${manualSelectCore},booking_id`;
  const manualSelectFull = `${manualSelectWithBooking},rental_point_id`;
  const manualSelectCat =
    "id,direction,amount_vnd,title,note,attachment_url,created_at,created_by,tour_id,category_id";
  const manualSelectLegacy = "id,direction,amount_vnd,title,note,attachment_url,created_at,created_by,tour_id";
  let manBase = supabase.from("cash_manual_ledger_entries").select(manualSelectFull);
  if (pf) {
    manBase = manBase.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
  }
  const manTry = await manBase.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
  let manualRaw: ManualLedgerDbRow[] | null = null;
  const manErr0 = manTry.error ? String(manTry.error.message) : "";

  if (!manTry.error && manTry.data) {
    manualRaw = manTry.data as ManualLedgerDbRow[];
  } else if (/rental_point_id|column|does not exist/i.test(manErr0)) {
    let manNoRp = supabase.from("cash_manual_ledger_entries").select(manualSelectWithBooking);
    if (pf) {
      manNoRp = manNoRp.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
    }
    const manNoRpRes = await manNoRp.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
    if (!manNoRpRes.error && manNoRpRes.data) {
      manualRaw = manNoRpRes.data as ManualLedgerDbRow[];
    } else if (manNoRpRes.error && /booking_id|column|does not exist/i.test(String(manNoRpRes.error.message))) {
      let manNoBk = supabase.from("cash_manual_ledger_entries").select(manualSelectCore);
      if (pf) {
        manNoBk = manNoBk.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
      }
      const manNoBkRes = await manNoBk.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
      if (!manNoBkRes.error && manNoBkRes.data) {
        manualRaw = manNoBkRes.data as ManualLedgerDbRow[];
      }
    }
  } else if (/booking_id|column|does not exist/i.test(manErr0)) {
    let manNoBk = supabase.from("cash_manual_ledger_entries").select(manualSelectCore);
    if (pf) {
      manNoBk = manNoBk.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
    }
    const manNoBkRes = await manNoBk.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
    if (!manNoBkRes.error && manNoBkRes.data) {
      manualRaw = manNoBkRes.data as ManualLedgerDbRow[];
    }
  } else if (/ledger_bucket/i.test(manErr0)) {
    const selNoBucket =
      "id,direction,amount_vnd,title,note,attachment_url,created_at,created_by,tour_id,category_id,currency_code,amount_foreign,fx_rate_to_vnd,payment_kind";
    let manRetry = supabase.from("cash_manual_ledger_entries").select(selNoBucket);
    if (pf) {
      manRetry = manRetry.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
    }
    const manRetryRes = await manRetry.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
    if (!manRetryRes.error && manRetryRes.data) {
      manualRaw = manRetryRes.data as ManualLedgerDbRow[];
    }
  }

  if (!manualRaw && /currency_code|payment_kind|amount_foreign|fx_rate|column|does not exist/i.test(manErr0)) {
    let manCatQ = supabase.from("cash_manual_ledger_entries").select(manualSelectCat);
    if (pf) {
      manCatQ = manCatQ.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
    }
    const manCatOnly = await manCatQ.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
    if (!manCatOnly.error && manCatOnly.data) {
      manualRaw = manCatOnly.data as ManualLedgerDbRow[];
    } else if (manCatOnly.error && /category_id|column|does not exist/i.test(String(manCatOnly.error.message))) {
      let manNoCatQ = supabase.from("cash_manual_ledger_entries").select(manualSelectLegacy);
      if (pf) {
        manNoCatQ = manNoCatQ.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
      }
      const manNoCat = await manNoCatQ.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
      if (!manNoCat.error && manNoCat.data) {
        manualRaw = manNoCat.data as ManualLedgerDbRow[];
      }
    }
  } else if (!manualRaw && /category_id|column|does not exist/i.test(manErr0)) {
    let manNoCatLegacyQ = supabase.from("cash_manual_ledger_entries").select(manualSelectLegacy);
    if (pf) {
      manNoCatLegacyQ = manNoCatLegacyQ.gte("created_at", rangeStart).lt("created_at", rangeEndExclusive);
    }
    const manNoCat = await manNoCatLegacyQ.order("created_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 400);
    if (!manNoCat.error && manNoCat.data) {
      manualRaw = manNoCat.data as ManualLedgerDbRow[];
    }
  }
  if (manualRaw) {
    const nowMs = Date.now();
    const manualRows = manualRaw.map((r) => ({ ...r, category_id: r.category_id ?? null }));
    const creatorIds = [...new Set(manualRows.map((m) => m.created_by).filter((x): x is string => Boolean(x)))];
    const creatorNameById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const cRes = await supabase.from("users").select("id,full_name").in("id", creatorIds);
      for (const u of (cRes.data as { id: string; full_name: string }[] | null) || []) {
        creatorNameById.set(u.id, String(u.full_name || "").trim() || "бухгалтер");
      }
    }
    const manualTourIds = [...new Set(manualRows.map((m) => m.tour_id).filter((x): x is string => Boolean(x)))];
    const manualRpIds = [...new Set(manualRows.map((m) => m.rental_point_id).filter((x): x is string => Boolean(x)))];
    const manualCatIds = [...new Set(manualRows.map((m) => m.category_id).filter((x): x is string => Boolean(x)))];
    const manualTourMetaById = new Map<string, { name: string; startAt: string | null }>();
    if (manualTourIds.length > 0) {
      const tRes = await supabase.from("tours").select("id,name,start_at").in("id", manualTourIds);
      for (const t of (tRes.data as { id: string; name: string; start_at: string | null }[] | null) || []) {
        manualTourMetaById.set(t.id, { name: String(t.name || ""), startAt: t.start_at != null ? String(t.start_at) : null });
      }
    }
    const manualRentalPointNameById = new Map<string, string>();
    if (manualRpIds.length > 0) {
      const rpRes = await supabase.from("rental_points").select("id,name").in("id", manualRpIds);
      for (const p of (rpRes.data as { id: string; name: string }[] | null) || []) {
        manualRentalPointNameById.set(p.id, String(p.name || "").trim() || "точка");
      }
    }
    const manualCatLabelById = new Map<string, string>();
    if (manualCatIds.length > 0) {
      const cRes = await supabase.from("cash_manual_ledger_categories").select("id,label").in("id", manualCatIds);
      if (!cRes.error && cRes.data) {
        for (const c of cRes.data as { id: string; label: string }[]) {
          manualCatLabelById.set(c.id, String(c.label || "").trim());
        }
      }
    }
    for (const m of manualRows) {
      const amount = Math.round(Number(m.amount_vnd || 0));
      const title = String(m.title || "").trim() || "операция";
      const noteTrim = m.note?.trim();
      const who = m.created_by ? creatorNameById.get(m.created_by) : null;
      const att = m.attachment_url?.trim() || null;
      const photoHint = att ? " · есть фото / чек" : "";
      const tm = m.tour_id ? manualTourMetaById.get(m.tour_id) : null;
      const tourLine = tm ? cashTourLineRu(tm.name || "тур", tm.startAt) : null;
      const tourPart = tourLine ? ` · ${tourLine}` : "";
      const rpId = m.rental_point_id ?? null;
      const rpName = rpId ? manualRentalPointNameById.get(rpId) : null;
      const pointPart = rpName ? ` · точка: ${rpName}` : "";
      const catLabel = m.category_id ? manualCatLabelById.get(m.category_id) : null;
      const catPart = catLabel ? `[${catLabel}] ` : "";
      const cur = String(m.currency_code || "VND").trim().toUpperCase() || "VND";
      const payKind = m.payment_kind === "bank_transfer" ? "банк" : "наличные";
      const afRaw = m.amount_foreign != null && m.amount_foreign !== "" ? Number(m.amount_foreign) : null;
      const fxRaw = m.fx_rate_to_vnd != null && m.fx_rate_to_vnd !== "" ? Number(m.fx_rate_to_vnd) : null;
      const fxPart =
        cur !== "VND" && afRaw != null && Number.isFinite(afRaw) && fxRaw != null && Number.isFinite(fxRaw)
          ? ` · ${cur} ${afRaw.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} · ${fxRaw.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ₫/1`
          : cur !== "VND"
            ? ` · ${cur}`
            : "";
      const payPart = ` · ${payKind}`;
      const summary =
        m.direction === "in"
          ? `Поступление в кассу (вручную): ${catPart}${title}${tourPart}${pointPart}${payPart}${fxPart}${noteTrim ? ` - ${noteTrim}` : ""}${photoHint}${who ? ` · записал(а): ${who}` : ""}`
          : `Расход из кассы (вручную): ${catPart}${title}${tourPart}${pointPart}${payPart}${fxPart}${noteTrim ? ` - ${noteTrim}` : ""}${photoHint}${who ? ` · записал(а): ${who}` : ""}`;
      const lbRaw = m.ledger_bucket != null ? String(m.ledger_bucket).trim() : "";
      const manualLedgerBucket: "standard" | "instrumented" | null =
        lbRaw === "instrumented" ? "instrumented" : lbRaw === "standard" ? "standard" : null;
      const payKindRaw = m.payment_kind != null ? String(m.payment_kind).trim() : "";
      const manualLedgerPaymentKind: "cash" | "bank_transfer" | null =
        payKindRaw === "bank_transfer" ? "bank_transfer" : payKindRaw === "cash" ? "cash" : null;
      let manualLedgerBucketOkAt =
        m.ledger_bucket_ok_at != null && String(m.ledger_bucket_ok_at).trim()
          ? String(m.ledger_bucket_ok_at)
          : null;
      if (
        manualLedgerBucketOkAt == null &&
        manualLedgerPaymentKind !== "bank_transfer" &&
        (manualLedgerPaymentKind === "cash" || payKindRaw === "")
      ) {
        manualLedgerBucketOkAt = String(m.created_at || "");
      }
      const createdAtMs = Date.parse(String(m.created_at || ""));
      const withinEditHour =
        Number.isFinite(createdAtMs) && nowMs - createdAtMs >= 0 && nowMs - createdAtMs <= 60 * 60 * 1000;
      const manualCanEdit =
        Boolean(viewerEff) &&
        (viewerEff?.role === "director" || (viewerEff?.id === (m.created_by ?? "") && withinEditHour));
      const manualCanDelete = Boolean(viewerEff) && viewerEff?.role === "director";
      pushLedgerRow({
        id: `man:${m.id}`,
        at: m.created_at,
        direction: m.direction,
        amountVnd: amount,
        kind: m.direction === "in" ? "manual_in" : "manual_out",
        sourceId: m.id,
        summary,
        note: noteTrim || null,
        attachmentUrl: att,
        recordedByName: who ?? null,
        linkedTourId: m.tour_id ?? null,
        manualLedgerBucket,
        manualLedgerBucketOkAt,
        manualLedgerPaymentKind,
        manualCanEdit,
        manualCanDelete,
      });
    }
  }

  const handoverChDefs = await listOfficeCashHandoverChannels();
  const chLabelById = new Map(handoverChDefs.map((c) => [c.id, c.label]));
  let hoQ = supabase
    .from("tour_office_cash_handovers")
    .select("id,tour_id,holder_role,employee_id,amount_vnd,amount_usd,channel_id,note,received_at,recorded_by");
  if (pf) {
    hoQ = hoQ.gte("received_at", rangeStart).lt("received_at", rangeEndExclusive);
  }
  const hoRes = await hoQ.order("received_at", { ascending: Boolean(pf) }).limit(pf ? 8_000 : 220);
  if (!hoRes.error && hoRes.data?.length) {
    const hoRows = hoRes.data as {
      id: string;
      tour_id: string;
      holder_role: string;
      employee_id: string;
      amount_vnd: number | string;
      amount_usd: number | string | null;
      channel_id: string | null;
      note: string | null;
      received_at: string;
      recorded_by: string | null;
    }[];
    const hoTourIds = [...new Set(hoRows.map((h) => h.tour_id))];
    const hoEmpIds = [...new Set(hoRows.map((h) => h.employee_id))];
    const hoRecIds = [...new Set(hoRows.map((h) => h.recorded_by).filter((x): x is string => Boolean(x)))];
    const hoTourMetaById = new Map<string, { name: string; startAt: string | null }>();
    if (hoTourIds.length > 0) {
      const tRes = await supabase.from("tours").select("id,name,start_at").in("id", hoTourIds);
      for (const t of (tRes.data as { id: string; name: string; start_at: string | null }[] | null) || []) {
        hoTourMetaById.set(t.id, { name: String(t.name || ""), startAt: t.start_at != null ? String(t.start_at) : null });
      }
    }
    const hoUserNameById = new Map<string, string>();
    const uIds = [...new Set([...hoEmpIds, ...hoRecIds])];
    if (uIds.length > 0) {
      const uRes = await supabase.from("users").select("id,full_name").in("id", uIds);
      for (const u of (uRes.data as { id: string; full_name: string }[] | null) || []) {
        hoUserNameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
      }
    }
    for (const h of hoRows) {
      const tm = hoTourMetaById.get(h.tour_id);
      const tourLine = cashTourLineRu(tm?.name || "тур", tm?.startAt);
      const emp = hoUserNameById.get(h.employee_id) || "сотрудник";
      const holderRu = h.holder_role === "manager" ? "менеджер" : "гид";
      const rec = h.recorded_by ? hoUserNameById.get(h.recorded_by) : null;
      const noteTrim = h.note?.trim();
      const cid = h.channel_id;
      const chLabel = cid && chLabelById.has(cid) ? (chLabelById.get(cid) as string) : "Без способа";
      const usdRaw = h.amount_usd != null && h.amount_usd !== "" ? Number(h.amount_usd) : null;
      const usdPart =
        usdRaw != null && Number.isFinite(usdRaw) && usdRaw > 0 ? ` · ${formatUsd(usdRaw)}` : "";
      const summary = `Поступление в кассу · сдача (${holderRu} ${emp}) · ${chLabel} · ${tourLine}${usdPart}${noteTrim ? ` · ${noteTrim}` : ""}${rec ? ` · зафиксировал(а): ${rec}` : ""}`;
      pushLedgerRow({
        id: `och:${h.id}`,
        at: h.received_at,
        direction: "in",
        amountVnd: Math.round(Number(h.amount_vnd || 0)),
        kind: "office_cash_handover",
        sourceId: h.id,
        summary,
        note: noteTrim || null,
        recordedByName: rec ?? null,
        searchText: `${summary} ${chLabel} ${cid || ""} ${rec || ""}`.toLowerCase(),
        linkedTourId: h.tour_id,
      });
    }
  }

  let finalRows = rows;
  if (viewerEff?.role === "chief_manager") {
    /** Главный менеджер: видит деньги по турам/броням и сопутствующие движения, но не «внутренний» ручной журнал кассы. */
    finalRows = rows.filter((r) => r.kind !== "manual_in" && r.kind !== "manual_out");
    currentBalanceVnd = finalRows.reduce((s, r) => s + (r.direction === "in" ? r.amountVnd : -r.amountVnd), 0);
  }
  finalRows.sort((a, b) => (pf ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));

  const totalRowCount = finalRows.length;
  const off = Math.max(0, movements?.offset ?? 0);
  const lim = movements?.limit;
  let outRows = finalRows;
  if (lim != null && lim > 0) {
    outRows = finalRows.slice(off, off + lim);
  } else if (off > 0) {
    outRows = finalRows.slice(off);
  }
  return { currentBalanceVnd, rows: outRows, totalRowCount };
}

const ACCOUNTING_TAX_REPORT_ROLES: Role[] = [
  "manager",
  "chief_manager",
  "guide",
  "chief_guide",
  "dispatcher",
  "booking_dispatcher",
];

/** Сотрудники для налоговых сводок в отчётах (роли поля/кассы). */
export async function listAccountingTaxEmployees(): Promise<AccountingTaxEmployeeRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const selFull =
    "id,full_name,role,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,vietnam_mrot_zone,payroll_income_tax_withheld_at,payroll_tax_declaration_filed_at";
  const tryRes = await supabase.from("users").select(selFull).in("role", ACCOUNTING_TAX_REPORT_ROLES).order("full_name");
  let list: Record<string, unknown>[] | null = null;
  if (!tryRes.error && tryRes.data) {
    list = tryRes.data as Record<string, unknown>[];
  } else if (
    tryRes.error &&
    /payroll_income_tax_withheld_at|payroll_tax_declaration_filed_at|column|does not exist/i.test(String(tryRes.error.message))
  ) {
    const leg = await supabase
      .from("users")
      .select("id,full_name,role,payroll_contribution_base_vnd,payroll_personal_income_tax_percent,vietnam_mrot_zone")
      .in("role", ACCOUNTING_TAX_REPORT_ROLES)
      .order("full_name");
    if (!leg.error && leg.data) list = leg.data as Record<string, unknown>[];
  }
  if (!list) return [];
  return list.map((r) => {
    const z = r.vietnam_mrot_zone as string | null | undefined;
    const zone = z === "I" || z === "II" || z === "III" || z === "IV" ? (z as "I" | "II" | "III" | "IV") : null;
    const pitRaw = r.payroll_personal_income_tax_percent;
    const pit =
      pitRaw != null && pitRaw !== "" && Number.isFinite(Number(pitRaw)) ? Number(pitRaw) : null;
    const baseRaw = r.payroll_contribution_base_vnd;
    const base =
      baseRaw != null && baseRaw !== "" && Number.isFinite(Number(baseRaw)) ? Math.max(0, Math.round(Number(baseRaw))) : null;
    return {
      id: String(r.id),
      fullName: String(r.full_name || "").trim() || "-",
      role: r.role as Role,
      payrollContributionBaseVnd: base,
      payrollPersonalIncomeTaxPercent: pit,
      vietnamMrotZone: zone,
      payrollIncomeTaxWithheldAt: r.payroll_income_tax_withheld_at != null ? String(r.payroll_income_tax_withheld_at) : null,
      payrollTaxDeclarationFiledAt:
        r.payroll_tax_declaration_filed_at != null ? String(r.payroll_tax_declaration_filed_at) : null,
    };
  });
}

export type RedFileManualLedgerRow = {
  id: string;
  createdAt: string;
  direction: "in" | "out";
  amountVnd: number;
  title: string;
  note: string | null;
  paymentKind: string;
  currencyCode: string | null;
};

/** Ручные операции кассы за период: только банковские переводы в VND (для «красного» файла). */
export async function listRedFileManualBankVnd(fromYmd: string, toYmd: string): Promise<RedFileManualLedgerRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd) || fromYmd > toYmd) return [];
  const rangeStart = `${fromYmd}T00:00:00.000Z`;
  const rangeEndExclusive = `${nextDayYmd(toYmd)}T00:00:00.000Z`;
  const selWithBucket =
    "id,created_at,direction,amount_vnd,title,note,payment_kind,currency_code,amount_foreign,fx_rate_to_vnd,ledger_bucket,ledger_bucket_ok_at";
  const selLegacy =
    "id,created_at,direction,amount_vnd,title,note,payment_kind,currency_code,amount_foreign,fx_rate_to_vnd";
  let useBucketFilter = true;
  const resBucket = await supabase
    .from("cash_manual_ledger_entries")
    .select(selWithBucket)
    .eq("payment_kind", "bank_transfer")
    .eq("ledger_bucket", "instrumented")
    .not("ledger_bucket_ok_at", "is", null)
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEndExclusive)
    .order("created_at", { ascending: true })
    .limit(8_000);
  let rows: Record<string, unknown>[] | null = null;
  if (resBucket.error && /ledger_bucket/i.test(String(resBucket.error.message))) {
    useBucketFilter = false;
    const resLegacy = await supabase
      .from("cash_manual_ledger_entries")
      .select(selLegacy)
      .eq("payment_kind", "bank_transfer")
      .gte("created_at", rangeStart)
      .lt("created_at", rangeEndExclusive)
      .order("created_at", { ascending: true })
      .limit(8_000);
    if (resLegacy.error) {
      if (/payment_kind|column|does not exist/i.test(String(resLegacy.error.message))) return [];
      return [];
    }
    rows = (resLegacy.data as Record<string, unknown>[]) || [];
  } else {
    if (resBucket.error) {
      if (/payment_kind|column|does not exist/i.test(String(resBucket.error.message))) return [];
      return [];
    }
    rows = (resBucket.data as Record<string, unknown>[]) || [];
  }
  const out: RedFileManualLedgerRow[] = [];
  for (const r of rows) {
    const cur = String(r.currency_code || "VND").trim().toUpperCase() || "VND";
    if (cur !== "VND") continue;
    const af = r.amount_foreign != null && r.amount_foreign !== "" ? Number(r.amount_foreign) : null;
    if (af != null && Number.isFinite(af) && af > 0) continue;
    if (
      useBucketFilter &&
      (r.ledger_bucket !== "instrumented" || r.ledger_bucket_ok_at == null || String(r.ledger_bucket_ok_at).trim() === "")
    ) {
      continue;
    }
    out.push({
      id: String(r.id),
      createdAt: String(r.created_at || ""),
      direction: r.direction === "out" ? "out" : "in",
      amountVnd: Math.round(Number(r.amount_vnd || 0)),
      title: String(r.title || "").trim(),
      note: r.note != null ? String(r.note).trim() || null : null,
      paymentKind: String(r.payment_kind || "bank_transfer"),
      currencyCode: cur,
    });
  }
  return out;
}

/** Системные каналы сдачи кассы — должны существовать всегда (см. миграцию 20260608150000_reseed_office_cash_handover_channels). */
const SYSTEM_OFFICE_CASH_HANDOVER_CHANNELS = [
  { slug: "kz_bank", label: "Перевод на банк Казахстана", sort_order: 10, is_system: true, expects_usd_amount: false },
  { slug: "ru_bank", label: "Перевод на банк РФ", sort_order: 20, is_system: true, expects_usd_amount: false },
  { slug: "vn_bank", label: "Перевод на вьетнамский банк", sort_order: 30, is_system: true, expects_usd_amount: false },
  { slug: "cash_vnd", label: "Наличные донги", sort_order: 40, is_system: true, expects_usd_amount: false },
  { slug: "cash_usd", label: "Наличные доллары США", sort_order: 50, is_system: true, expects_usd_amount: true },
] as const;

export async function listOfficeCashHandoverChannels(): Promise<OfficeCashHandoverChannelDef[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let { data, error } = await supabase
    .from("office_cash_handover_channels")
    .select("id,slug,label,sort_order,is_system,expects_usd_amount")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  // Самовосстановление: если справочник пуст (например, после системного сброса до фикса плана очистки),
  // досеиваем системные каналы прямо здесь — иначе форма «Принять в кассу» молча отказывает.
  if (!error && (!data || data.length === 0)) {
    await supabase
      .from("office_cash_handover_channels")
      .upsert(SYSTEM_OFFICE_CASH_HANDOVER_CHANNELS, { onConflict: "slug", ignoreDuplicates: true });
    const reseeded = await supabase
      .from("office_cash_handover_channels")
      .select("id,slug,label,sort_order,is_system,expects_usd_amount")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    data = reseeded.data;
    error = reseeded.error;
  }
  if (error || !data) return [];
  return (data as {
    id: string;
    slug: string | null;
    label: string;
    sort_order: number | string;
    is_system: boolean;
    expects_usd_amount: boolean;
  }[]).map((r) => ({
    id: r.id,
    slug: r.slug != null ? String(r.slug) : null,
    label: String(r.label || "").trim(),
    sortOrder: Number(r.sort_order ?? 0),
    isSystem: Boolean(r.is_system),
    expectsUsdAmount: Boolean(r.expects_usd_amount),
  }));
}

export type ManagerTourHandoverBookingLine = {
  bookingId: string;
  customerName: string;
  hotel: string;
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  pendingGuideTopupVnd: number;
  maxHandoverVnd: number;
};

export type ManagerTourHandoverContext = {
  tourId: string;
  managerId: string;
  managerName: string;
  tourName: string;
  tourDate: string;
  channels: OfficeCashHandoverChannelDef[];
  bookings: ManagerTourHandoverBookingLine[];
  receivedOnTourVnd: number;
  handedOnTourVnd: number;
  outstandingOnTourVnd: number;
};

/** Данные для модалки сдачи менеджера по туру (без полной страницы бухгалтерии). */
export async function getManagerTourHandoverContext(
  tourId: string,
  managerId: string,
): Promise<ManagerTourHandoverContext | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const [tour, channels, bookingsAll, userRes] = await Promise.all([
    getTourById(tourId),
    listOfficeCashHandoverChannels(),
    listBookingsForTour(tourId),
    supabase.from("users").select("full_name").eq("id", managerId).maybeSingle(),
  ]);
  if (!tour) return null;
  const managerName =
    String((userRes.data as { full_name?: string } | null)?.full_name || "").trim() || "Менеджер";
  const mine = bookingsAll.filter((b) => b.managerId === managerId);
  const bookingIds = mine.map((b) => b.id);

  const bookings: ManagerTourHandoverBookingLine[] = mine.map((b) => ({
    bookingId: b.id,
    customerName: b.customerName,
    hotel: b.hotel || "",
    totalVnd: b.totalVnd,
    paidVnd: b.paidVnd,
    dueVnd: b.dueVnd,
    pendingGuideTopupVnd: b.pendingGuideTopupVnd ?? 0,
    maxHandoverVnd: b.dueVnd + (b.pendingGuideTopupVnd ?? 0),
  }));
  const [receivedOnTourVnd, handedOnTourVnd] = await Promise.all([
    sumPaymentsReceivedForBookingIds(supabase, bookingIds),
    sumManagerHandoversOnTour(supabase, tourId, managerId),
  ]);

  return {
    tourId,
    managerId,
    managerName,
    tourName: tour.name,
    tourDate: tour.date,
    channels,
    bookings,
    receivedOnTourVnd,
    handedOnTourVnd,
    outstandingOnTourVnd: Math.max(0, receivedOnTourVnd - handedOnTourVnd),
  };
}

export type TourCashHandoverManagerRow = {
  managerId: string;
  managerName: string;
  bookingCount: number;
  receivedOnTourVnd: number;
  handedOnTourVnd: number;
  outstandingOnTourVnd: number;
};

export type TourCashHandoverManagersPayload = {
  tourId: string;
  tourName: string;
  tourDate: string;
  managers: TourCashHandoverManagerRow[];
};

/** Менеджеры на туре с суммами сдачи (без списка квитанций). */
export async function getTourCashHandoverManagersSummary(tourId: string): Promise<TourCashHandoverManagersPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const [tour, bookingsAll] = await Promise.all([getTourById(tourId), listBookingsForTour(tourId)]);
  if (!tour) return null;
  const byMgr = new Map<string, { name: string; ids: string[] }>();
  for (const b of bookingsAll) {
    const mid = b.managerId?.trim();
    if (!mid) continue;
    const cur = byMgr.get(mid) || { name: (b.managerName || "").trim() || "Менеджер", ids: [] };
    cur.ids.push(b.id);
    if ((b.managerName || "").trim()) cur.name = (b.managerName || "").trim();
    byMgr.set(mid, cur);
  }
  const managerEntries = [...byMgr.entries()];
  const managers: TourCashHandoverManagerRow[] = await Promise.all(
    managerEntries.map(async ([managerId, { name, ids }]) => {
      const [receivedOnTourVnd, handedOnTourVnd] = await Promise.all([
        sumPaymentsReceivedForBookingIds(supabase, ids),
        sumManagerHandoversOnTour(supabase, tourId, managerId),
      ]);
      return {
        managerId,
        managerName: name,
        bookingCount: ids.length,
        receivedOnTourVnd,
        handedOnTourVnd,
        outstandingOnTourVnd: Math.max(0, receivedOnTourVnd - handedOnTourVnd),
      };
    }),
  );
  managers.sort((a, b) => {
    const ao = a.outstandingOnTourVnd > 0 ? 1 : 0;
    const bo = b.outstandingOnTourVnd > 0 ? 1 : 0;
    if (bo !== ao) return bo - ao;
    if (b.outstandingOnTourVnd !== a.outstandingOnTourVnd) return b.outstandingOnTourVnd - a.outstandingOnTourVnd;
    return a.managerName.localeCompare(b.managerName, "ru");
  });
  return {
    tourId,
    tourName: tour.name,
    tourDate: tour.date,
    managers,
  };
}

export type ManagerCashHandoverTourRow = {
  tourId: string;
  tourName: string;
  tourDate: string;
  tourStatus: TourStatus;
  bookingCount: number;
  receivedOnTourVnd: number;
  handedOnTourVnd: number;
  outstandingOnTourVnd: number;
  /** Доплаты topup без remitted_to_cash_at - у гида, не у менеджера в кассе; в «к сдаче» не входят. */
  pendingGuideTopupOnTourVnd: number;
};

export type ManagerCashHandoverAllToursPayload = {
  managerId: string;
  managerName: string;
  tours: ManagerCashHandoverTourRow[];
  totalOutstandingVnd: number;
};

const MANAGER_CASH_HANDOVER_TOURS_LIMIT = 100;

/** Туры, где у менеджера есть брони, с суммами сдачи (для «закрыть по всем»). */
export async function getManagerCashHandoverAllToursSummary(
  managerId: string,
): Promise<ManagerCashHandoverAllToursPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: u } = await supabase.from("users").select("full_name").eq("id", managerId).maybeSingle();
  const managerName = String((u as { full_name?: string } | null)?.full_name || "").trim() || "Менеджер";

  const { data: bRows, error: bErr } = await supabase
    .from("bookings")
    .select("id,tour_id")
    .eq("manager_id", managerId)
    .is("deleted_at", null);
  if (bErr || !bRows?.length) {
    return {
      managerId,
      managerName,
      tours: [],
      totalOutstandingVnd: 0,
    };
  }

  const idsByTour = new Map<string, string[]>();
  for (const r of bRows as { id: string; tour_id: string }[]) {
    const tid = String(r.tour_id);
    const arr = idsByTour.get(tid) || [];
    arr.push(r.id);
    idsByTour.set(tid, arr);
  }
  const tourIds = [...idsByTour.keys()];
  const { data: tourRows, error: tErr } = await supabase
    .from("tours")
    .select("id,name,start_at,status")
    .in("id", tourIds)
    .is("deleted_at", null)
    .neq("status", "deleted");
  if (tErr || !tourRows?.length) {
    return {
      managerId,
      managerName,
      tours: [],
      totalOutstandingVnd: 0,
    };
  }

  type TRow = { id: string; name: string; start_at: string; status: TourStatus };
  const sortedTours = (tourRows as TRow[])
    .slice()
    .sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))
    .slice(0, MANAGER_CASH_HANDOVER_TOURS_LIMIT);

  const allowedTourIds = new Set(sortedTours.map((t) => t.id));
  const allBookingIds: string[] = [];
  for (const tid of allowedTourIds) {
    const ids = idsByTour.get(tid);
    if (ids?.length) allBookingIds.push(...ids);
  }

  const payAggMap = new Map<string, PayAggEx>();
  for (let i = 0; i < allBookingIds.length; i += MANAGER_CASH_PAYMENTS_CHUNK) {
    const chunk = allBookingIds.slice(i, i + MANAGER_CASH_PAYMENTS_CHUNK);
    const payFull = await supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
      .in("booking_id", chunk);
    let rows: PaymentRowAgg[] = [];
    if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
      const leg = await supabase.from("payments").select("id,booking_id,amount_vnd,kind,created_at").in("booking_id", chunk);
      rows = ((leg.data || []) as PaymentRowAgg[]).map((r) => ({ ...r, remitted_to_cash_at: undefined }));
    } else if (!payFull.error && payFull.data) {
      rows = payFull.data as PaymentRowAgg[];
    }
    const part = aggregatePaymentsEx(rows);
    for (const [bid, agg] of part) payAggMap.set(bid, agg);
  }

  const handedByTour = new Map<string, number>();
  const hoRes = await supabase
    .from("tour_office_cash_handovers")
    .select("tour_id,amount_vnd")
    .eq("employee_id", managerId)
    .eq("holder_role", "manager")
    .in("tour_id", [...allowedTourIds]);
  if (!hoRes.error && hoRes.data) {
    for (const h of hoRes.data as { tour_id: string; amount_vnd: number | string }[]) {
      const tid = String(h.tour_id);
      handedByTour.set(tid, (handedByTour.get(tid) || 0) + Math.round(Number(h.amount_vnd || 0)));
    }
  }

  const tours: ManagerCashHandoverTourRow[] = sortedTours.map((t) => {
    const bids = idsByTour.get(t.id) || [];
    let receivedOnTourVnd = 0;
    let pendingGuideTopupOnTourVnd = 0;
    for (const bid of bids) {
      const agg = payAggMap.get(bid) || emptyPayAggEx();
      receivedOnTourVnd += agg.deposit + agg.topupRemitted - agg.refund;
      pendingGuideTopupOnTourVnd += agg.topupPending;
    }
    receivedOnTourVnd = Math.round(receivedOnTourVnd);
    pendingGuideTopupOnTourVnd = Math.round(pendingGuideTopupOnTourVnd);
    const handedOnTourVnd = handedByTour.get(t.id) || 0;
    return {
      tourId: t.id,
      tourName: t.name,
      tourDate: startDateOnly(t.start_at),
      tourStatus: t.status,
      bookingCount: bids.length,
      receivedOnTourVnd,
      handedOnTourVnd,
      outstandingOnTourVnd: Math.max(0, receivedOnTourVnd - handedOnTourVnd),
      pendingGuideTopupOnTourVnd,
    };
  });

  tours.sort((a, b) => {
    const ao = a.outstandingOnTourVnd > 0 ? 1 : 0;
    const bo = b.outstandingOnTourVnd > 0 ? 1 : 0;
    if (bo !== ao) return bo - ao;
    if (b.outstandingOnTourVnd !== a.outstandingOnTourVnd) return b.outstandingOnTourVnd - a.outstandingOnTourVnd;
    return b.tourDate.localeCompare(a.tourDate);
  });

  const totalOutstandingVnd = tours.reduce((s, x) => s + (x.outstandingOnTourVnd > 0 ? x.outstandingOnTourVnd : 0), 0);
  return {
    managerId,
    managerName,
    tours,
    totalOutstandingVnd,
  };
}

export type GuideCashHandoverTourRow = {
  tourId: string;
  tourName: string;
  tourDate: string;
  tourStatus: TourStatus;
  /** Гид должен сдать офису (после расходов, депозита и зарплаты). */
  guideOwesVnd: number;
  /** Офис должен гиду. */
  officeOwesVnd: number;
};

export type GuideCashHandoverAllToursPayload = {
  guideId: string;
  guideName: string;
  tours: GuideCashHandoverTourRow[];
  totalGuideOwesVnd: number;
  totalOfficeOwesVnd: number;
};

const GUIDE_CASH_HANDOVER_TOURS_LIMIT = 60;

/** Туры, где сотрудник был основным гидом, с расчётом баланса «гид ↔ офис» (для «рассчитаться с гидом»). */
export async function getGuideCashHandoverAllToursSummary(
  guideId: string,
): Promise<GuideCashHandoverAllToursPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: u } = await supabase.from("users").select("full_name").eq("id", guideId).maybeSingle();
  const guideName = String((u as { full_name?: string } | null)?.full_name || "").trim() || "Гид";

  const empty: GuideCashHandoverAllToursPayload = {
    guideId,
    guideName,
    tours: [],
    totalGuideOwesVnd: 0,
    totalOfficeOwesVnd: 0,
  };

  const { data: tgRows, error: tgErr } = await supabase
    .from("tour_guides")
    .select("tour_id")
    .eq("guide_id", guideId)
    .eq("is_primary", true);
  if (tgErr || !tgRows?.length) return empty;

  const tourIds = [...new Set((tgRows as { tour_id: string }[]).map((r) => String(r.tour_id)))];
  const { data: tourRows, error: tErr } = await supabase
    .from("tours")
    .select("id,name,start_at,status")
    .in("id", tourIds)
    .is("deleted_at", null)
    .neq("status", "deleted");
  if (tErr || !tourRows?.length) return empty;

  type TRow = { id: string; name: string; start_at: string; status: TourStatus };
  const sortedTours = (tourRows as TRow[])
    .slice()
    .sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))
    .slice(0, GUIDE_CASH_HANDOVER_TOURS_LIMIT);

  const breakdowns = await Promise.all(
    sortedTours.map((t) => getTourGuideSettlementBreakdownForTour(t.id)),
  );

  const tours: GuideCashHandoverTourRow[] = sortedTours.map((t, i) => {
    const b = breakdowns[i];
    return {
      tourId: t.id,
      tourName: t.name,
      tourDate: startDateOnly(t.start_at),
      tourStatus: t.status,
      guideOwesVnd: b ? guideOwesOfficeVnd(b) : 0,
      officeOwesVnd: b ? officeOwesGuideVnd(b) : 0,
    };
  });

  tours.sort((a, b) => {
    const ad = a.guideOwesVnd > 0 || a.officeOwesVnd > 0 ? 1 : 0;
    const bd = b.guideOwesVnd > 0 || b.officeOwesVnd > 0 ? 1 : 0;
    if (bd !== ad) return bd - ad;
    return b.tourDate.localeCompare(a.tourDate);
  });

  const totalGuideOwesVnd = tours.reduce((s, x) => s + x.guideOwesVnd, 0);
  const totalOfficeOwesVnd = tours.reduce((s, x) => s + x.officeOwesVnd, 0);
  return { guideId, guideName, tours, totalGuideOwesVnd, totalOfficeOwesVnd };
}

export async function listTourOfficeCashHandovers(tourId: string): Promise<TourOfficeCashHandoverRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const chDefs = await listOfficeCashHandoverChannels();
  const chMetaById = new Map(
    chDefs.map((c) => [c.id, { label: c.label, expectsUsd: c.expectsUsdAmount }]),
  );
  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;
  {
    const r = await supabase
      .from("tour_office_cash_handovers")
      .select(
        "id,tour_id,holder_role,employee_id,amount_vnd,amount_usd,channel_id,note,received_at,recorded_by,booking_id",
      )
      .eq("tour_id", tourId)
      .order("received_at", { ascending: false });
    if (r.error && /booking_id|column|does not exist/i.test(String(r.error.message))) {
      const r2 = await supabase
        .from("tour_office_cash_handovers")
        .select("id,tour_id,holder_role,employee_id,amount_vnd,amount_usd,channel_id,note,received_at,recorded_by")
        .eq("tour_id", tourId)
        .order("received_at", { ascending: false });
      data = (r2.data as unknown[]) || null;
      error = r2.error;
    } else {
      data = (r.data as unknown[]) || null;
      error = r.error;
    }
  }
  if (error || !data?.length) return [];
  const rowsRaw = data as {
    id: string;
    tour_id: string;
    holder_role: string;
    employee_id: string;
    amount_vnd: number | string;
    amount_usd: number | string | null;
    channel_id: string | null;
    note: string | null;
    received_at: string;
    recorded_by: string | null;
    booking_id?: string | null;
  }[];
  const bookingIds = [...new Set(rowsRaw.map((r) => r.booking_id).filter((x): x is string => Boolean(x)))];
  const guestByBooking = new Map<string, string>();
  if (bookingIds.length) {
    const bRes = await supabase.from("bookings").select("id,customer_name").in("id", bookingIds);
    for (const b of (bRes.data as { id: string; customer_name: string }[] | null) || []) {
      guestByBooking.set(b.id, String(b.customer_name || "").trim() || "-");
    }
  }
  const empIds = [...new Set(rowsRaw.map((r) => r.employee_id))];
  const recIds = [...new Set(rowsRaw.map((r) => r.recorded_by).filter((x): x is string => Boolean(x)))];
  const nameById = new Map<string, string>();
  const uIds = [...new Set([...empIds, ...recIds])];
  if (uIds.length > 0) {
    const uRes = await supabase.from("users").select("id,full_name").in("id", uIds);
    for (const u of (uRes.data as { id: string; full_name: string }[] | null) || []) {
      nameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
    }
  }
  return rowsRaw.map((r) => {
    const meta = r.channel_id ? chMetaById.get(r.channel_id) : undefined;
    const usdRaw = r.amount_usd != null && r.amount_usd !== "" ? Number(r.amount_usd) : null;
    const amountUsd = usdRaw != null && Number.isFinite(usdRaw) && usdRaw > 0 ? usdRaw : null;
    return {
      id: r.id,
      tourId: r.tour_id,
      holderRole: r.holder_role === "manager" ? "manager" : "guide",
      employeeId: r.employee_id,
      employeeName: nameById.get(r.employee_id) || "сотрудник",
      amountVnd: Math.round(Number(r.amount_vnd || 0)),
      amountUsd,
      channelId: r.channel_id ?? null,
      channelLabel: meta?.label ?? "Без способа",
      expectsUsdAmount: meta?.expectsUsd ?? false,
      note: r.note?.trim() || null,
      receivedAt: r.received_at,
      recordedByName: r.recorded_by ? nameById.get(r.recorded_by) ?? null : null,
      bookingId: r.booking_id ?? null,
      bookingGuestLabel: r.booking_id ? guestByBooking.get(r.booking_id) ?? null : null,
    };
  });
}

/** Суммарный долг по всем неудалённым броням (прайс − зачтённые платежи). */
export async function sumTotalBookingDueVnd(): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data: bookRows, error } = await supabase.from("bookings").select("id").is("deleted_at", null);
  if (error || !bookRows?.length) return 0;
  const ids = (bookRows as { id: string }[]).map((r) => r.id);
  let totalDue = 0;
  const chunkSize = 400;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: priceRows } = await supabase.from("booking_prices").select("booking_id,amount_vnd").in("booking_id", chunk);
    const totalByBooking = new Map<string, number>();
    for (const p of priceRows || []) {
      const bid = String((p as { booking_id: string }).booking_id);
      totalByBooking.set(bid, (totalByBooking.get(bid) || 0) + Number((p as { amount_vnd: number }).amount_vnd));
    }
    let paymentRowsRaw: PaymentRowAgg[] = [];
    const payFull = await supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
      .in("booking_id", chunk);
    if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
      const leg = await supabase.from("payments").select("id,booking_id,amount_vnd,kind,created_at").in("booking_id", chunk);
      paymentRowsRaw = ((leg.data || []) as PaymentRowAgg[]).map((r) => ({ ...r, remitted_to_cash_at: undefined }));
    } else if (!payFull.error && payFull.data) {
      paymentRowsRaw = payFull.data as PaymentRowAgg[];
    }
    const payAggMap = aggregatePaymentsEx(paymentRowsRaw);
    for (const bid of chunk) {
      const total = totalByBooking.get(bid) || 0;
      const agg = payAggMap.get(bid) || emptyPayAggEx();
      const paid = paidOfficialFromAgg(agg);
      totalDue += Math.max(0, total - paid);
    }
  }
  return totalDue;
}

/** Сумма доплат гида, ещё не отмеченных как принятые в кассу офиса. */
export async function sumPendingGuideTopupsVnd(): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const res = await supabase.from("payments").select("amount_vnd").eq("kind", "topup").is("remitted_to_cash_at", null);
  if (res.error) {
    if (/remitted_to_cash_at|column|does not exist/i.test(String(res.error.message))) return 0;
    return 0;
  }
  let s = 0;
  for (const r of (res.data as { amount_vnd: number | string }[]) || []) {
    s += Math.round(Number(r.amount_vnd || 0));
  }
  return s;
}

/**
 * Эквивалент ручной проводки в ₫ для отчётов: `amount_vnd`, иначе валюта × курс (если в строке нули по ₫).
 */
function effectiveManualLedgerAmountVnd(m: {
  amount_vnd: number | string;
  currency_code?: string | null;
  amount_foreign?: number | string | null;
  fx_rate_to_vnd?: number | string | null;
}): number {
  const raw = Math.round(Number(m.amount_vnd || 0));
  if (raw !== 0) return raw;
  const cur = String(m.currency_code || "VND").trim().toUpperCase() || "VND";
  if (cur === "VND") return 0;
  const fx = Number(m.fx_rate_to_vnd ?? 0);
  const af = Number(m.amount_foreign ?? 0);
  if (Number.isFinite(fx) && fx > 0 && Number.isFinite(af) && af > 0) {
    return Math.round(af * fx);
  }
  return 0;
}

/** Сверка поступлений/расходов кассы и сдач с туров за период (даты YYYY-MM-DD, границы включительно). */
export async function getCashReconciliationReport(fromYmd: string, toYmd: string): Promise<CashReconciliationReport | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) return null;
  if (fromYmd > toYmd) return null;

  const channelDefs = await listOfficeCashHandoverChannels();
  const labelById = new Map(channelDefs.map((c) => [c.id, c.label]));

  const rangeStart = `${fromYmd}T00:00:00.000Z`;
  const rangeEndExclusive = `${nextDayYmd(toYmd)}T00:00:00.000Z`;

  const [hoRes, payRes, manRes, advRes, topupRemitInPeriodRes, snapshotTotalBookingDueVnd, snapshotPendingGuideTopupVnd] =
    await Promise.all([
      supabase
        .from("tour_office_cash_handovers")
        .select("id,tour_id,holder_role,employee_id,amount_vnd,amount_usd,channel_id,note,received_at")
        .gte("received_at", rangeStart)
        .lt("received_at", rangeEndExclusive)
        .order("received_at", { ascending: false }),
      (async () => {
        const full = await supabase
          .from("payments")
          .select("amount_vnd,kind,created_at,remitted_to_cash_at")
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEndExclusive);
        if (full.error && /remitted_to_cash_at|column|does not exist/i.test(String(full.error.message))) {
          return await supabase
            .from("payments")
            .select("amount_vnd,kind,created_at")
            .gte("created_at", rangeStart)
            .lt("created_at", rangeEndExclusive);
        }
        return full;
      })(),
      supabase
        .from("cash_manual_ledger_entries")
        .select("direction,amount_vnd,created_at,payment_kind,currency_code,amount_foreign,fx_rate_to_vnd")
        .gte("created_at", rangeStart)
        .lt("created_at", rangeEndExclusive),
      supabase
        .from("tour_advances")
        .select("kind,amount_vnd,status,created_at")
        .gte("created_at", rangeStart)
        .lt("created_at", rangeEndExclusive),
      (async () => {
        const r = await supabase
          .from("payments")
          .select("amount_vnd")
          .eq("kind", "topup")
          .gte("remitted_to_cash_at", rangeStart)
          .lt("remitted_to_cash_at", rangeEndExclusive);
        if (r.error && /remitted_to_cash_at|column|does not exist/i.test(String(r.error.message))) {
          return { data: [] as { amount_vnd: number | string }[], error: null as null };
        }
        return r;
      })(),
      sumTotalBookingDueVnd(),
      sumPendingGuideTopupsVnd(),
    ]);

  const aggById = new Map<string, { count: number; sumVnd: number; sumUsd: number }>();
  for (const c of channelDefs) {
    aggById.set(c.id, { count: 0, sumVnd: 0, sumUsd: 0 });
  }
  const orphanAgg = { count: 0, sumVnd: 0, sumUsd: 0 };
  const handoverLines: CashReconciliationHandoverLine[] = [];

  if (!hoRes.error && hoRes.data?.length) {
    const raw = hoRes.data as {
      id: string;
      tour_id: string;
      holder_role: string;
      employee_id: string;
      amount_vnd: number | string;
      amount_usd: number | string | null;
      channel_id: string | null;
      note: string | null;
      received_at: string;
    }[];
    const tourIds = [...new Set(raw.map((r) => r.tour_id))];
    const empIds = [...new Set(raw.map((r) => r.employee_id))];
    const tourMetaById = new Map<string, { name: string; startAt: string | null }>();
    if (tourIds.length > 0) {
      const tRes = await supabase.from("tours").select("id,name,start_at").in("id", tourIds);
      for (const t of (tRes.data as { id: string; name: string; start_at: string | null }[] | null) || []) {
        tourMetaById.set(t.id, { name: String(t.name || ""), startAt: t.start_at != null ? String(t.start_at) : null });
      }
    }
    const empNameById = new Map<string, string>();
    if (empIds.length > 0) {
      const uRes = await supabase.from("users").select("id,full_name").in("id", empIds);
      for (const u of (uRes.data as { id: string; full_name: string }[] | null) || []) {
        empNameById.set(u.id, String(u.full_name || "").trim() || "сотрудник");
      }
    }
    for (const r of raw) {
      const cid = r.channel_id ?? null;
      const vnd = Math.round(Number(r.amount_vnd || 0));
      const usdRaw = r.amount_usd != null && r.amount_usd !== "" ? Number(r.amount_usd) : null;
      const amountUsd = usdRaw != null && Number.isFinite(usdRaw) && usdRaw > 0 ? usdRaw : null;
      if (cid && aggById.has(cid)) {
        const a = aggById.get(cid)!;
        a.count += 1;
        a.sumVnd += vnd;
        if (amountUsd != null) a.sumUsd += amountUsd;
      } else {
        orphanAgg.count += 1;
        orphanAgg.sumVnd += vnd;
        if (amountUsd != null) orphanAgg.sumUsd += amountUsd;
      }
      const chLabel = cid && labelById.has(cid) ? (labelById.get(cid) as string) : "Без способа";
      const tm = tourMetaById.get(r.tour_id);
      const tourLine = cashTourLineRu(tm?.name || "тур", tm?.startAt ?? null);
      handoverLines.push({
        id: r.id,
        receivedAt: r.received_at,
        tourId: r.tour_id,
        tourLine,
        holderRole: r.holder_role === "manager" ? "manager" : "guide",
        employeeName: empNameById.get(r.employee_id) || "сотрудник",
        channelId: cid,
        channelLabel: chLabel,
        amountVnd: vnd,
        amountUsd,
        note: r.note?.trim() || null,
      });
    }
  }

  const handoverTotalsRows = channelDefs.map((c) => {
    const a = aggById.get(c.id) ?? { count: 0, sumVnd: 0, sumUsd: 0 };
    return { channelId: c.id, label: c.label, count: a.count, sumVnd: a.sumVnd, sumUsd: a.sumUsd };
  });
  if (orphanAgg.count > 0) {
    handoverTotalsRows.push({
      channelId: "__unassigned__",
      label: "Без способа / удалённый справочник",
      count: orphanAgg.count,
      sumVnd: orphanAgg.sumVnd,
      sumUsd: orphanAgg.sumUsd,
    });
  }

  let paymentsIncomeVnd = 0;
  let paymentsRefundVnd = 0;
  let paymentsDepositVnd = 0;
  let paymentsOfficeCashVnd = 0;
  let paymentsTopupCreatedVnd = 0;
  let paymentsTopupPendingFromPeriodVnd = 0;

  if (!payRes.error && payRes.data) {
    for (const p of payRes.data as {
      amount_vnd: number | string;
      kind: string;
      created_at?: string;
      remitted_to_cash_at?: string | null;
    }[]) {
      const amt = Math.round(Number(p.amount_vnd || 0));
      if (p.kind === "refund") {
        paymentsRefundVnd += amt;
        continue;
      }
      paymentsIncomeVnd += amt;
      if (p.kind === "deposit") {
        paymentsDepositVnd += amt;
      } else if (p.kind === "office_cash") {
        paymentsOfficeCashVnd += amt;
      } else if (p.kind === "topup") {
        paymentsTopupCreatedVnd += amt;
        const rem = p.remitted_to_cash_at;
        if (rem !== undefined && (rem == null || String(rem).trim() === "")) {
          paymentsTopupPendingFromPeriodVnd += amt;
        }
      } else {
        paymentsOfficeCashVnd += amt;
      }
    }
  }

  let paymentsTopupRemittedInPeriodVnd = 0;
  if (!topupRemitInPeriodRes.error && topupRemitInPeriodRes.data) {
    for (const r of topupRemitInPeriodRes.data as { amount_vnd: number | string }[]) {
      paymentsTopupRemittedInPeriodVnd += Math.round(Number(r.amount_vnd || 0));
    }
  }

  let manualInVnd = 0;
  let manualOutVnd = 0;
  const manualForeignAgg = new Map<
    string,
    { direction: "in" | "out"; paymentKind: "cash" | "bank_transfer" | "unknown"; currencyCode: string; count: number; sumVnd: number; sumForeign: number }
  >();
  const manualCurrencyAgg = new Map<
    string,
    { inCount: number; outCount: number; sumInVnd: number; sumOutVnd: number; sumInForeign: number; sumOutForeign: number }
  >();
  if (!manRes.error && manRes.data) {
    for (const m of manRes.data as {
      direction: string;
      amount_vnd: number | string;
      payment_kind?: string | null;
      currency_code?: string | null;
      amount_foreign?: number | string | null;
      fx_rate_to_vnd?: number | string | null;
    }[]) {
      const eff = effectiveManualLedgerAmountVnd(m);
      const cur = String(m.currency_code || "VND").trim().toUpperCase() || "VND";
      const direction: "in" | "out" = m.direction === "in" ? "in" : "out";
      const foreign = Number(m.amount_foreign || 0);
      const sumForeign = Number.isFinite(foreign) ? foreign : 0;

      if (direction === "in") manualInVnd += eff;
      else manualOutVnd += eff;

      const cPrev = manualCurrencyAgg.get(cur) ?? {
        inCount: 0,
        outCount: 0,
        sumInVnd: 0,
        sumOutVnd: 0,
        sumInForeign: 0,
        sumOutForeign: 0,
      };
      if (direction === "in") {
        cPrev.inCount += 1;
        cPrev.sumInVnd += eff;
        if (cur !== "VND" && sumForeign > 0) cPrev.sumInForeign += sumForeign;
      } else {
        cPrev.outCount += 1;
        cPrev.sumOutVnd += eff;
        if (cur !== "VND" && sumForeign > 0) cPrev.sumOutForeign += sumForeign;
      }
      manualCurrencyAgg.set(cur, cPrev);

      if (cur !== "VND") {
        const paymentKind = m.payment_kind === "cash" || m.payment_kind === "bank_transfer" ? m.payment_kind : "unknown";
        const key = `${direction}|${paymentKind}|${cur}`;
        const prev = manualForeignAgg.get(key) ?? { direction, paymentKind, currencyCode: cur, count: 0, sumVnd: 0, sumForeign: 0 };
        prev.count += 1;
        prev.sumVnd += eff;
        prev.sumForeign += sumForeign;
        manualForeignAgg.set(key, prev);
      }
    }
  }
  const manualForeignRows = [...manualForeignAgg.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.sumVnd - a.sumVnd);

  const manualLedgerCurrencyTotals = [...manualCurrencyAgg.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .filter((r) => r.sumInVnd > 0 || r.sumOutVnd > 0 || r.inCount > 0 || r.outCount > 0)
    .sort((a, b) => {
      if (a.currencyCode === "VND") return -1;
      if (b.currencyCode === "VND") return 1;
      return b.sumInVnd + b.sumOutVnd - (a.sumInVnd + a.sumOutVnd);
    });

  let advanceIssueVnd = 0;
  let advanceReturnVnd = 0;
  if (!advRes.error && advRes.data) {
    for (const a of advRes.data as { kind: string; status: string; amount_vnd: number | string }[]) {
      if (a.status === "rejected") continue;
      const amt = Math.round(Number(a.amount_vnd || 0));
      if (a.kind === "return") advanceReturnVnd += amt;
      else advanceIssueVnd += amt;
    }
  }

  return {
    fromYmd,
    toYmd,
    handoverLines,
    handoverTotalsRows,
    manualForeignRows,
    manualLedgerCurrencyTotals,
    paymentsIncomeVnd,
    paymentsRefundVnd,
    manualInVnd,
    manualOutVnd,
    advanceIssueVnd,
    advanceReturnVnd,
    paymentsDepositVnd,
    paymentsOfficeCashVnd,
    paymentsTopupCreatedVnd,
    paymentsTopupRemittedInPeriodVnd,
    paymentsTopupPendingFromPeriodVnd,
    snapshotTotalBookingDueVnd,
    snapshotPendingGuideTopupVnd,
  };
}

export async function listSalesManagers(): Promise<{ id: string; fullName: string }[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("users")
    .select("id,full_name,role")
    .eq("is_active", true)
    .in("role", ["manager", "chief_manager", "director"])
    .order("full_name");
  return ((data as { id: string; full_name: string; role: string }[]) || []).map((r) => ({
    id: r.id,
    fullName: r.role === "director" ? `${r.full_name} (директор)` : r.full_name,
  }));
}

export async function listTicketSalesByType(): Promise<TicketTypeSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [
      { ticketType: "vinwonders", soldQty: 0, officeProfitVnd: 0 },
      { ticketType: "teatro_do", soldQty: 0, officeProfitVnd: 0 },
    ];
  }

  const [{ data: sales }, { data: tmpl }] = await Promise.all([
    supabase.from("ticket_sales").select("qty, office_profit_vnd, template_id"),
    supabase.from("ticket_templates").select("id, ticket_type"),
  ]);

  const idToType = new Map(
    (tmpl as { id: string; ticket_type: string }[] | null)?.map((t) => [t.id, t.ticket_type]) || [],
  );

  const map = new Map<string, { qty: number; profit: number }>();
  for (const row of (sales as { qty: number; office_profit_vnd: number; template_id: string }[] | null) || []) {
    const tt = idToType.get(row.template_id);
    if (tt !== "vinwonders" && tt !== "teatro_do") continue;
    const cur = map.get(tt) || { qty: 0, profit: 0 };
    cur.qty += row.qty;
    cur.profit += Number(row.office_profit_vnd) || 0;
    map.set(tt, cur);
  }

  const vin = map.get("vinwonders") || { qty: 0, profit: 0 };
  const teatro = map.get("teatro_do") || { qty: 0, profit: 0 };
  return [
    { ticketType: "vinwonders", soldQty: vin.qty, officeProfitVnd: vin.profit },
    { ticketType: "teatro_do", soldQty: teatro.qty, officeProfitVnd: teatro.profit },
  ];
}

export interface TicketTemplateOption {
  id: string;
  name: string;
  ticketType: string;
  salePriceVnd: number;
}

export async function listTicketTemplates(): Promise<TicketTemplateOption[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ticket_templates")
    .select("id,name,ticket_type,sale_price_vnd")
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return (data as { id: string; name: string; ticket_type: string; sale_price_vnd: number }[]).map((r) => ({
    id: r.id,
    name: r.name,
    ticketType: r.ticket_type,
    salePriceVnd: Number(r.sale_price_vnd),
  }));
}

export async function isUserAssignedGuideOnTour(tourId: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("tour_guides")
    .select("id")
    .eq("tour_id", tourId)
    .eq("guide_id", userId)
    .limit(1);

  return !error && !!data && data.length > 0;
}

/** Сумма прайса и остаток долга по брони (для проверки доплаты гидом). */
export async function getBookingDueVndBreakdown(bookingId: string): Promise<{ totalVnd: number; dueVnd: number } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: priceRows } = await supabase.from("booking_prices").select("amount_vnd").eq("booking_id", bookingId);
  const total = (priceRows || []).reduce((s, p) => s + Number(p.amount_vnd), 0);
  let paymentRows: PaymentRowAgg[] | null = null;
  const full = await supabase
    .from("payments")
    .select("amount_vnd,kind,remitted_to_cash_at")
    .eq("booking_id", bookingId);
  if (!full.error && full.data) {
    paymentRows = full.data as PaymentRowAgg[];
  } else if (full.error && /remitted_to_cash_at|column|does not exist/i.test(String(full.error.message))) {
    const leg = await supabase.from("payments").select("amount_vnd,kind").eq("booking_id", bookingId);
    paymentRows = (leg.data || []).map((r) => ({
      booking_id: bookingId,
      amount_vnd: Number((r as { amount_vnd: number }).amount_vnd),
      kind: String((r as { kind: string }).kind),
      remitted_to_cash_at: undefined,
    }));
  } else if (full.error) {
    return null;
  } else {
    paymentRows = [];
  }
  const ex = aggregatePaymentsEx(
    (paymentRows || []).map((r) => ({
      ...r,
      booking_id: bookingId,
      amount_vnd: Number(r.amount_vnd) || 0,
      kind: String(r.kind),
    })),
  );
  const agg = ex.get(bookingId) || emptyPayAggEx();
  const paidOfficial = paidOfficialFromAgg(agg);
  return { totalVnd: total, dueVnd: Math.max(0, total - paidOfficial) };
}

export async function getTourById(id: string): Promise<Tour | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        "[crm] getTourById: нет Supabase admin (проверьте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local). Реальные UUID туров не найдутся - будет 404 на /tours/[id]/accounting.",
      );
    }
    return mockTours.find((t) => t.id === id) ?? null;
  }

  const tourSelectWithDispatchNoDescOv =
    "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,guide_cash_deposit_vnd,accountant_guide_salary_vnd,accountant_salary_sheet_json,guide_settlement_guide_paid_office_at,guide_settlement_guide_paid_office_proof_url,guide_settlement_office_paid_guide_at,guide_settlement_office_paid_guide_proof_url,accountant_dispatch_expenses_reviewed_at,accountant_dispatch_expenses_note";
  const tourSelectWithDispatch = `${tourSelectWithDispatchNoDescOv},description_override`;
  const tourSelectDispatchNoteOnly =
    "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,guide_cash_deposit_vnd,accountant_guide_salary_vnd,accountant_salary_sheet_json,guide_settlement_guide_paid_office_at,guide_settlement_guide_paid_office_proof_url,guide_settlement_office_paid_guide_at,guide_settlement_office_paid_guide_proof_url,accountant_dispatch_expenses_note";

  let tourFull = await supabase.from("tours").select(tourSelectWithDispatch).eq("id", id).is("deleted_at", null).single();
  let tourRow = tourFull.data as DbTour | null;
  let tourErr = tourFull.error;
  if (tourErr && tourErrMissingColumn(tourErr.message, "description_override")) {
    const retry = await supabase.from("tours").select(tourSelectWithDispatchNoDescOv).eq("id", id).is("deleted_at", null).single();
    tourRow = retry.data as DbTour | null;
    tourErr = retry.error;
  }
  if (tourErr && tourErrMissingColumn(tourErr.message, "accountant_dispatch_expenses_reviewed_at")) {
    const noRev = await supabase.from("tours").select(tourSelectDispatchNoteOnly).eq("id", id).is("deleted_at", null).single();
    tourRow = noRev.data as DbTour | null;
    tourErr = noRev.error;
  }
  if (tourErr && tourErrMissingColumn(tourErr.message, "accountant_dispatch_expenses_note")) {
    const noDispatch = await supabase
      .from("tours")
      .select(
        "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,guide_cash_deposit_vnd,accountant_guide_salary_vnd,accountant_salary_sheet_json,guide_settlement_guide_paid_office_at,guide_settlement_guide_paid_office_proof_url,guide_settlement_office_paid_guide_at,guide_settlement_office_paid_guide_proof_url",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    tourRow = noDispatch.data as DbTour | null;
    tourErr = noDispatch.error;
  }
  if (
    tourErr &&
    (tourErrMissingColumn(tourErr.message, "guide_settlement_guide_paid_office_at") ||
      tourErrMissingColumn(tourErr.message, "guide_settlement_guide_paid_office_proof_url") ||
      tourErrMissingColumn(tourErr.message, "guide_settlement_office_paid_guide_at") ||
      tourErrMissingColumn(tourErr.message, "guide_settlement_office_paid_guide_proof_url"))
  ) {
    const mid = await supabase
      .from("tours")
      .select(
        "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,guide_cash_deposit_vnd,accountant_guide_salary_vnd,accountant_salary_sheet_json",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    tourRow = mid.data as DbTour | null;
    tourErr = mid.error;
  }
  if (
    tourErr &&
    (tourErrMissingColumn(tourErr.message, "accountant_guide_salary_vnd") ||
      tourErrMissingColumn(tourErr.message, "accountant_salary_sheet_json"))
  ) {
    const leg = await supabase
      .from("tours")
      .select(
        "id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id,guide_cash_deposit_vnd",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    tourRow = leg.data as DbTour | null;
    tourErr = leg.error;
  }
  if (tourErr && tourErrMissingColumn(tourErr.message, "guide_cash_deposit_vnd")) {
    const leg2 = await supabase
      .from("tours")
      .select("id,human_id,name,start_at,end_at,tour_type,capacity,status,template_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    tourRow = leg2.data as DbTour | null;
    tourErr = leg2.error;
  }

  // Список /accounting берёт только id,name,start_at,status - если в tours нет колонок из «толстого» select
  // (internal_rating, template_id, human_id и т.д.), все шаги выше оставляют tourErr - иначе 404 при клике по строке.
  if (tourErr || !tourRow) {
    const bareWide =
      "id,name,start_at,end_at,tour_type,capacity,status,accountant_guide_salary_vnd,accountant_salary_sheet_json,guide_cash_deposit_vnd";
    let bare = await supabase.from("tours").select(bareWide).eq("id", id).is("deleted_at", null).single();
    if (
      bare.error &&
      (tourErrMissingColumn(bare.error.message, "accountant_guide_salary_vnd") ||
        tourErrMissingColumn(bare.error.message, "accountant_salary_sheet_json") ||
        tourErrMissingColumn(bare.error.message, "guide_cash_deposit_vnd"))
    ) {
      bare = await supabase
        .from("tours")
        .select("id,name,start_at,end_at,tour_type,capacity,status")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
    }
    if (bare.error) {
      bare = await supabase.from("tours").select("id,name,start_at,status").eq("id", id).is("deleted_at", null).single();
    }
    if (!bare.error && bare.data) {
      const d = bare.data as {
        id: string;
        name: string;
        start_at: string;
        end_at?: string | null;
        tour_type?: string | null;
        capacity?: number | string | null;
        status: string;
        accountant_guide_salary_vnd?: number | string | null;
        accountant_salary_sheet_json?: string | null;
        guide_cash_deposit_vnd?: number | string | null;
      };
      tourRow = {
        id: d.id,
        human_id: 0,
        name: d.name,
        start_at: d.start_at,
        end_at: typeof d.end_at === "string" && d.end_at.trim() ? d.end_at : d.start_at,
        capacity: d.capacity != null && d.capacity !== "" ? Math.max(0, Math.round(Number(d.capacity))) : 0,
        status: d.status as DbTour["status"],
        ...(d.tour_type !== undefined ? { tour_type: d.tour_type } : {}),
        ...(d.accountant_guide_salary_vnd !== undefined ? { accountant_guide_salary_vnd: d.accountant_guide_salary_vnd } : {}),
        ...(d.accountant_salary_sheet_json !== undefined ? { accountant_salary_sheet_json: d.accountant_salary_sheet_json } : {}),
        ...(d.guide_cash_deposit_vnd !== undefined ? { guide_cash_deposit_vnd: d.guide_cash_deposit_vnd } : {}),
      } as DbTour;
      tourErr = null;
    }
  }

  const [{ data: assignRows }, { data: bookingRows }, busRes] = await Promise.all([
    supabase.from("tour_guides").select("id,guide_id,is_primary,is_inspection,note,users(full_name,phone,role)").eq("tour_id", id),
    supabase.from("bookings").select("id,tour_id,adults,children,infants").eq("tour_id", id).is("deleted_at", null),
    supabase
      .from("bus_assignments")
      .select("id,bus_number,seats,comment,lang_note_en,lang_note_vn,assigned_by")
      .eq("tour_id", id),
  ]);

  const intentPrimaryTour = await supabase
    .from("tour_booking_intents")
    .select("tour_id,adults,children,infants,expires_at,editing_booking_id")
    .eq("tour_id", id)
    .gt("expires_at", new Date().toISOString());
  let intentRowsSafe: TourBookingIntentAggRow[] = [];
  if (intentPrimaryTour.error && tourErrMissingColumn(intentPrimaryTour.error.message, "editing_booking_id")) {
    const intentFbTour = await supabase
      .from("tour_booking_intents")
      .select("tour_id,adults,children,infants,expires_at")
      .eq("tour_id", id)
      .gt("expires_at", new Date().toISOString());
    intentRowsSafe =
      intentFbTour.error || !intentFbTour.data ? [] : (intentFbTour.data as TourBookingIntentAggRow[]);
  } else if (intentPrimaryTour.error || !intentPrimaryTour.data) {
    intentRowsSafe = [];
  } else {
    intentRowsSafe = intentPrimaryTour.data as TourBookingIntentAggRow[];
  }

  let busRows = busRes.data as
    | {
        id: string;
        bus_number: string;
        seats: number | null;
        comment: string | null;
        lang_note_en?: string | null;
        lang_note_vn?: string | null;
        assigned_by?: string | null;
      }[]
    | null;
  if (busRes.error && /lang_note_en|lang_note_vn|assigned_by|column|does not exist/i.test(String(busRes.error.message))) {
    const leg = await supabase.from("bus_assignments").select("id,bus_number,seats,comment").eq("tour_id", id);
    busRows = leg.data as typeof busRows;
  }

  const assignerIds = [...new Set((busRows ?? []).map((r) => r.assigned_by).filter((x): x is string => Boolean(x)))];
  let assignerNameById = new Map<string, string>();
  if (assignerIds.length) {
    const { data: urows } = await supabase.from("users").select("id,full_name").in("id", assignerIds);
    assignerNameById = new Map(
      ((urows as { id: string; full_name: string }[] | null) ?? []).map((u) => [u.id, u.full_name]),
    );
  }

  if (tourErr || !tourRow) return null;
  const assignedGuides: TourGuideSlot[] = (assignRows as { id: string; guide_id: string; is_primary: boolean; is_inspection: boolean; note?: string | null; users: unknown }[] | null)?.map(
    (r) => ({
      rowId: r.id,
      guideId: r.guide_id,
      fullName: embedFullName(r.users),
      role: (() => {
        const userObj = unwrapSupabaseOne(r.users) as { role?: unknown } | null;
        const v = String(userObj?.role ?? "");
        return v as Role;
      })(),
      phone: embedPhone(r.users),
      note: r.note ?? null,
      isPrimary: r.is_primary,
      isInspection: r.is_inspection,
    }),
  ) || [];
  const primary = assignedGuides.find((g) => g.isPrimary) || assignedGuides[0];
  const guideName = primary?.fullName || "Unassigned";
  const bookedByTourId = new Map<string, number>();
  const headcountByTourId = new Map<string, number>();
  const bookingSeatById = new Map<string, { seats: number; heads: number; tour_id: string }>();
  for (const r of bookingRows || []) {
    const row = r as {
      id: string;
      tour_id: string;
      adults?: number;
      children?: number;
      infants?: number;
    };
    const a = Math.max(0, Number(row.adults ?? 0));
    const c = Math.max(0, Number(row.children ?? 0));
    const inf = Math.max(0, Number(row.infants ?? 0));
    const seats = a + c;
    const heads = a + c + inf;
    bookedByTourId.set(id, (bookedByTourId.get(id) || 0) + seats);
    headcountByTourId.set(id, (headcountByTourId.get(id) || 0) + heads);
    bookingSeatById.set(row.id, { seats, heads, tour_id: row.tour_id });
  }
  applyTourBookingIntentsToTourMaps(bookedByTourId, headcountByTourId, intentRowsSafe, bookingSeatById);
  const bookedSeats = bookedByTourId.get(id) || 0;
  const paxHeadcount = headcountByTourId.get(id) || 0;
  const buses: TourBusAssignment[] =
    (busRows ?? []).map((b) => ({
      id: b.id,
      busNumber: b.bus_number,
      seats: b.seats,
      comment: b.comment,
      langNoteEn: b.lang_note_en ?? null,
      langNoteVn: b.lang_note_vn ?? null,
      assignedByName: b.assigned_by ? assignerNameById.get(b.assigned_by) ?? null : null,
    })) ?? [];
  const busInfo =
    buses.length > 0
      ? formatTourBusInfoSummary(buses.map((b) => ({ plate: b.busNumber, comment: b.comment })))
      : undefined;
  return mapTourRow(tourRow as DbTour, guideName, bookedSeats, {
    busInfo,
    buses,
    assignedGuides,
    paxHeadcount,
  });
}

export async function getTourDispatcherBookingEntry(
  tourId: string,
): Promise<TourDispatcherBookingEntry | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const full = await supabase
    .from("tour_dispatcher_bookings")
    .select("tour_id,note,photo_url,updated_at,updated_by")
    .eq("tour_id", tourId)
    .maybeSingle();

  let row = full.data as
    | { tour_id: string; note: string | null; photo_url: string | null; updated_at: string | null; updated_by?: string | null }
    | null;
  let err = full.error;
  if (err && /updated_by|column|does not exist/i.test(String(err.message))) {
    const fallback = await supabase
      .from("tour_dispatcher_bookings")
      .select("tour_id,note,photo_url,updated_at")
      .eq("tour_id", tourId)
      .maybeSingle();
    row = fallback.data as typeof row;
    err = fallback.error;
  }
  if (err || !row) return null;

  let updatedByName: string | null = null;
  let updatedByPhone: string | null = null;
  if (row.updated_by) {
    const { data: u } = await supabase.from("users").select("full_name,phone").eq("id", row.updated_by).maybeSingle();
    updatedByName = (u as { full_name?: string } | null)?.full_name ?? null;
    updatedByPhone = (u as { phone?: string | null } | null)?.phone?.trim() || null;
  }

  return {
    tourId: row.tour_id,
    note: row.note ?? null,
    photoUrl: row.photo_url ?? null,
    updatedAt: row.updated_at ?? null,
    updatedByName,
    updatedByPhone,
  };
}

/** Описание тура (берётся из tour_templates.description по template_id). */
export async function getTourTemplateDescription(templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tour_templates")
    .select("description")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { description?: string | null }).description ?? null;
}

/** Текст описания для карточки/страницы тура: переопределение выезда или шаблон. */
export async function getResolvedTourDescriptionForTour(
  tour: Pick<Tour, "templateId" | "descriptionOverride">,
): Promise<string | null> {
  const ov = tour.descriptionOverride?.trim();
  if (ov) return ov;
  return getTourTemplateDescription(tour.templateId);
}

export async function getTourTemplateShopLabel(templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tour_templates")
    .select("shop_label")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { shop_label?: string | null }).shop_label ?? null;
}

/** Текст из шаблона для отправки туристу вместе с квитанцией (копирование / WhatsApp). */
export async function getTourTemplateTouristSendCopy(templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tour_templates")
    .select("tourist_send_copy")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) return null;
  const raw = (data as { tourist_send_copy?: string | null }).tourist_send_copy;
  const t = raw != null ? String(raw).trim() : "";
  return t || null;
}

export async function getTourTemplateGuideTouristMessage(templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tour_templates")
    .select("guide_tourist_message")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { guide_tourist_message?: string | null }).guide_tourist_message;
  return raw != null ? String(raw).trim() || null : null;
}

export async function getTourTemplateReviewMessage(templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tour_templates")
    .select("review_message")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { review_message?: string | null }).review_message;
  return raw != null ? String(raw).trim() || null : null;
}

export async function getManagerTourMessageOverride(
  tourId: string,
  userId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("tour_message_overrides")
    .select("text")
    .eq("tour_id", tourId)
    .eq("user_id", userId)
    .eq("type", "tourist")
    .maybeSingle();
  const raw = (data as { text?: string | null } | null)?.text;
  return raw ? String(raw).trim() || null : null;
}

export async function listBookingsForTour(tourId: string): Promise<Booking[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return mockBookings
      .filter((b) => b.tourId === tourId)
      .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
  }
  await backfillMissingOnlineCodes(supabase, 400);
  // Best-effort: исправляем pickup_time, записанный по багу как UTC (напр. 22:00 вместо 05:00 по Вьетнаму).
  try {
    const { data: tourRow } = await supabase.from("tours").select("start_at").eq("id", tourId).maybeSingle();
    const startIso = typeof tourRow?.start_at === "string" ? tourRow.start_at : "";
    const correctHhMm = startIso ? hhmmFromIsoInTourTz(startIso) : "";
    const buggyHhMm = startIso ? legacyUtcDefaultPickupBugHhMm(startIso) : "";
    if (correctHhMm && buggyHhMm && correctHhMm !== buggyHhMm) {
      const buggyVariants = Array.from(
        new Set([`${buggyHhMm}:00`, buggyHhMm, `${buggyHhMm}:00:00`]),
      );
      await supabase
        .from("bookings")
        .update({ pickup_time: `${correctHhMm}:00` })
        .eq("tour_id", tourId)
        .is("deleted_at", null)
        .in("pickup_time", buggyVariants);
    }
  } catch {
    // no-op
  }

  const selectWithPhotoPassportAlt =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,phone_alt_e164,pickup_time,adults,children,infants,note,dispatcher_booking_photo_url,passport_photo_urls,online_code,briefing_sent_at,users!bookings_manager_id_fkey(full_name)";
  const selectWithPhotoPassport =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,pickup_time,adults,children,infants,note,dispatcher_booking_photo_url,passport_photo_urls,online_code,briefing_sent_at,users!bookings_manager_id_fkey(full_name)";
  const selectWithPhoto =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,pickup_time,adults,children,infants,note,dispatcher_booking_photo_url,online_code,briefing_sent_at,users!bookings_manager_id_fkey(full_name)";
  const selectWithPhotoNoOnline =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,pickup_time,adults,children,infants,note,dispatcher_booking_photo_url,briefing_sent_at,users!bookings_manager_id_fkey(full_name)";
  const selectLegacy =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,pickup_time,adults,children,infants,note,online_code,briefing_sent_at,users!bookings_manager_id_fkey(full_name)";
  const selectMinimal =
    "id,tour_id,manager_id,created_at,customer_name,hotel_name,hotel_maps_url,room,phone_e164,pickup_time,adults,children,infants,note,users!bookings_manager_id_fkey(full_name)";

  let bookingRows: DbBooking[] | null = null;
  {
    const run = async (sel: string) =>
      supabase.from("bookings").select(sel).eq("tour_id", tourId).is("deleted_at", null).order("pickup_time", { ascending: true });

    const candidates = [
      selectWithPhotoPassportAlt,
      selectWithPhotoPassport,
      selectWithPhoto,
      selectWithPhotoNoOnline,
      selectLegacy,
      selectMinimal,
    ];
    for (const sel of candidates) {
      const res = await run(sel);
      if (!res.error && res.data && Array.isArray(res.data)) {
        bookingRows = res.data as unknown as DbBooking[];
        break;
      }
    }
    if (!bookingRows) {
      return mockBookings.filter((b) => b.tourId === tourId).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
    }
  }

  const ids = (bookingRows as DbBooking[]).map((row) => row.id);
  /** Отдельный select: основной запрос мог упасть на passport_photo_urls и уйти на fallback без колонки. */
  const passportUrlsByBookingId = new Map<string, string[]>();
  if (ids.length > 0) {
    const pr = await supabase
      .from("bookings")
      .select("id,passport_photo_urls")
      .in("id", ids)
      .is("deleted_at", null);
    if (!pr.error && pr.data) {
      for (const r of pr.data as { id: string; passport_photo_urls?: unknown }[]) {
        const raw = r.passport_photo_urls;
        if (!Array.isArray(raw)) continue;
        const urls = raw.filter((u): u is string => typeof u === "string" && u.length > 0);
        if (urls.length) passportUrlsByBookingId.set(r.id, urls);
      }
    }
  }
  /** Основной select иногда без колонки online_code - добираем код ON отдельно. */
  const onlineById = new Map<string, string>();
  if (ids.length > 0) {
    const onRes = await supabase.from("bookings").select("id,online_code").in("id", ids).is("deleted_at", null);
    if (!onRes.error && onRes.data) {
      for (const r of onRes.data as { id: string; online_code?: string | null }[]) {
        const c = r.online_code?.trim();
        if (c) onlineById.set(r.id, c);
      }
    }
  }
  const telegramByBookingId = new Map<string, string>();
  if (ids.length > 0) {
    const tgRes = await supabase
      .from("bookings")
      .select("id,telegram_username")
      .in("id", ids)
      .is("deleted_at", null);
    if (!tgRes.error && tgRes.data) {
      for (const r of tgRes.data as { id: string; telegram_username?: string | null }[]) {
        const t = r.telegram_username?.trim();
        if (t) telegramByBookingId.set(r.id, t);
      }
    }
  }
  const hotelAddressByBookingId = new Map<string, string>();
  if (ids.length > 0) {
    const hotelAddrRes = await supabase
      .from("bookings")
      .select("id,hotel_address")
      .in("id", ids)
      .is("deleted_at", null);
    if (!hotelAddrRes.error && hotelAddrRes.data) {
      for (const r of hotelAddrRes.data as { id: string; hotel_address?: string | null }[]) {
        const a = r.hotel_address?.trim();
        if (a) hotelAddressByBookingId.set(r.id, a);
      }
    }
  }
  let paymentRowsRaw: PaymentRowAgg[] = [];
  const payFull = await supabase
    .from("payments")
    .select("id,booking_id,amount_vnd,kind,created_at,remitted_to_cash_at")
    .in("booking_id", ids);
  if (payFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(payFull.error.message))) {
    const leg = await supabase.from("payments").select("id,booking_id,amount_vnd,kind,created_at").in("booking_id", ids);
    paymentRowsRaw = ((leg.data || []) as PaymentRowAgg[]).map((r) => ({ ...r, remitted_to_cash_at: undefined }));
  } else if (!payFull.error && payFull.data) {
    paymentRowsRaw = payFull.data as PaymentRowAgg[];
  }

  const payAggMap = aggregatePaymentsEx(paymentRowsRaw);

  const { data: priceRows } = await supabase
    .from("booking_prices")
    .select("id,booking_id,person_label,amount_vnd")
    .in("booking_id", ids)
    .order("id", { ascending: true });
  const totalByBooking = new Map<string, number>();
  const linesByBooking = new Map<string, Array<{ label: string; amountVnd: number }>>();
  for (const p of priceRows || []) {
    const row = p as { booking_id: string; person_label?: string | null; amount_vnd: number | string };
    const bid = row.booking_id;
    const amt = Number(row.amount_vnd);
    totalByBooking.set(bid, (totalByBooking.get(bid) || 0) + amt);
    const label = (row.person_label && String(row.person_label).trim()) || "Позиция";
    if (!linesByBooking.has(bid)) linesByBooking.set(bid, []);
    linesByBooking.get(bid)!.push({ label, amountVnd: amt });
  }

  return (bookingRows as DbBooking[]).map((row) => {
    const total = totalByBooking.get(row.id) || 0;
    const agg = payAggMap.get(row.id) || emptyPayAggEx();
    const paidOfficial = paidOfficialFromAgg(agg);
    const topupTotal = agg.topupRemitted + agg.topupPending;
    const due = Math.max(0, total - paidOfficial);
    return {
      id: row.id,
      tourId: row.tour_id,
      managerId: row.manager_id,
      managerName: bookingManagerFullName(row.users),
      createdAt: row.created_at,
      hotel: row.hotel_name,
      hotelAddress: hotelAddressByBookingId.get(row.id) || "",
      mapsUrl: row.hotel_maps_url || "",
      room: row.room || "",
      customerName: row.customer_name,
      phone: row.phone_e164,
      ...(row.phone_alt_e164?.trim() ? { phoneAlt: row.phone_alt_e164.trim() } : {}),
      telegramUsername: telegramByBookingId.get(row.id),
      pickupTime: row.pickup_time?.slice(0, 5) || "00:00",
      adults: row.adults,
      children: row.children,
      infants: row.infants,
      totalVnd: total,
      priceLines: linesByBooking.get(row.id),
      depositVnd: agg.deposit,
      topupVnd: topupTotal,
      officeCashVnd: agg.officeCash,
      paidVnd: paidOfficial,
      dueVnd: due,
      paymentStatus: paymentStatusFrom(total, paidOfficial),
      note: row.note || undefined,
      dispatcherBookingPhotoUrl: row.dispatcher_booking_photo_url ?? null,
      passportPhotoUrls: (() => {
        const merged = passportUrlsByBookingId.get(row.id);
        if (merged?.length) return merged;
        const raw = (row as { passport_photo_urls?: unknown }).passport_photo_urls;
        if (!Array.isArray(raw)) return undefined;
        const urls = raw.filter((u): u is string => typeof u === "string" && u.length > 0);
        return urls.length ? urls : undefined;
      })(),
      onlineCode: onlineById.get(row.id) || row.online_code?.trim() || undefined,
      pendingGuideTopupVnd: agg.topupPending,
      pendingGuideTopups: agg.pendingTopups,
      briefingSentAt: (row as { briefing_sent_at?: string | null }).briefing_sent_at ?? null,
    };
  });
}

type DbDeletedItem = {
  id: string;
  entity: string;
  entity_id: string;
  payload: {
    customer_name?: string;
    tour_id?: string;
  };
  restore_until: string;
};

export async function listDeletedBookings(): Promise<DeletedBookingItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("deleted_items")
    .select("id,entity,entity_id,payload,restore_until")
    .eq("entity", "booking")
    .gte("restore_until", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as DbDeletedItem[]).map((item) => ({
    id: item.id,
    entityId: item.entity_id,
    customerName: item.payload?.customer_name || "Unknown",
    tourId: item.payload?.tour_id || "",
    restoreUntil: item.restore_until,
  }));
}

function addDaysToLocalDate(from: string, days: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateString(dt);
}

async function loadManagerOffMap(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userIds: string[],
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!userIds.length) return map;
  const { data, error } = await supabase
    .from("manager_days_off")
    .select("manager_id,day_off")
    .in("manager_id", userIds)
    .gte("day_off", from)
    .lte("day_off", to);
  if (error || !data) return map;
  for (const row of data as { manager_id: string; day_off: string }[]) {
    const day = row.day_off.slice(0, 10);
    if (!map.has(row.manager_id)) map.set(row.manager_id, new Set());
    map.get(row.manager_id)!.add(day);
  }
  const visaRes = await supabase
    .from("employee_visa_runs")
    .select("user_id,staff_mode,day_from,day_to")
    .in("user_id", userIds)
    .eq("staff_mode", "manager")
    .lte("day_from", to)
    .gte("day_to", from);
  if (!visaRes.error && visaRes.data) {
    for (const row of visaRes.data as { user_id: string; day_from: string; day_to: string }[]) {
      const uid = String(row.user_id || "");
      if (!uid) continue;
      const start = String(row.day_from).slice(0, 10);
      const end = String(row.day_to).slice(0, 10);
      const cur = new Date(`${start}T00:00:00`);
      const toDate = new Date(`${end}T00:00:00`);
      while (cur.getTime() <= toDate.getTime()) {
        const day = localDateString(cur);
        if (day >= from && day <= to) {
          if (!map.has(uid)) map.set(uid, new Set());
          map.get(uid)!.add(day);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return map;
}

async function loadGuideOffMap(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userIds: string[],
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!userIds.length) return map;
  const { data, error } = await supabase
    .from("guide_days_off")
    .select("guide_id,day_off")
    .in("guide_id", userIds)
    .gte("day_off", from)
    .lte("day_off", to);
  if (error || !data) return map;
  for (const row of data as { guide_id: string; day_off: string }[]) {
    const day = row.day_off.slice(0, 10);
    if (!map.has(row.guide_id)) map.set(row.guide_id, new Set());
    map.get(row.guide_id)!.add(day);
  }
  const visaRes = await supabase
    .from("employee_visa_runs")
    .select("user_id,staff_mode,day_from,day_to")
    .in("user_id", userIds)
    .eq("staff_mode", "guide")
    .lte("day_from", to)
    .gte("day_to", from);
  if (!visaRes.error && visaRes.data) {
    for (const row of visaRes.data as { user_id: string; day_from: string; day_to: string }[]) {
      const uid = String(row.user_id || "");
      if (!uid) continue;
      const start = String(row.day_from).slice(0, 10);
      const end = String(row.day_to).slice(0, 10);
      const cur = new Date(`${start}T00:00:00`);
      const toDate = new Date(`${end}T00:00:00`);
      while (cur.getTime() <= toDate.getTime()) {
        const day = localDateString(cur);
        if (day >= from && day <= to) {
          if (!map.has(uid)) map.set(uid, new Set());
          map.get(uid)!.add(day);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return map;
}

type RosterExtras = Partial<
  Pick<
    RosterUser,
    | "avatarUrl"
    | "salesCount"
    | "guideTripsCount"
    | "guideRatingAvg"
    | "guideReviewsCount"
    | "managerRatingAvg"
    | "managerReviewsCount"
    | "managerSalesCommissionPercent"
    | "hiddenFromRoster"
    | "rosterContactPrivate"
    | "rentalPointId"
    | "rentalPointName"
  >
>;

function toRosterUser(
  id: string,
  fullName: string,
  role: Role,
  offMap: Map<string, Set<string>>,
  today: string,
  horizonEnd: string,
  whatsappPhone: string | null = null,
  extras: RosterExtras = {},
): RosterUser {
  const set = offMap.get(id) || new Set();
  const offToday = set.has(today);
  const upcomingDaysOff = [...set].filter((d) => d >= today && d <= horizonEnd).sort();
  return { id, fullName, role, offToday, upcomingDaysOff, whatsappPhone, ...extras };
}

function aggToAvg(agg: { sum: number; n: number } | undefined): { avg: number | null; n: number } {
  if (!agg || agg.n === 0) return { avg: null, n: 0 };
  return { avg: Math.round((agg.sum / agg.n) * 10) / 10, n: agg.n };
}

async function loadRosterPerformanceMaps(supabase: SupabaseClient): Promise<{
  salesByManager: Map<string, number>;
  guideAgg: Map<string, { sum: number; n: number }>;
  managerRevAgg: Map<string, { sum: number; n: number }>;
}> {
  const salesByManager = new Map<string, number>();
  const guideAgg = new Map<string, { sum: number; n: number }>();
  const managerRevAgg = new Map<string, { sum: number; n: number }>();

  const { data: bRows, error: bErr } = await supabase.from("bookings").select("manager_id").is("deleted_at", null);
  if (!bErr && bRows) {
    for (const r of bRows as { manager_id: string }[]) {
      salesByManager.set(r.manager_id, (salesByManager.get(r.manager_id) || 0) + 1);
    }
  }

  const { data: gRows, error: gErr } = await supabase.from("guide_reviews").select("guide_id,rating");
  if (!gErr && gRows) {
    for (const r of gRows as { guide_id: string; rating: number | string }[]) {
      const rate = Number(r.rating);
      if (Number.isNaN(rate)) continue;
      const cur = guideAgg.get(r.guide_id) || { sum: 0, n: 0 };
      cur.sum += rate;
      cur.n += 1;
      guideAgg.set(r.guide_id, cur);
    }
  }

  const { data: mRows, error: mErr } = await supabase.from("manager_reviews").select("manager_id,rating");
  if (!mErr && mRows) {
    for (const r of mRows as { manager_id: string; rating: number | string }[]) {
      const rate = Number(r.rating);
      if (Number.isNaN(rate)) continue;
      const cur = managerRevAgg.get(r.manager_id) || { sum: 0, n: 0 };
      cur.sum += rate;
      cur.n += 1;
      managerRevAgg.set(r.manager_id, cur);
    }
  }

  return { salesByManager, guideAgg, managerRevAgg };
}

const TEAM_ROSTER_ROLES_ALL: Role[] = [
  "director",
  "chief_manager",
  "manager",
  "chief_guide",
  "guide",
  "accountant",
  "dispatcher",
];

function teamRosterRoleFilter(viewerRole: Role): Role[] {
  if (viewerRole === "director") return [...TEAM_ROSTER_ROLES_ALL];
  /** Офис и полевые роли видят общий состав команды. */
  if (
    viewerRole === "chief_manager" ||
    viewerRole === "manager" ||
    viewerRole === "chief_guide" ||
    viewerRole === "guide" ||
    viewerRole === "accountant" ||
    viewerRole === "dispatcher"
  ) {
    return [...TEAM_ROSTER_ROLES_ALL];
  }
  return [];
}

function isTeamLeadershipRole(role: Role): boolean {
  return role === "director" || role === "chief_manager" || role === "chief_guide";
}

function leadershipOrder(role: Role): number {
  if (role === "director") return 0;
  if (role === "chief_manager") return 1;
  if (role === "chief_guide") return 2;
  return 99;
}

/** Без выходного выше; начальство; менеджеры по продажам; гиды по числу выездов. */
export function sortTeamRosterRows(rows: RosterUser[]): RosterUser[] {
  return [...rows].sort((a, b) => {
    const offA = a.offToday ? 1 : 0;
    const offB = b.offToday ? 1 : 0;
    if (offA !== offB) return offA - offB;

    const seg = (r: RosterUser) => {
      if (isTeamLeadershipRole(r.role)) return 0;
      if (r.role === "manager") return 1;
      if (r.role === "guide") return 2;
      return 3;
    };
    const sA = seg(a);
    const sB = seg(b);
    if (sA !== sB) return sA - sB;

    if (sA === 0) {
      const o = leadershipOrder(a.role) - leadershipOrder(b.role);
      if (o !== 0) return o;
      return a.fullName.localeCompare(b.fullName, "ru");
    }
    if (sA === 1) {
      const salesA = a.salesCount ?? 0;
      const salesB = b.salesCount ?? 0;
      if (salesB !== salesA) return salesB - salesA;
      return a.fullName.localeCompare(b.fullName, "ru");
    }
    if (sA === 2) {
      const tA = a.guideTripsCount ?? 0;
      const tB = b.guideTripsCount ?? 0;
      if (tB !== tA) return tB - tA;
      return a.fullName.localeCompare(b.fullName, "ru");
    }
    return a.fullName.localeCompare(b.fullName, "ru");
  });
}

async function loadGuideTripCounts(
  supabase: SupabaseClient,
  guideIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!guideIds.length) return map;
  const { data: tgRows, error: tgErr } = await supabase
    .from("tour_guides")
    .select("guide_id,tour_id")
    .in("guide_id", guideIds);
  if (tgErr || !tgRows?.length) return map;

  const tourIds = [...new Set((tgRows as { tour_id: string }[]).map((r) => r.tour_id))];
  if (!tourIds.length) return map;

  const { data: tourRows, error: tourErr } = await supabase
    .from("tours")
    .select("id,deleted_at,status")
    .in("id", tourIds);
  if (tourErr || !tourRows) return map;

  const validTour = new Set<string>();
  for (const t of tourRows as { id: string; deleted_at: string | null; status: string }[]) {
    if (t.deleted_at == null && t.status !== "deleted") validTour.add(t.id);
  }

  const byGuide = new Map<string, Set<string>>();
  for (const row of tgRows as { guide_id: string; tour_id: string }[]) {
    if (!validTour.has(row.tour_id)) continue;
    if (!byGuide.has(row.guide_id)) byGuide.set(row.guide_id, new Set());
    byGuide.get(row.guide_id)!.add(row.tour_id);
  }
  for (const [gid, set] of byGuide) {
    map.set(gid, set.size);
  }
  return map;
}

/** Единый список команды для страницы «Команда» (с учётом прав зрителя). */
export async function listTeamRoster(viewerRole: Role): Promise<RosterUser[]> {
  const allowedRoles = teamRosterRoleFilter(viewerRole);
  if (!allowedRoles.length) return [];

  const supabase = getSupabaseAdmin();
  const today = localDateString();
  const horizonEnd = addDaysToLocalDate(today, 120);

  if (!supabase) {
    const rows: RosterUser[] = [];
    if (allowedRoles.includes("director")) {
      rows.push(toRosterUser("mock-dir", "Demo Director", "director", new Map(), today, horizonEnd, "+70000000001"));
    }
    if (allowedRoles.includes("chief_guide")) {
      rows.push(
        toRosterUser("mock-cg", "Star Guide", "chief_guide", new Map(), today, horizonEnd, "+70000000002", {
          guideTripsCount: 120,
          guideRatingAvg: 4.8,
          guideReviewsCount: 4,
        }),
      );
    }
    if (allowedRoles.includes("chief_manager")) {
      rows.push(
        toRosterUser("mock-cm", "Star Manager", "chief_manager", new Map(), today, horizonEnd, "+70000000003", {
          salesCount: 42,
          managerRatingAvg: 4.5,
          managerReviewsCount: 3,
        }),
      );
    }
    if (allowedRoles.includes("manager")) {
      rows.push(
        toRosterUser("mock-m1", "Aibek", "manager", new Map(), today, horizonEnd, "+70000000004", {
          salesCount: 100,
          managerRatingAvg: 4.6,
          managerReviewsCount: 5,
        }),
        toRosterUser("mock-m2", "Olga", "manager", new Map([["mock-m2", new Set([today])]]), today, horizonEnd, null, {
          salesCount: 10,
          managerRatingAvg: null,
          managerReviewsCount: 0,
        }),
      );
    }
    if (allowedRoles.includes("guide")) {
      rows.push(
        toRosterUser("mock-g1", "Elena", "guide", new Map(), today, horizonEnd, "+70000000005", {
          guideTripsCount: 48,
          guideRatingAvg: 4.3,
          guideReviewsCount: 12,
        }),
        toRosterUser(
          "mock-g2",
          "Valentina",
          "guide",
          new Map([["mock-g2", new Set([addDaysToLocalDate(today, 2)])]]),
          today,
          horizonEnd,
          "+70000000006",
          { guideTripsCount: 5, guideRatingAvg: null, guideReviewsCount: 0 },
        ),
      );
    }
    if (allowedRoles.includes("accountant")) {
      rows.push(toRosterUser("mock-acc", "Бухгалтер", "accountant", new Map(), today, horizonEnd, "+70000000007"));
    }
    if (allowedRoles.includes("dispatcher")) {
      rows.push(toRosterUser("mock-disp", "Диспетчер", "dispatcher", new Map(), today, horizonEnd, "+70000000008"));
    }
    return sortTeamRosterRows(rows);
  }

  let rows: Record<string, unknown>[] | null = null;
  const rosterSelectBase =
    "id,full_name,role,phone,avatar_url,manager_sales_commission_percent,hidden_from_roster,roster_contact_private";
  const rosterSelectWithPoint = `${rosterSelectBase},rental_point_id,rental_points(name)`;
  const resWithJoin = await supabase
    .from("users")
    .select(rosterSelectWithPoint)
    .eq("is_active", true)
    .in("role", allowedRoles)
    .neq("login", "test")
    .order("full_name");
  let rosterData: Record<string, unknown>[] | null = null;
  let rosterErr = resWithJoin.error;
  if (!rosterErr && resWithJoin.data) {
    rosterData = resWithJoin.data as Record<string, unknown>[];
  } else if (rosterErr && /rental_point|rental_points|column|does not exist/i.test(String(rosterErr.message))) {
    const resIdOnly = await supabase
      .from("users")
      .select(`${rosterSelectBase},rental_point_id`)
      .eq("is_active", true)
      .in("role", allowedRoles)
      .neq("login", "test")
      .order("full_name");
    rosterErr = resIdOnly.error;
    rosterData = resIdOnly.data ? (resIdOnly.data as Record<string, unknown>[]) : null;
    if (rosterErr && /rental_point_id|column|does not exist/i.test(String(rosterErr.message))) {
      const resBase = await supabase
        .from("users")
        .select(rosterSelectBase)
        .eq("is_active", true)
        .in("role", allowedRoles)
        .neq("login", "test")
        .order("full_name");
      rosterErr = resBase.error;
      rosterData = resBase.data ? (resBase.data as Record<string, unknown>[]) : null;
    }
  }
  if (rosterErr && /hidden_from_roster|roster_contact_private|column|does not exist/i.test(String(rosterErr.message))) {
    const leg = await supabase
      .from("users")
      .select("id,full_name,role,phone,avatar_url,manager_sales_commission_percent")
      .eq("is_active", true)
      .in("role", allowedRoles)
      .neq("login", "test")
      .order("full_name");
    rows = (leg.data as Record<string, unknown>[]) || null;
  } else if (rosterErr || !rosterData) {
    return [];
  } else {
    rows = rosterData;
  }
  if (!rows) return [];

  const usersRaw = rows as {
    id: string;
    full_name: string;
    role: Role;
    phone: string | null;
    avatar_url?: string | null;
    manager_sales_commission_percent?: number | string | null;
    hidden_from_roster?: boolean | null;
    roster_contact_private?: boolean | null;
    rental_point_id?: string | null;
    rental_points?: { name: string } | null;
  }[];
  const seeHidden = canSeeHiddenRosterUsers(viewerRole);
  const users = usersRaw.filter((u) => {
    if (u.hidden_from_roster && !seeHidden) return false;
    return true;
  });
  const managerIds = users.filter((u) => u.role === "manager" || u.role === "chief_manager").map((u) => u.id);
  const guideIds = users.filter((u) => u.role === "guide" || u.role === "chief_guide").map((u) => u.id);

  const offMapManager = await loadManagerOffMap(supabase, managerIds, today, horizonEnd);
  const offMapGuide = await loadGuideOffMap(supabase, guideIds, today, horizonEnd);
  const perf = await loadRosterPerformanceMaps(supabase);
  const tripsByGuide = await loadGuideTripCounts(supabase, guideIds);

  const rosterRows = users.map((u) => {
    const offMap =
      u.role === "manager" || u.role === "chief_manager"
        ? offMapManager
        : u.role === "guide" || u.role === "chief_guide"
          ? offMapGuide
          : new Map<string, Set<string>>();
    const phoneRaw = u.phone != null && String(u.phone).trim() !== "" ? String(u.phone).trim() : null;
    const phone = phoneRaw;
    const avatarUrl =
      u.avatar_url != null && String(u.avatar_url).trim() !== "" ? String(u.avatar_url).trim() : null;
    const extras: RosterExtras = {
      avatarUrl,
      hiddenFromRoster: Boolean(u.hidden_from_roster),
      rosterContactPrivate: Boolean(u.roster_contact_private),
    };
    if (u.role === "guide" || u.role === "chief_guide") {
      extras.guideTripsCount = tripsByGuide.get(u.id) ?? 0;
      const g = aggToAvg(perf.guideAgg.get(u.id));
      extras.guideRatingAvg = g.avg;
      extras.guideReviewsCount = g.n;
    } else if (u.role === "manager" || u.role === "chief_manager") {
      extras.salesCount = perf.salesByManager.get(u.id) ?? 0;
      const m = aggToAvg(perf.managerRevAgg.get(u.id));
      extras.managerRatingAvg = m.avg;
      extras.managerReviewsCount = m.n;
      const raw = u.manager_sales_commission_percent;
      extras.managerSalesCommissionPercent =
        raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
      const rpid = u.rental_point_id != null && String(u.rental_point_id).trim() ? String(u.rental_point_id).trim() : null;
      extras.rentalPointId = rpid;
      const rp = u.rental_points;
      extras.rentalPointName =
        rp && typeof rp === "object" && !Array.isArray(rp) && rp.name != null && String(rp.name).trim()
          ? String(rp.name).trim()
          : null;
    }
    return toRosterUser(u.id, u.full_name, u.role, offMap, today, horizonEnd, phone, extras);
  });

  return sortTeamRosterRows(rosterRows);
}

export async function listStaffReviewsForSubject(
  kind: "guide" | "manager",
  subjectId: string,
  limit = 40,
): Promise<StaffReviewRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const table = kind === "guide" ? "guide_reviews" : "manager_reviews";
  const fkCol = kind === "guide" ? "guide_id" : "manager_id";
  const { data: revs, error } = await supabase
    .from(table)
    .select("id,rating,comment,attachment_url,created_at,author_id")
    .eq(fkCol, subjectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !revs?.length) {
    return [];
  }
  const rows = revs as {
    id: string;
    rating: number | string;
    comment: string | null;
    attachment_url: string | null;
    created_at: string;
    author_id: string;
  }[];
  const ids = [...new Set(rows.map((r) => r.author_id))];
  const { data: names } = await supabase.from("users").select("id,full_name").in("id", ids);
  const nameBy = new Map(
    ((names as { id: string; full_name: string }[] | null) ?? []).map((n) => [n.id, n.full_name]),
  );
  return rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating),
    comment: r.comment,
    attachmentUrl: r.attachment_url,
    createdAt: r.created_at,
    authorName: nameBy.get(r.author_id) || "Коллега",
  }));
}

export async function getUserPerformanceSnapshot(
  userId: string,
  role: Role,
): Promise<{
  salesCount: number | null;
  guideRatingAvg: number | null;
  guideReviewsCount: number | null;
  /** Число туров, где гид был в назначении (все время). */
  guideTripsCount: number | null;
  managerRatingAvg: number | null;
  managerReviewsCount: number | null;
}> {
  const empty = {
    salesCount: null as number | null,
    guideRatingAvg: null as number | null,
    guideReviewsCount: null as number | null,
    guideTripsCount: null as number | null,
    managerRatingAvg: null as number | null,
    managerReviewsCount: null as number | null,
  };
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (role === "guide" || role === "chief_guide")
      return { ...empty, guideRatingAvg: 4.2, guideReviewsCount: 3, guideTripsCount: 12 };
    if (role === "manager" || role === "chief_manager")
      return { ...empty, salesCount: 15, managerRatingAvg: 4.0, managerReviewsCount: 1 };
    return empty;
  }
  const perf = await loadRosterPerformanceMaps(supabase);
  if (role === "guide" || role === "chief_guide") {
    const g = aggToAvg(perf.guideAgg.get(userId));
    const { count: tripCount } = await supabase
      .from("tour_guides")
      .select("tour_id", { count: "exact", head: true })
      .eq("guide_id", userId);
    return { ...empty, guideRatingAvg: g.avg, guideReviewsCount: g.n, guideTripsCount: tripCount ?? 0 };
  }
  if (role === "manager" || role === "chief_manager") {
    const m = aggToAvg(perf.managerRevAgg.get(userId));
    return {
      ...empty,
      salesCount: perf.salesByManager.get(userId) ?? 0,
      managerRatingAvg: m.avg,
      managerReviewsCount: m.n,
    };
  }
  return empty;
}

export async function listRosterManagers(excludeUserId?: string, viewerRole?: Role): Promise<RosterUser[]> {
  const supabase = getSupabaseAdmin();
  const today = localDateString();
  const horizonEnd = addDaysToLocalDate(today, 120);
  const seeHidden = viewerRole ? canSeeHiddenRosterUsers(viewerRole) : true;
  if (!supabase) {
    const rows = [
      toRosterUser("mock-m1", "Aibek", "manager", new Map(), today, horizonEnd),
      toRosterUser("mock-m2", "Olga", "manager", new Map([["mock-m2", new Set([today])]]), today, horizonEnd),
    ];
    return excludeUserId ? rows.filter((r) => r.id !== excludeUserId) : rows;
  }
  const { data: rows, error } = await supabase
    .from("users")
    .select("id,full_name,role,phone,hidden_from_roster,roster_contact_private")
    .eq("is_active", true)
    .in("role", ["manager", "chief_manager"])
    .order("full_name");
  if (error || !rows) return [];
  const usersRaw = rows as {
    id: string;
    full_name: string;
    role: Role;
    phone: string | null;
    hidden_from_roster?: boolean | null;
    roster_contact_private?: boolean | null;
  }[];
  const users = usersRaw.filter((u) => !u.hidden_from_roster || seeHidden);
  const offMap = await loadManagerOffMap(
    supabase,
    users.map((u) => u.id),
    today,
    horizonEnd,
  );
  const rosterRows = users.map((u) => {
    const showPhone = seeHidden || !u.roster_contact_private;
    const phoneRaw = u.phone != null && String(u.phone).trim() ? String(u.phone).trim() : null;
    const extras: RosterExtras = {
      hiddenFromRoster: Boolean(u.hidden_from_roster),
      rosterContactPrivate: Boolean(u.roster_contact_private),
    };
    return toRosterUser(u.id, u.full_name, u.role, offMap, today, horizonEnd, showPhone ? phoneRaw : null, extras);
  });
  return excludeUserId ? rosterRows.filter((r) => r.id !== excludeUserId) : rosterRows;
}

export async function listRosterGuides(excludeUserId?: string, viewerRole?: Role): Promise<RosterUser[]> {
  const supabase = getSupabaseAdmin();
  const today = localDateString();
  const horizonEnd = addDaysToLocalDate(today, 120);
  const seeHidden = viewerRole ? canSeeHiddenRosterUsers(viewerRole) : true;
  if (!supabase) {
    const rows = [
      toRosterUser("mock-g1", "Elena", "guide", new Map(), today, horizonEnd),
      toRosterUser("mock-g2", "Valentina", "guide", new Map([["mock-g2", new Set([addDaysToLocalDate(today, 2)])]]), today, horizonEnd),
    ];
    return excludeUserId ? rows.filter((r) => r.id !== excludeUserId) : rows;
  }
  const { data: rows, error } = await supabase
    .from("users")
    .select("id,full_name,role,phone,hidden_from_roster,roster_contact_private")
    .eq("is_active", true)
    .in("role", ["guide", "chief_guide"])
    .order("full_name");
  if (error || !rows) return [];
  const usersRaw = rows as {
    id: string;
    full_name: string;
    role: Role;
    phone: string | null;
    hidden_from_roster?: boolean | null;
    roster_contact_private?: boolean | null;
  }[];
  const users = usersRaw.filter((u) => !u.hidden_from_roster || seeHidden);
  const offMap = await loadGuideOffMap(
    supabase,
    users.map((u) => u.id),
    today,
    horizonEnd,
  );
  const rosterRows = users.map((u) => {
    const showPhone = seeHidden || !u.roster_contact_private;
    const phoneRaw = u.phone != null && String(u.phone).trim() ? String(u.phone).trim() : null;
    const extras: RosterExtras = {
      hiddenFromRoster: Boolean(u.hidden_from_roster),
      rosterContactPrivate: Boolean(u.roster_contact_private),
    };
    return toRosterUser(u.id, u.full_name, u.role, offMap, today, horizonEnd, showPhone ? phoneRaw : null, extras);
  });
  return excludeUserId ? rosterRows.filter((r) => r.id !== excludeUserId) : rosterRows;
}

export async function listMyManagerDaysOff(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const today = localDateString();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("manager_days_off")
    .select("day_off")
    .eq("manager_id", userId)
    .gte("day_off", today)
    .order("day_off");
  if (error || !data) return [];
  return (data as { day_off: string }[]).map((r) => r.day_off.slice(0, 10));
}

export async function listMyGuideDaysOff(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const today = localDateString();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("guide_days_off")
    .select("day_off")
    .eq("guide_id", userId)
    .gte("day_off", today)
    .order("day_off");
  if (error || !data) return [];
  return (data as { day_off: string }[]).map((r) => r.day_off.slice(0, 10));
}

export type ProfileVisaRunRow = {
  id: string;
  mode: "manager" | "guide";
  cycleDays: 45 | 90;
  dayFrom: string;
  dayTo: string;
  createdAt: string;
};

export async function listMyVisaRuns(userId: string, mode: "manager" | "guide"): Promise<ProfileVisaRunRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const res = await supabase
    .from("employee_visa_runs")
    .select("id,staff_mode,cycle_days,day_from,day_to,created_at")
    .eq("user_id", userId)
    .eq("staff_mode", mode)
    .order("day_from", { ascending: true });
  if (res.error || !res.data) return [];
  return (res.data as {
    id: string;
    staff_mode: "manager" | "guide";
    cycle_days: 45 | 90;
    day_from: string;
    day_to: string;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    mode: r.staff_mode,
    cycleDays: Number(r.cycle_days) as 45 | 90,
    dayFrom: String(r.day_from).slice(0, 10),
    dayTo: String(r.day_to).slice(0, 10),
    createdAt: r.created_at,
  }));
}

export async function getUserAccountFields(
  userId: string,
): Promise<{ login: string | null; avatarUrl: string | null; phone: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { login: null, avatarUrl: null, phone: null };
  const { data } = await supabase.from("users").select("login, avatar_url, phone").eq("id", userId).maybeSingle();
  if (!data) return { login: null, avatarUrl: null, phone: null };
  const row = data as { login?: string | null; avatar_url?: string | null; phone?: string | null };
  const phone = row.phone != null && String(row.phone).trim() ? String(row.phone).trim() : null;
  return {
    login: row.login ?? null,
    avatarUrl: row.avatar_url ?? null,
    phone,
  };
}

export async function getTourGuideAssignmentState(tourId: string): Promise<{
  tourDate: string;
  assigned: TourGuideSlot[];
  candidates: GuideCandidate[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { tourDate: localDateString(), assigned: [], candidates: [] };
  }

  const { data: tourRow, error: tourErr } = await supabase
    .from("tours")
    .select("start_at,end_at")
    .eq("id", tourId)
    .maybeSingle();
  if (tourErr || !tourRow) {
    return { tourDate: localDateString(), assigned: [], candidates: [] };
  }
  const tourDate = startDateOnly((tourRow as { start_at: string }).start_at);

  const { data: assignRows } = await supabase
    .from("tour_guides")
    .select("id,guide_id,is_primary,is_inspection,users(full_name,role)")
    .eq("tour_id", tourId);
  const assigned: TourGuideSlot[] =
    (assignRows as { id: string; guide_id: string; is_primary: boolean; is_inspection: boolean; users: unknown }[] | null)?.map((r) => {
      const userObj = unwrapSupabaseOne(r.users) as { role?: unknown } | null;
      return {
        rowId: r.id,
        guideId: r.guide_id,
        fullName: embedFullName(r.users),
        role: String(userObj?.role ?? "") as Role,
        isPrimary: r.is_primary,
        isInspection: r.is_inspection,
      };
    }) || [];
  const onThisTour = new Set(assigned.map((a) => a.guideId));

  const { data: guideUsers } = await supabase
    .from("users")
    .select("id,full_name,role,avatar_url")
    .eq("is_active", true);

  const [{ data: guideOffRows }, { data: managerOffRows }] = await Promise.all([
    supabase.from("guide_days_off").select("guide_id").eq("day_off", tourDate),
    supabase.from("manager_days_off").select("manager_id").eq("day_off", tourDate),
  ]);
  const offSet = new Set<string>([
    ...((guideOffRows as { guide_id: string }[] | null)?.map((r) => r.guide_id) || []),
    ...((managerOffRows as { manager_id: string }[] | null)?.map((r) => r.manager_id) || []),
  ]);

  const { data: dayTours } = await supabase
    .from("tours")
    .select("id,name,start_at,end_at,deleted_at,status")
    .is("deleted_at", null)
    .neq("status", "deleted");
  const sameDayTourIds =
    (dayTours as { id: string; name: string; start_at: string; end_at?: string | null }[] | null)
      ?.filter((t) => {
        const startYmd = startDateOnly(t.start_at);
        const endYmd = startDateOnly((t.end_at && String(t.end_at).trim()) ? String(t.end_at) : t.start_at);
        return startYmd <= tourDate && tourDate <= endYmd;
      })
      .map((t) => t.id) || [];
  const idToName = new Map(
    ((dayTours as { id: string; name: string; start_at: string }[]) || []).map((t) => [t.id, t.name] as const),
  );

  const busyMap = new Map<string, string>();
  if (sameDayTourIds.length) {
    const { data: tgBusy } = await supabase.from("tour_guides").select("guide_id,tour_id").in("tour_id", sameDayTourIds);
    for (const row of (tgBusy as { guide_id: string; tour_id: string }[] | null) || []) {
      if (row.tour_id === tourId) continue;
      const nm = idToName.get(row.tour_id);
      if (nm) busyMap.set(row.guide_id, nm);
    }
  }

  const allGuideIds = ((guideUsers as { id: string }[] | null) || []).map((u) => u.id);
  const tripsByGuide = await loadGuideTripCounts(supabase, allGuideIds);

  const candidates: GuideCandidate[] = [];
  for (const u of (guideUsers as { id: string; full_name: string; role?: string; avatar_url?: string | null }[] | null) || []) {
    if (onThisTour.has(u.id)) continue;
    const role = String(u.role || "") as Role;
    let status: GuideCandidate["status"] = "available";
    let otherTourName: string | undefined;
    if (offSet.has(u.id)) status = "day_off";
    else if (busyMap.has(u.id)) {
      status = "busy";
      otherTourName = busyMap.get(u.id);
    }
    const avatarUrl = u.avatar_url != null && String(u.avatar_url).trim() !== "" ? String(u.avatar_url).trim() : null;
    candidates.push({ guideId: u.id, fullName: u.full_name, role, status, otherTourName, avatarUrl, tripCount: tripsByGuide.get(u.id) ?? 0 });
  }
  const rolePriority = (role: string): number => {
    if (role === "guide" || role === "chief_guide") return 1;
    if (role === "manager" || role === "chief_manager") return 2;
    if (role === "dispatcher" || role === "booking_dispatcher") return 3;
    if (role === "accountant") return 4;
    if (role === "director") return 5;
    return 6;
  };
  candidates.sort((a, b) => {
    const ra = rolePriority(a.role);
    const rb = rolePriority(b.role);
    if (ra !== rb) return ra - rb;
    return a.fullName.localeCompare(b.fullName, "ru");
  });

  return { tourDate, assigned, candidates };
}

export async function listExpensesForTour(tourId: string): Promise<TourExpense[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // Надёжная загрузка: в разных окружениях могут отсутствовать новые колонки.
  // Пробуем разные SELECT-списки, пока не получим успешный ответ.
  const selectsToTry = [
    EXPENSES_LIST_SELECT_FULL,
    // Старые БД: нет pending_accountant_review
    EXPENSES_LIST_SELECT_LEGACY,
    // Старые БД: нет accountant_reviewed_at
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT,
    // Старые БД: нет обеих колонок
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT_LEGACY,
    EXPENSES_LIST_SELECT_MINIMAL,
  ];

  let data: ExpenseListRow[] | null = null;
  const errors: unknown[] = [];
  for (const select of selectsToTry) {
    const res = await supabase
      .from("expenses")
      .select(select)
      .eq("tour_id", tourId)
      .order("created_at", { ascending: false });

    if (!res.error && res.data != null) {
      data = res.data as unknown as ExpenseListRow[];
      break;
    }

    if (res.error) errors.push(res.error);
  }

  if (!data) {
    // Подсказка для диагностики: что именно не удалось прочитать.
    // (В dev-режиме это будет видно в терминале Next.)
    // eslint-disable-next-line no-console
    console.error("listExpensesForTour: all SELECT attempts failed", {
      tourId,
      errors: errors.map((e) => (e && typeof e === "object" && "message" in e ? (e as any).message : String(e))),
    });
    return [];
  }

  const creatorIds = Array.from(
    new Set(
      data
        .map((r) => (typeof r.created_by === "string" ? r.created_by : null))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const roleByCreatorId = new Map<string, Role>();
  const nameByCreatorId = new Map<string, string>();
  if (creatorIds.length > 0) {
    const creatorsRes = await supabase.from("users").select("id,role,full_name").in("id", creatorIds);
    if (!creatorsRes.error && creatorsRes.data) {
      for (const u of creatorsRes.data as { id: string; role: Role; full_name?: string | null }[]) {
        roleByCreatorId.set(u.id, u.role);
        if (u.full_name && u.full_name.trim()) nameByCreatorId.set(u.id, u.full_name.trim());
      }
    }
  }

  return data.map((r) => ({
    id: r.id,
    tourId: r.tour_id,
    category: r.category as TourExpense["category"],
    amountVnd: Number(r.amount_vnd),
    description: r.description,
    createdAt: r.created_at,
    createdById: (r.created_by as string | null) ?? null,
    createdByRole:
      (typeof r.created_by === "string" ? roleByCreatorId.get(r.created_by) : null) ?? null,
    createdByName:
      (typeof r.created_by === "string" ? nameByCreatorId.get(r.created_by) : null) ?? null,
    accountantReviewedAt: (r.accountant_reviewed_at as string | null) ?? null,
    accountantReviewedBy: (r.accountant_reviewed_by as string | null) ?? null,
    accountantReviewState:
      r.accountant_review_state === "approved" || r.accountant_review_state === "recheck" ? r.accountant_review_state : "pending",
    accountantReviewNote: (r.accountant_review_note as string | null) ?? null,
    pendingAccountantReview:
      (r.accountant_review_state === "approved"
        ? false
        : Boolean(r.pending_accountant_review) || /в обработке \(дата чека/i.test(r.description)),
    attachmentUrl: r.attachment_url ?? null,
  }));
}

/** Расходы, ожидающие проверки бухгалтера (очередь на рабочем столе). */
export type ExpensePendingAccountantRow = {
  id: string;
  tourId: string;
  tourName: string;
  tourDate: string;
  category: TourExpense["category"];
  amountVnd: number;
  description: string;
  createdAt: string;
};

export async function listExpensesPendingAccountantReview(limit = 40): Promise<ExpensePendingAccountantRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const selectsToTry = [
    EXPENSES_LIST_SELECT_FULL,
    EXPENSES_LIST_SELECT_LEGACY,
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT,
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT_LEGACY,
    EXPENSES_LIST_SELECT_MINIMAL,
  ];

  for (const select of selectsToTry) {
    const hasPendingCol = /pending_accountant_review/.test(select);
    const hasReviewedCol = /accountant_reviewed_at/.test(select);

    let q = supabase.from("expenses").select(select).order("created_at", { ascending: false });
    if (hasPendingCol) {
      q = q.eq("pending_accountant_review", true).limit(limit);
    } else {
      if (hasReviewedCol) q = q.is("accountant_reviewed_at", null);
      q = q.limit(160);
    }

    const res = await q;
    if (res.error) {
      continue;
    }
    if (!res.data) continue;

    let rows = res.data as unknown as ExpenseListRow[];
    if (!hasPendingCol) {
      rows = rows
        .filter((r) => {
          const pending =
            Boolean(r.pending_accountant_review) || /в обработке \(дата чека/i.test(r.description);
          const reviewed = Boolean(r.accountant_reviewed_at);
          return pending && !reviewed;
        })
        .slice(0, limit);
    }

    if (rows.length === 0) {
      if (hasPendingCol) return [];
      continue;
    }

    const tourIds = [...new Set(rows.map((r) => r.tour_id))];
    const { data: tours } = await supabase.from("tours").select("id,name,start_at").in("id", tourIds);
    const tourMap = new Map(
      (tours as { id: string; name: string; start_at: string }[] | null)?.map((t) => [t.id, t]) ?? [],
    );

    return rows.map((r) => {
      const t = tourMap.get(r.tour_id);
      const cat = r.category as TourExpense["category"];
      const category: TourExpense["category"] = ["guide", "bus", "salary", "other"].includes(cat)
        ? cat
        : "other";
      return {
        id: r.id,
        tourId: r.tour_id,
        tourName: t?.name ?? "-",
        tourDate: t?.start_at ? startDateOnly(t.start_at) : "-",
        category,
        amountVnd: Math.round(Number(r.amount_vnd)),
        description: r.description,
        createdAt: r.created_at,
      };
    });
  }

  return [];
}

export type DispatcherExpenseReviewTourRow = {
  tourId: string;
  tourName: string;
  tourDate: string;
  tourStatus: TourStatus;
  expenses: TourExpense[];
  totalAmountVnd: number;
  pendingCount: number;
  approvedCount: number;
  recheckCount: number;
};

export type DispatcherExpenseReviewPayload = {
  dispatcherId: string;
  dispatcherName: string;
  tours: DispatcherExpenseReviewTourRow[];
  totalPendingCount: number;
};

const DISPATCHER_EXPENSE_REVIEW_TOURS_LIMIT = 60;

/** Расходы диспетчера по турам со статусом проверки бухгалтером (для «проверить расходы» на /team/[id]). */
export async function getDispatcherExpenseReviewSummary(
  dispatcherId: string,
): Promise<DispatcherExpenseReviewPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: u } = await supabase.from("users").select("full_name,role").eq("id", dispatcherId).maybeSingle();
  const dispatcherRow = u as { full_name?: string; role?: Role } | null;
  const dispatcherName = String(dispatcherRow?.full_name || "").trim() || "Диспетчер";
  const dispatcherRole = dispatcherRow?.role ?? null;

  const empty: DispatcherExpenseReviewPayload = {
    dispatcherId,
    dispatcherName,
    tours: [],
    totalPendingCount: 0,
  };

  const selectsToTry = [
    EXPENSES_LIST_SELECT_FULL,
    EXPENSES_LIST_SELECT_LEGACY,
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT,
    EXPENSES_LIST_SELECT_NO_ACCOUNTANT_REVIEWED_AT_LEGACY,
    EXPENSES_LIST_SELECT_MINIMAL,
  ];

  let rows: ExpenseListRow[] | null = null;
  for (const select of selectsToTry) {
    const res = await supabase
      .from("expenses")
      .select(select)
      .eq("created_by", dispatcherId)
      .order("created_at", { ascending: false });
    if (!res.error && res.data != null) {
      rows = res.data as unknown as ExpenseListRow[];
      break;
    }
  }
  if (!rows?.length) return empty;

  const tourIds = [...new Set(rows.map((r) => String(r.tour_id)))];
  const { data: tourRows } = await supabase
    .from("tours")
    .select("id,name,start_at,status")
    .in("id", tourIds)
    .is("deleted_at", null)
    .neq("status", "deleted");
  type TRow = { id: string; name: string; start_at: string; status: TourStatus };
  const tourById = new Map((tourRows as TRow[] | null)?.map((t) => [t.id, t]) ?? []);

  const expensesByTour = new Map<string, TourExpense[]>();
  for (const r of rows) {
    const tid = String(r.tour_id);
    if (!tourById.has(tid)) continue;
    const expense: TourExpense = {
      id: r.id,
      tourId: tid,
      category: r.category as TourExpense["category"],
      amountVnd: Math.round(Number(r.amount_vnd)),
      description: r.description,
      createdAt: r.created_at,
      createdById: dispatcherId,
      createdByRole: dispatcherRole,
      createdByName: dispatcherName,
      accountantReviewedAt: r.accountant_reviewed_at ?? null,
      accountantReviewedBy: r.accountant_reviewed_by ?? null,
      accountantReviewState:
        r.accountant_review_state === "approved" || r.accountant_review_state === "recheck"
          ? r.accountant_review_state
          : "pending",
      accountantReviewNote: r.accountant_review_note ?? null,
      pendingAccountantReview:
        r.accountant_review_state === "approved" ? false : Boolean(r.pending_accountant_review),
      attachmentUrl: r.attachment_url ?? null,
    };
    const arr = expensesByTour.get(tid) || [];
    arr.push(expense);
    expensesByTour.set(tid, arr);
  }

  const sortedTourIds = [...expensesByTour.keys()]
    .sort((a, b) => String(tourById.get(b)?.start_at || "").localeCompare(String(tourById.get(a)?.start_at || "")))
    .slice(0, DISPATCHER_EXPENSE_REVIEW_TOURS_LIMIT);

  let totalPendingCount = 0;
  const tours: DispatcherExpenseReviewTourRow[] = sortedTourIds.map((tid) => {
    const t = tourById.get(tid)!;
    const list = expensesByTour.get(tid) || [];
    let pendingCount = 0;
    let approvedCount = 0;
    let recheckCount = 0;
    let totalAmountVnd = 0;
    for (const e of list) {
      totalAmountVnd += e.amountVnd;
      if (e.accountantReviewState === "approved") approvedCount += 1;
      else if (e.accountantReviewState === "recheck") recheckCount += 1;
      else pendingCount += 1;
    }
    totalPendingCount += pendingCount;
    return {
      tourId: tid,
      tourName: t.name,
      tourDate: startDateOnly(t.start_at),
      tourStatus: t.status,
      expenses: list,
      totalAmountVnd,
      pendingCount,
      approvedCount,
      recheckCount,
    };
  });

  tours.sort((a, b) => {
    const ap = a.pendingCount > 0 || a.recheckCount > 0 ? 1 : 0;
    const bp = b.pendingCount > 0 || b.recheckCount > 0 ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return b.tourDate.localeCompare(a.tourDate);
  });

  return { dispatcherId, dispatcherName, tours, totalPendingCount };
}

export async function getTourManifestForTour(
  tourId: string,
): Promise<{ manifest: TourManifest | null; absences: TourManifestAbsence[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { manifest: null, absences: [] };

  let mRow: Record<string, unknown> | null = null;
  {
    const first = await supabase
      .from("tour_manifests")
      .select(
        "tour_id,actual_pax,submitted_at,submitted_by,comment,rum_bottles,cola_bottles,water_bottles,raincoats_qty,needs_accountant_review",
      )
      .eq("tour_id", tourId)
      .maybeSingle();
    if (first.error && /needs_accountant_review/i.test(String(first.error.message))) {
      const second = await supabase
        .from("tour_manifests")
        .select("tour_id,actual_pax,submitted_at,submitted_by,comment,rum_bottles,cola_bottles,water_bottles,raincoats_qty")
        .eq("tour_id", tourId)
        .maybeSingle();
      if (second.error) return { manifest: null, absences: [] };
      mRow = second.data as Record<string, unknown> | null;
    } else if (first.error) {
      return { manifest: null, absences: [] };
    } else {
      mRow = first.data as Record<string, unknown> | null;
    }
  }

  let submittedByName: string | null = null;
  if (mRow?.submitted_by) {
    const { data: u } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", mRow.submitted_by as string)
      .maybeSingle();
    submittedByName = (u as { full_name?: string } | null)?.full_name ?? null;
  }

  type MRow = {
    tour_id: string;
    actual_pax: number;
    submitted_at: string;
    submitted_by: string | null;
    comment: string | null;
    rum_bottles?: number | null;
    cola_bottles?: number | null;
    water_bottles?: number | null;
    raincoats_qty?: number | null;
    needs_accountant_review?: boolean | null;
  };

  const manifest: TourManifest | null = mRow
    ? (() => {
        const r = mRow as unknown as MRow;
        return {
          tourId: r.tour_id,
          actualPax: Number(r.actual_pax),
          submittedAt: r.submitted_at,
          submittedById: r.submitted_by,
          submittedByName,
          comment: r.comment ?? null,
          rumBottles: Number(r.rum_bottles ?? 0),
          colaBottles: Number(r.cola_bottles ?? 0),
          waterBottles: Number(r.water_bottles ?? 0),
          raincoatsQty: Number(r.raincoats_qty ?? 0),
          needsAccountantReview: Boolean(r.needs_accountant_review),
        };
      })()
    : null;

  let absRows: Record<string, unknown>[] | null = null;
  {
    const fullSelect =
      "id,tour_id,booking_id,absent_adults,absent_children,absent_infants,note,refund_execution_note,refund_not_required,refund_vnd,manager_refund_acknowledged_at,manager_refund_note,manager_refund_certificate_url,accountant_absence_decision,accountant_absence_comment,accountant_traveled_adults,accountant_traveled_children,accountant_traveled_infants,accountant_absence_reviewed_at";
    const first = await supabase.from("tour_manifest_absences").select(fullSelect).eq("tour_id", tourId);
    if (
      first.error &&
      /refund_execution_note|refund_vnd|manager_refund_acknowledged_at|refund_not_required|manager_refund_note|manager_refund_certificate_url|accountant_absence/i.test(
        String(first.error.message),
      )
    ) {
      const second = await supabase
        .from("tour_manifest_absences")
        .select("id,tour_id,booking_id,absent_adults,absent_children,absent_infants,note,refund_execution_note")
        .eq("tour_id", tourId);
      if (second.error && /refund_execution_note/i.test(String(second.error.message))) {
        const third = await supabase
          .from("tour_manifest_absences")
          .select("id,tour_id,booking_id,absent_adults,absent_children,absent_infants,note")
          .eq("tour_id", tourId);
        if (third.error || !third.data) return { manifest, absences: [] };
        absRows = third.data as Record<string, unknown>[];
      } else if (second.error || !second.data) {
        return { manifest, absences: [] };
      } else {
        absRows = second.data as Record<string, unknown>[];
      }
    } else if (first.error || !first.data) {
      return { manifest, absences: [] };
    } else {
      absRows = first.data as Record<string, unknown>[];
    }
  }

  type AbsRow = {
    id: string;
    tour_id: string;
    booking_id: string;
    absent_adults: number;
    absent_children: number;
    absent_infants: number;
    note: string | null;
    refund_execution_note?: string | null;
    refund_not_required?: boolean | null;
    refund_vnd?: number | string | null;
    manager_refund_acknowledged_at?: string | null;
    manager_refund_note?: string | null;
    manager_refund_certificate_url?: string | null;
    accountant_absence_decision?: string | null;
    accountant_absence_comment?: string | null;
    accountant_traveled_adults?: number | string | null;
    accountant_traveled_children?: number | string | null;
    accountant_traveled_infants?: number | string | null;
    accountant_absence_reviewed_at?: string | null;
  };

  const absences: TourManifestAbsence[] = (absRows as AbsRow[]).map((r) => {
    const decRaw = r.accountant_absence_decision?.trim().toLowerCase();
    const accountantAbsenceDecision =
      decRaw === "approved" || decRaw === "rejected" ? (decRaw as "approved" | "rejected") : null;
    return {
      id: r.id,
      tourId: r.tour_id,
      bookingId: r.booking_id,
      absentAdults: Number(r.absent_adults),
      absentChildren: Number(r.absent_children),
      absentInfants: Number(r.absent_infants),
      note: r.note ?? null,
      refundNotRequired: Boolean(r.refund_not_required),
      refundVnd: r.refund_vnd != null && r.refund_vnd !== "" ? Math.max(0, Math.round(Number(r.refund_vnd))) : 0,
      managerRefundAcknowledgedAt:
        typeof r.manager_refund_acknowledged_at === "string" && r.manager_refund_acknowledged_at.trim()
          ? r.manager_refund_acknowledged_at
          : null,
      refundExecutionNote: r.refund_execution_note ?? null,
      managerRefundNote: r.manager_refund_note?.trim() || null,
      managerRefundCertificateUrl: r.manager_refund_certificate_url?.trim() || null,
      accountantAbsenceDecision,
      accountantAbsenceComment: r.accountant_absence_comment?.trim() || null,
      accountantTraveledAdults:
        r.accountant_traveled_adults != null && r.accountant_traveled_adults !== ""
          ? Math.max(0, Math.round(Number(r.accountant_traveled_adults)))
          : null,
      accountantTraveledChildren:
        r.accountant_traveled_children != null && r.accountant_traveled_children !== ""
          ? Math.max(0, Math.round(Number(r.accountant_traveled_children)))
          : null,
      accountantTraveledInfants:
        r.accountant_traveled_infants != null && r.accountant_traveled_infants !== ""
          ? Math.max(0, Math.round(Number(r.accountant_traveled_infants)))
          : null,
      accountantAbsenceReviewedAt:
        typeof r.accountant_absence_reviewed_at === "string" && r.accountant_absence_reviewed_at.trim()
          ? r.accountant_absence_reviewed_at
          : null,
    };
  });

  return { manifest, absences };
}

export type TourManifestPendingReviewRow = {
  tourId: string;
  tourName: string;
  tourDate: string;
  submittedAt: string;
  submittedByName: string | null;
};

export async function listTourManifestsPendingReview(): Promise<TourManifestPendingReviewRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from("tour_manifests")
    .select("tour_id,submitted_at,submitted_by")
    .eq("needs_accountant_review", true);
  if (error) return [];
  if (!rows?.length) return [];

  type R = { tour_id: string; submitted_at: string; submitted_by: string | null };
  const list = rows as R[];
  const tourIds = [...new Set(list.map((r) => r.tour_id))];
  const userIds = [...new Set(list.map((r) => r.submitted_by).filter(Boolean))] as string[];

  const { data: tours } = await supabase.from("tours").select("id,name,start_at").in("id", tourIds);
  const tourMap = new Map((tours as { id: string; name: string; start_at: string }[] | null)?.map((t) => [t.id, t]) ?? []);

  let userMap = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await supabase.from("users").select("id,full_name").in("id", userIds);
    userMap = new Map((users as { id: string; full_name: string }[] | null)?.map((u) => [u.id, u.full_name]) ?? []);
  }

  return list.map((r) => {
    const t = tourMap.get(r.tour_id);
    return {
      tourId: r.tour_id,
      tourName: t?.name ?? "-",
      tourDate: t?.start_at ? startDateOnly(t.start_at) : "-",
      submittedAt: r.submitted_at,
      submittedByName: r.submitted_by ? userMap.get(r.submitted_by) ?? null : null,
    };
  });
}

export type GuideDashboardEarningsStats = {
  dayTripsCount: number;
  monthTripsCount: number;
  allTripsCount: number;
  daySalaryAccruedVnd: number;
  monthSalaryAccruedVnd: number;
  allSalaryAccruedVnd: number;
  daySalaryPaidVnd: number;
  monthSalaryPaidVnd: number;
  allSalaryPaidVnd: number;

  dayShopAccruedVnd: number;
  monthShopAccruedVnd: number;
  allShopAccruedVnd: number;
  dayShopPaidVnd: number;
  monthShopPaidVnd: number;
  allShopPaidVnd: number;

  /** Конфиденциальные доплаты (вне магазина). */
  dayExtraAccruedVnd: number;
  monthExtraAccruedVnd: number;
  allExtraAccruedVnd: number;
  dayExtraPaidVnd: number;
  monthExtraPaidVnd: number;
  allExtraPaidVnd: number;

  /** Ежемесячная ведомость (net «на руки»), см. employee_monthly_payroll_records. */
  dayPayrollNetAccruedVnd: number;
  monthPayrollNetAccruedVnd: number;
  allPayrollNetAccruedVnd: number;
  dayPayrollNetPaidVnd: number;
  monthPayrollNetPaidVnd: number;
  allPayrollNetPaidVnd: number;
  /** Премии (employee_bonus_records). */
  dayBonusAccruedVnd: number;
  monthBonusAccruedVnd: number;
  allBonusAccruedVnd: number;
  dayBonusPaidVnd: number;
  monthBonusPaidVnd: number;
  allBonusPaidVnd: number;
};

const VN_DATE_TZ = "Asia/Ho_Chi_Minh";

function emptyPayrollBonusSlice(): Pick<
  GuideDashboardEarningsStats,
  | "dayPayrollNetAccruedVnd"
  | "monthPayrollNetAccruedVnd"
  | "allPayrollNetAccruedVnd"
  | "dayPayrollNetPaidVnd"
  | "monthPayrollNetPaidVnd"
  | "allPayrollNetPaidVnd"
  | "dayBonusAccruedVnd"
  | "monthBonusAccruedVnd"
  | "allBonusAccruedVnd"
  | "dayBonusPaidVnd"
  | "monthBonusPaidVnd"
  | "allBonusPaidVnd"
> {
  return {
    dayPayrollNetAccruedVnd: 0,
    monthPayrollNetAccruedVnd: 0,
    allPayrollNetAccruedVnd: 0,
    dayPayrollNetPaidVnd: 0,
    monthPayrollNetPaidVnd: 0,
    allPayrollNetPaidVnd: 0,
    dayBonusAccruedVnd: 0,
    monthBonusAccruedVnd: 0,
    allBonusAccruedVnd: 0,
    dayBonusPaidVnd: 0,
    monthBonusPaidVnd: 0,
    allBonusPaidVnd: 0,
  };
}

async function loadEmployeePayrollBonusDashboardSlice(
  supabase: SupabaseClient,
  employeeId: string,
  dayYmd: string,
  monthYyyyMm: string,
): Promise<ReturnType<typeof emptyPayrollBonusSlice>> {
  const out = emptyPayrollBonusSlice();

  const pr = await supabase
    .from("employee_monthly_payroll_records")
    .select("period_ym,calculation_date,paid_date,net_salary_vnd")
    .eq("employee_id", employeeId);
  if (!pr.error && pr.data) {
    for (const raw of pr.data as {
      period_ym: string;
      calculation_date: string | null;
      paid_date: string | null;
      net_salary_vnd: number | string;
    }[]) {
      const net = Math.max(0, Math.round(Number(raw.net_salary_vnd || 0)));
      const periodYm = String(raw.period_ym || "");
      const calcD = raw.calculation_date ? String(raw.calculation_date).slice(0, 10) : "";
      const paidD = raw.paid_date ? String(raw.paid_date).slice(0, 10) : "";

      out.allPayrollNetAccruedVnd += net;
      if (periodYm === monthYyyyMm) out.monthPayrollNetAccruedVnd += net;
      if (calcD && calcD === dayYmd) out.dayPayrollNetAccruedVnd += net;

      if (paidD) {
        out.allPayrollNetPaidVnd += net;
        if (paidD.slice(0, 7) === monthYyyyMm) out.monthPayrollNetPaidVnd += net;
        if (paidD === dayYmd) out.dayPayrollNetPaidVnd += net;
      }
    }
  } else if (pr.error && !/employee_monthly_payroll|relation|does not exist/i.test(String(pr.error.message))) {
    /* ignore */
  }

  const br = await supabase
    .from("employee_bonus_records")
    .select("amount_vnd,accrued_at,paid_at")
    .eq("employee_id", employeeId);
  if (!br.error && br.data) {
    for (const raw of br.data as { amount_vnd: number | string; accrued_at: string; paid_at: string | null }[]) {
      const amt = Math.max(0, Math.round(Number(raw.amount_vnd || 0)));
      const accYmd = ymdFromIsoInTimeZone(String(raw.accrued_at), VN_DATE_TZ);
      const paidYmd = raw.paid_at ? ymdFromIsoInTimeZone(String(raw.paid_at), VN_DATE_TZ) : "";

      out.allBonusAccruedVnd += amt;
      if (accYmd.slice(0, 7) === monthYyyyMm) out.monthBonusAccruedVnd += amt;
      if (accYmd === dayYmd) out.dayBonusAccruedVnd += amt;

      if (paidYmd) {
        out.allBonusPaidVnd += amt;
        if (paidYmd.slice(0, 7) === monthYyyyMm) out.monthBonusPaidVnd += amt;
        if (paidYmd === dayYmd) out.dayBonusPaidVnd += amt;
      }
    }
  } else if (br.error && !/employee_bonus|relation|does not exist/i.test(String(br.error.message))) {
    /* ignore */
  }

  return out;
}

/** Принято по броням минус сдано в офис за интервал [fromYmd, toExclusiveYmd) — календарные границы как в сверке. */
async function getManagerCashFlowForYmdRange(
  supabase: SupabaseClient,
  managerId: string,
  fromYmd: string,
  toExclusiveYmd: string,
): Promise<{ receivedVnd: number; handedVnd: number }> {
  const periodStartIso = `${fromYmd}T00:00:00.000Z`;
  const periodEndExclusiveIso = `${toExclusiveYmd}T00:00:00.000Z`;

  const { data: bkRows } = await supabase.from("bookings").select("id").eq("manager_id", managerId).is("deleted_at", null);
  const bookingIds = ((bkRows as { id: string }[] | null) || []).map((b) => b.id);

  const payRows: ManagerPayRow[] = [];
  for (let i = 0; i < bookingIds.length; i += MANAGER_CASH_PAYMENTS_CHUNK) {
    const chunk = bookingIds.slice(i, i + MANAGER_CASH_PAYMENTS_CHUNK);
    if (!chunk.length) continue;
    const { data } = await supabase.from("payments").select("amount_vnd,kind,created_at").in("booking_id", chunk);
    payRows.push(...(((data as ManagerPayRow[] | null) || [])));
  }

  const receivedInPeriodVnd = sumManagerBookingPaymentFlow(payRows, periodStartIso, periodEndExclusiveIso);

  let hoList: { amount_vnd: number | string; received_at: string }[] = [];
  const hoRes = await supabase
    .from("tour_office_cash_handovers")
    .select("amount_vnd,received_at")
    .eq("employee_id", managerId)
    .eq("holder_role", "manager");
  if (!hoRes.error && hoRes.data) {
    hoList = hoRes.data as { amount_vnd: number | string; received_at: string }[];
  }

  const handedToOfficeInPeriodVnd = sumManagerHandovers(hoList, periodStartIso, periodEndExclusiveIso);
  return { receivedVnd: receivedInPeriodVnd, handedVnd: handedToOfficeInPeriodVnd };
}

function calendarMonthEndYmd(monthYyyyMm: string): string {
  const parts = monthYyyyMm.split("-").map(Number);
  const y = parts[0] ?? 0;
  const mo = parts[1] ?? 1;
  const last = new Date(y, mo, 0);
  return localDateString(last);
}

/** Начисления гида по дате старта тура: день / месяц / всё время; отдельно зарплата, магазин и «вне магазина». */
export async function getGuideDashboardEarningsStats(
  userId: string,
  monthYyyyMm: string,
  dayYmd: string,
): Promise<GuideDashboardEarningsStats> {
  const empty: GuideDashboardEarningsStats = {
    dayTripsCount: 0,
    monthTripsCount: 0,
    allTripsCount: 0,
    daySalaryAccruedVnd: 0,
    monthSalaryAccruedVnd: 0,
    allSalaryAccruedVnd: 0,
    daySalaryPaidVnd: 0,
    monthSalaryPaidVnd: 0,
    allSalaryPaidVnd: 0,

    dayShopAccruedVnd: 0,
    monthShopAccruedVnd: 0,
    allShopAccruedVnd: 0,
    dayShopPaidVnd: 0,
    monthShopPaidVnd: 0,
    allShopPaidVnd: 0,

    dayExtraAccruedVnd: 0,
    monthExtraAccruedVnd: 0,
    allExtraAccruedVnd: 0,
    dayExtraPaidVnd: 0,
    monthExtraPaidVnd: 0,
    allExtraPaidVnd: 0,
    ...emptyPayrollBonusSlice(),
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const { data: tgRows } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", userId);
  const guideTourIds = [...new Set((tgRows as { tour_id: string }[] | null)?.map((r) => r.tour_id) ?? [])];
  if (!guideTourIds.length) {
    // всё равно могут быть суммы без туров - редко; поездки = 0
  }

  /** Кому относится бухг. зарплата по туру - как в syncAccountantTourSalaryGuideRecord (основной или единственный гид). */
  const primaryGuideByTourId = new Map<string, string>();
  if (guideTourIds.length) {
    const { data: allAssign } = await supabase
      .from("tour_guides")
      .select("tour_id,guide_id,is_primary")
      .in("tour_id", guideTourIds);
    const byTour = new Map<string, { guide_id: string; is_primary: boolean }[]>();
    for (const r of (allAssign as { tour_id: string; guide_id: string; is_primary: boolean }[] | null) ?? []) {
      const list = byTour.get(r.tour_id) ?? [];
      list.push({ guide_id: r.guide_id, is_primary: Boolean(r.is_primary) });
      byTour.set(r.tour_id, list);
    }
    for (const [tid, list] of byTour) {
      const primary = list.find((x) => x.is_primary) ?? list[0];
      if (primary) primaryGuideByTourId.set(tid, primary.guide_id);
    }
  }

  type TourRowBrief = { id: string; start_at: string; accountant_guide_salary_vnd?: number | string | null };
  let tourRows: TourRowBrief[] = [];
  if (guideTourIds.length) {
    const tr = await supabase
      .from("tours")
      .select("id,start_at,accountant_guide_salary_vnd")
      .in("id", guideTourIds);
    tourRows = (tr.data as TourRowBrief[] | null) ?? [];
  }
  const tourYmd = new Map(tourRows.map((t) => [t.id, startDateOnly(t.start_at)]));

  for (const tid of guideTourIds) {
    const ymd = tourYmd.get(tid);
    if (!ymd) continue;
    empty.allTripsCount += 1;
    if (ymd.slice(0, 7) === monthYyyyMm) empty.monthTripsCount += 1;
    if (ymd === dayYmd) empty.dayTripsCount += 1;
  }

  let rows: unknown = null;
  let error: { message?: string } | null = null;
  {
    const res = await supabase
      .from("guide_salary_records")
      .select("amount_vnd,status,tour_id,kind")
      .eq("guide_id", userId);
    rows = res.data;
    error = res.error;
  }

  if (error && isMissingGuideSalaryKindColumn(error)) {
    const res = await supabase
      .from("guide_salary_records")
      .select("amount_vnd,status,tour_id")
      .eq("guide_id", userId);
    rows = res.data;
    error = res.error;
  }

  type SR = { amount_vnd: number; status: string; tour_id: string; kind?: string | null };
  const recs = error ? [] : ((rows as SR[] | null) ?? []);
  const accountantTourIdsSynced = new Set(
    recs.filter((r) => r.kind === ACCOUNTANT_TOUR_SALARY_KIND).map((r) => r.tour_id),
  );

  /**
   * Зарплата из tours.accountant_guide_salary_vnd - если синк в guide_salary_records не отработал,
   * цифра всё равно попадает в «Заработок». Если строка accountant_tour уже есть - не дублируем.
   */
  for (const t of tourRows) {
    if (primaryGuideByTourId.get(t.id) !== userId) continue;
    if (accountantTourIdsSynced.has(t.id)) continue;
    const acc = t.accountant_guide_salary_vnd;
    const amt = acc == null || acc === "" ? 0 : Math.max(0, Math.round(Number(acc)));
    if (amt <= 0) continue;
    const ymd = startDateOnly(t.start_at);
    if (ymd === dayYmd) {
      empty.daySalaryAccruedVnd += amt;
      empty.daySalaryPaidVnd += amt;
    }
    if (ymd.slice(0, 7) === monthYyyyMm) {
      empty.monthSalaryAccruedVnd += amt;
      empty.monthSalaryPaidVnd += amt;
    }
    empty.allSalaryAccruedVnd += amt;
    empty.allSalaryPaidVnd += amt;
  }

  const salaryTourIds = [...new Set(recs.map((r) => r.tour_id))];
  const tourYmdSalary = new Map<string, string>();
  if (salaryTourIds.length) {
    const { data: toursForSalary } = await supabase.from("tours").select("id,start_at").in("id", salaryTourIds);
    for (const t of (toursForSalary as { id: string; start_at: string }[] | null) ?? []) {
      tourYmdSalary.set(t.id, startDateOnly(t.start_at));
    }
  }

  for (const r of recs) {
    const ymd = tourYmdSalary.get(r.tour_id);
    if (!ymd) continue;
    const amt = Number(r.amount_vnd) || 0;
    const paid = r.status === "paid";
    const isExtra = r.kind === "levals";
    const isShop = r.kind === "shop";

    const addDay = () => {
      if (isExtra) {
        empty.dayExtraAccruedVnd += amt;
        if (paid) empty.dayExtraPaidVnd += amt;
      } else if (isShop) {
        empty.dayShopAccruedVnd += amt;
        if (paid) empty.dayShopPaidVnd += amt;
      } else {
        empty.daySalaryAccruedVnd += amt;
        if (paid) empty.daySalaryPaidVnd += amt;
      }
    };
    const addMonth = () => {
      if (isExtra) {
        empty.monthExtraAccruedVnd += amt;
        if (paid) empty.monthExtraPaidVnd += amt;
      } else if (isShop) {
        empty.monthShopAccruedVnd += amt;
        if (paid) empty.monthShopPaidVnd += amt;
      } else {
        empty.monthSalaryAccruedVnd += amt;
        if (paid) empty.monthSalaryPaidVnd += amt;
      }
    };
    const addAll = () => {
      if (isExtra) {
        empty.allExtraAccruedVnd += amt;
        if (paid) empty.allExtraPaidVnd += amt;
      } else if (isShop) {
        empty.allShopAccruedVnd += amt;
        if (paid) empty.allShopPaidVnd += amt;
      } else {
        empty.allSalaryAccruedVnd += amt;
        if (paid) empty.allSalaryPaidVnd += amt;
      }
    };

    if (ymd === dayYmd) addDay();
    if (ymd.slice(0, 7) === monthYyyyMm) addMonth();
    addAll();
  }

  const pb = await loadEmployeePayrollBonusDashboardSlice(supabase, userId, dayYmd, monthYyyyMm);
  return { ...empty, ...pb };
}

function isMissingGuideSalaryNoteColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /note/i.test(msg);
}

function isMissingGuideSalaryAttachmentColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /attachment_url/i.test(msg);
}

function isMissingGuideSalaryKindColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /kind/i.test(msg);
}

function isMissingGuideSalaryOutsideColumns(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /(outside_total_vnd|outside_driver_percent)/i.test(msg);
}

function isMissingGuideSalaryOutsideFixedColumn(error: { message?: string } | null): boolean {
  const msg = error?.message ? String(error.message) : "";
  return /guide_salary_records/i.test(msg) && /outside_driver_fixed_vnd/i.test(msg);
}

export async function listGuideSalaryRecordsForTour(
  tourId: string,
  guideId: string,
): Promise<{
  officialAccruedVnd: number;
  officialPaidVnd: number;
  totalAccruedVnd: number;
  totalPaidVnd: number;
  records: GuideSalaryRecord[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase)
    return { officialAccruedVnd: 0, officialPaidVnd: 0, totalAccruedVnd: 0, totalPaidVnd: 0, records: [] };

  const selectWithNoteLegacy =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind,outside_total_vnd,outside_driver_percent,outside_driver_fixed_vnd";
  const selectWithNote = `${selectWithNoteLegacy},shop_driver_paid_by_guide_vnd,shop_accountant_guide_vnd,shop_accountant_office_vnd,shop_accountant_confirmed_at`;
  const selectWithoutNote =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,attachment_url,created_at,kind,outside_total_vnd,outside_driver_percent,outside_driver_fixed_vnd";
  const selectWithoutNoteAndAttachment =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,created_at,kind,outside_total_vnd,outside_driver_percent,outside_driver_fixed_vnd";
  const selectWithoutNoteAndAttachmentWithoutKind =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,created_at,outside_total_vnd,outside_driver_percent,outside_driver_fixed_vnd";

  const selectWithNoteWithoutFixed =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind,outside_total_vnd,outside_driver_percent";
  const selectWithoutNoteWithoutFixed =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,attachment_url,created_at,kind,outside_total_vnd,outside_driver_percent";
  const selectWithoutNoteAndAttachmentWithoutFixed =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,created_at,kind,outside_total_vnd,outside_driver_percent";
  const selectWithoutNoteAndAttachmentWithoutKindWithoutFixed =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,created_at,outside_total_vnd,outside_driver_percent";

  const first = await supabase
    .from("guide_salary_records")
    .select(selectWithNote)
    .eq("tour_id", tourId)
    .eq("guide_id", guideId)
    .order("created_at", { ascending: false });

  let rows = first.data as unknown;
  let error = first.error;

  if (error && /shop_driver_paid_by_guide_vnd|shop_accountant|column|does not exist/i.test(String(error.message))) {
    const legacy = await supabase
      .from("guide_salary_records")
      .select(selectWithNoteLegacy)
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = legacy.data as unknown;
    error = legacy.error;
  }

  if (error && isMissingGuideSalaryNoteColumn(error)) {
    const second = await supabase
      .from("guide_salary_records")
      .select(selectWithoutNote)
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = second.data as unknown;
    error = second.error;
  }

  if (error && isMissingGuideSalaryAttachmentColumn(error)) {
    const second = await supabase
      .from("guide_salary_records")
      .select(selectWithoutNoteAndAttachment)
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = second.data as unknown;
    error = second.error;
  }

  if (error && isMissingGuideSalaryKindColumn(error)) {
    // Старые записи: считаем их "official" (salary/shop). levals в старой версии просто не существовали.
    const second = await supabase
      .from("guide_salary_records")
      .select(selectWithoutNoteAndAttachmentWithoutKind)
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = second.data as unknown;
    error = second.error;
  }

  if (error && isMissingGuideSalaryOutsideFixedColumn(error)) {
    // Если в БД нет фикс-колонки, но есть total/percent - используем их для расчета/редактирования.
    const second = await supabase
      .from("guide_salary_records")
      .select(selectWithNoteWithoutFixed)
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = second.data as unknown;
    error = second.error;
  }

  if (error && isMissingGuideSalaryOutsideColumns(error)) {
    // Старые записи/БД без полей для редактирования вне магазина.
    const second = await supabase
      .from("guide_salary_records")
      .select("id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind")
      .eq("tour_id", tourId)
      .eq("guide_id", guideId)
      .order("created_at", { ascending: false });
    rows = second.data as unknown;
    error = second.error;
  }

  if (error || !rows)
    return { officialAccruedVnd: 0, officialPaidVnd: 0, totalAccruedVnd: 0, totalPaidVnd: 0, records: [] };

  const mapped = (rows as any[]).map((r) => ({
    id: String(r.id),
    tourId: String(r.tour_id),
    guideId: String(r.guide_id),
    amountVnd: Number(r.amount_vnd) || 0,
    kind: (r.kind as string | null | undefined) ?? null,
    status: (r.status as GuideSalaryRecord["status"]) ?? "pending",
    createdAt: String(r.created_at),
    paidAt: r.paid_at ? String(r.paid_at) : null,
    note: (r.note as string | null | undefined) ?? null,
    attachmentUrl: (r.attachment_url as string | null | undefined) ?? null,
    outsideTotalVnd: r.outside_total_vnd != null ? Number(r.outside_total_vnd) : null,
    outsideDriverPercent: r.outside_driver_percent != null ? Number(r.outside_driver_percent) : null,
    outsideDriverFixedVnd: r.outside_driver_fixed_vnd != null ? Number(r.outside_driver_fixed_vnd) : null,
    shopDriverPaidByGuideVnd:
      r.shop_driver_paid_by_guide_vnd != null && r.shop_driver_paid_by_guide_vnd !== ""
        ? Math.round(Number(r.shop_driver_paid_by_guide_vnd))
        : null,
    shopAccountantGuideVnd:
      r.shop_accountant_guide_vnd != null && r.shop_accountant_guide_vnd !== ""
        ? Math.round(Number(r.shop_accountant_guide_vnd))
        : null,
    shopAccountantOfficeVnd:
      r.shop_accountant_office_vnd != null && r.shop_accountant_office_vnd !== ""
        ? Math.round(Number(r.shop_accountant_office_vnd))
        : null,
    shopAccountantConfirmedAt: r.shop_accountant_confirmed_at ? String(r.shop_accountant_confirmed_at) : null,
  }));

  const totalAccruedVnd = mapped.reduce((s, r) => s + (Number(r.amountVnd) || 0), 0);
  const totalPaidVnd = mapped.filter((r) => r.status === "paid").reduce((s, r) => s + (Number(r.amountVnd) || 0), 0);

  const officialAccruedVnd = mapped.filter((r) => r.kind !== "levals").reduce((s, r) => s + (Number(r.amountVnd) || 0), 0);
  const officialPaidVnd = mapped.filter((r) => r.kind !== "levals" && r.status === "paid").reduce((s, r) => s + (Number(r.amountVnd) || 0), 0);

  return { officialAccruedVnd, officialPaidVnd, totalAccruedVnd, totalPaidVnd, records: mapped };
}

/** Записи официального магазина по туру (все гиды) - для сводки бухгалтера. */
export async function listShopSalaryRecordsForTour(tourId: string): Promise<GuideSalaryRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const selFull =
    "id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind,shop_driver_paid_by_guide_vnd,shop_accountant_guide_vnd,shop_accountant_office_vnd,shop_accountant_confirmed_at";
  const full = await supabase
    .from("guide_salary_records")
    .select(selFull)
    .eq("tour_id", tourId)
    .eq("kind", "shop")
    .order("created_at", { ascending: false });

  let rowsShop = full.data as Record<string, unknown>[] | null;
  let error = full.error;

  if (error && /shop_accountant|shop_driver_paid|column|does not exist/i.test(String(error.message))) {
    const fb = await supabase
      .from("guide_salary_records")
      .select("id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind")
      .eq("tour_id", tourId)
      .eq("kind", "shop")
      .order("created_at", { ascending: false });
    rowsShop = fb.data as Record<string, unknown>[] | null;
    error = fb.error;
  }

  if (error || !rowsShop?.length) return [];

  return rowsShop.map((r) => ({
    id: String(r.id),
    tourId: String(r.tour_id),
    guideId: String(r.guide_id),
    amountVnd: Number(r.amount_vnd) || 0,
    kind: (r.kind as string | null) ?? "shop",
    status: ((r.status as string) || "pending") as GuideSalaryRecord["status"],
    createdAt: String(r.created_at),
    paidAt: r.paid_at ? String(r.paid_at) : null,
    note: (r.note as string | null) ?? null,
    attachmentUrl: (r.attachment_url as string | null) ?? null,
    shopDriverPaidByGuideVnd:
      r.shop_driver_paid_by_guide_vnd != null && r.shop_driver_paid_by_guide_vnd !== ""
        ? Math.round(Number(r.shop_driver_paid_by_guide_vnd))
        : null,
    shopAccountantGuideVnd:
      r.shop_accountant_guide_vnd != null && r.shop_accountant_guide_vnd !== ""
        ? Math.round(Number(r.shop_accountant_guide_vnd))
        : null,
    shopAccountantOfficeVnd:
      r.shop_accountant_office_vnd != null && r.shop_accountant_office_vnd !== ""
        ? Math.round(Number(r.shop_accountant_office_vnd))
        : null,
    shopAccountantConfirmedAt: r.shop_accountant_confirmed_at ? String(r.shop_accountant_confirmed_at) : null,
  }));
}

export async function guideNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const supabase = getSupabaseAdmin();
  if (!supabase || ids.length === 0) return map;
  const { data } = await supabase.from("users").select("id,full_name").in("id", [...new Set(ids)]);
  for (const u of (data as { id: string; full_name: string }[] | null) || []) {
    map.set(u.id, u.full_name || "?");
  }
  return map;
}

/** Начисления «вне магазина» по туру - для сводки бухгалтера. */
export async function listLevalsSalaryRecordsForTour(tourId: string): Promise<GuideSalaryRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("guide_salary_records")
    .select("id,tour_id,guide_id,amount_vnd,status,paid_at,paid_by,note,attachment_url,created_at,kind")
    .eq("tour_id", tourId)
    .eq("kind", "levals")
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    tourId: String(r.tour_id),
    guideId: String(r.guide_id),
    amountVnd: Number(r.amount_vnd) || 0,
    kind: (r.kind as string | null) ?? "levals",
    status: ((r.status as string) || "pending") as GuideSalaryRecord["status"],
    createdAt: String(r.created_at),
    paidAt: r.paid_at ? String(r.paid_at) : null,
    note: (r.note as string | null) ?? null,
    attachmentUrl: (r.attachment_url as string | null) ?? null,
  }));
}

export async function getCompanyPayrollCalendar(): Promise<{ managerSalaryPayoutDay: number } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { managerSalaryPayoutDay: 5 };
  const { data, error } = await supabase
    .from("company_payroll_calendar")
    .select("manager_salary_payout_day")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return { managerSalaryPayoutDay: 5 };
  const d = Number((data as { manager_salary_payout_day?: number | string }).manager_salary_payout_day ?? 5);
  return { managerSalaryPayoutDay: Number.isFinite(d) && d >= 1 && d <= 30 ? d : 5 };
}

export async function listRentalPoints(): Promise<RentalPointSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const full = await supabase
    .from("rental_points")
    .select("id,name,address_note,photo_url,monthly_rent_vnd,rent_due_day_of_month,next_rent_payment_date,notes,updated_at")
    .order("name");
  const legacy =
    full.error && /next_rent_payment_date|column|does not exist/i.test(String(full.error.message))
      ? await supabase
          .from("rental_points")
          .select("id,name,address_note,photo_url,monthly_rent_vnd,rent_due_day_of_month,notes,updated_at")
          .order("name")
      : null;
  const data = (legacy?.data ?? full.data) as Record<string, unknown>[] | null;
  const error = legacy?.error ?? full.error;
  if (error) {
    if (/rental_points|does not exist/i.test(String(error.message))) return [];
    return [];
  }
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name || ""),
    addressNote: r.address_note != null ? String(r.address_note) : null,
    photoUrl: r.photo_url != null && String(r.photo_url).trim() ? String(r.photo_url).trim() : null,
    monthlyRentVnd: Math.round(Number(r.monthly_rent_vnd || 0)),
    rentDueDayOfMonth: Math.min(30, Math.max(1, Math.round(Number(r.rent_due_day_of_month || 1)))),
    nextRentPaymentDate:
      r.next_rent_payment_date != null && String(r.next_rent_payment_date).trim()
        ? String(r.next_rent_payment_date).slice(0, 10)
        : null,
    notes: r.notes != null ? String(r.notes) : null,
    updatedAt: String(r.updated_at || new Date().toISOString()),
  }));
}

export async function getRentalPointById(pointId: string): Promise<RentalPointDetail | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const fullPoint = await supabase
    .from("rental_points")
    .select("id,name,address_note,photo_url,monthly_rent_vnd,rent_due_day_of_month,next_rent_payment_date,notes,updated_at")
    .eq("id", pointId)
    .maybeSingle();
  const legacyPoint =
    fullPoint.error && /next_rent_payment_date|column|does not exist/i.test(String(fullPoint.error.message))
      ? await supabase
          .from("rental_points")
          .select("id,name,address_note,photo_url,monthly_rent_vnd,rent_due_day_of_month,notes,updated_at")
          .eq("id", pointId)
          .maybeSingle()
      : null;
  const p = (legacyPoint?.data ?? fullPoint.data) as Record<string, unknown> | null;
  const pe = legacyPoint?.error ?? fullPoint.error;
  if (pe || !p) return null;
  const pr = p;
  const [expRes, cdRes, rentRes] = await Promise.all([
    supabase
      .from("rental_point_expenses")
      .select(
        "id,amount_vnd,title,expense_date,note,attachment_url,created_at,approval_status,approval_note,approved_at,approved_by,issued_at,issued_by",
      )
      .eq("point_id", pointId)
      .order("expense_date", { ascending: false })
      .limit(500),
    supabase
      .from("rental_point_closed_days")
      .select("id,closed_date,note")
      .eq("point_id", pointId)
      .order("closed_date", { ascending: false })
      .limit(400),
    supabase
      .from("rental_point_rent_payments")
      .select("id,amount_vnd,paid_on,note,created_at")
      .eq("point_id", pointId)
      .order("paid_on", { ascending: false })
      .limit(400),
  ]);
  let expenseRowsRaw = expRes.data as Record<string, unknown>[] | null;
  if (expRes.error && /approval_status|approval_note|approved_at|issued_at|column|does not exist/i.test(String(expRes.error.message))) {
    const legacy = await supabase
      .from("rental_point_expenses")
      .select("id,amount_vnd,title,expense_date,note,attachment_url,created_at")
      .eq("point_id", pointId)
      .order("expense_date", { ascending: false })
      .limit(500);
    expenseRowsRaw = (legacy.data as Record<string, unknown>[] | null) ?? [];
  }
  const expenses: RentalPointExpenseRow[] = (expenseRowsRaw ?? []).map((r) => ({
    id: String(r.id),
    amountVnd: Math.round(Number(r.amount_vnd || 0)),
    title: String(r.title || ""),
    expenseDate: String(r.expense_date || "").slice(0, 10),
    note: r.note != null ? String(r.note) : null,
    attachmentUrl:
      r.attachment_url != null && String(r.attachment_url).trim() ? String(r.attachment_url).trim() : null,
    createdAt: String(r.created_at || ""),
    approvalStatus:
      r.approval_status === "approved" || r.approval_status === "rejected" ? (r.approval_status as "approved" | "rejected") : "pending",
    approvalNote: r.approval_note != null ? String(r.approval_note) : null,
    approvedAt: r.approved_at != null ? String(r.approved_at) : null,
    approvedBy: r.approved_by != null ? String(r.approved_by) : null,
    issuedAt: r.issued_at != null ? String(r.issued_at) : null,
    issuedBy: r.issued_by != null ? String(r.issued_by) : null,
  }));
  const closedDays: RentalPointClosedDayRow[] = ((cdRes.data as Record<string, unknown>[]) || []).map((r) => ({
    id: String(r.id),
    closedDate: String(r.closed_date || "").slice(0, 10),
    note: r.note != null ? String(r.note) : null,
  }));
  const rentPayments: RentalPointRentPaymentRow[] =
    rentRes.error && /rental_point_rent_payments|does not exist/i.test(String(rentRes.error.message))
      ? []
      : ((rentRes.data as Record<string, unknown>[]) || []).map((r) => ({
          id: String(r.id),
          amountVnd: Math.round(Number(r.amount_vnd || 0)),
          paidOn: String(r.paid_on || "").slice(0, 10),
          note: r.note != null ? String(r.note) : null,
          createdAt: String(r.created_at || ""),
        }));
  const expensesTotalVnd = expenses.reduce((s, e) => s + e.amountVnd, 0);
  return {
    id: String(pr.id),
    name: String(pr.name || ""),
    addressNote: pr.address_note != null ? String(pr.address_note) : null,
    photoUrl: pr.photo_url != null && String(pr.photo_url).trim() ? String(pr.photo_url).trim() : null,
    monthlyRentVnd: Math.round(Number(pr.monthly_rent_vnd || 0)),
    rentDueDayOfMonth: Math.min(30, Math.max(1, Math.round(Number(pr.rent_due_day_of_month || 1)))),
    nextRentPaymentDate:
      pr.next_rent_payment_date != null && String(pr.next_rent_payment_date).trim()
        ? String(pr.next_rent_payment_date).slice(0, 10)
        : null,
    notes: pr.notes != null ? String(pr.notes) : null,
    updatedAt: String(pr.updated_at || new Date().toISOString()),
    expenses,
    closedDays,
    rentPayments,
    expensesTotalVnd,
    closedDaysCount: closedDays.length,
  };
}

export async function getManagerSalesPointStatus(userId: string): Promise<ManagerSalesPointStatus> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return { pointId: null, pointName: null, openedToday: false, setToday: false, todayWorkMode: "online" };
  const today = tourBusinessTodayYmd();
  const base = await supabase
    .from("users")
    .select("id,role,rental_point_id,rental_points(name)")
    .eq("id", userId)
    .maybeSingle();
  if (base.error && /rental_point_id|column|does not exist/i.test(String(base.error.message))) {
    return { pointId: null, pointName: null, openedToday: false, setToday: false, todayWorkMode: "online" };
  }
  if (base.error || !base.data) return { pointId: null, pointName: null, openedToday: false, setToday: false, todayWorkMode: "online" };
  const row = base.data as {
    role?: string;
    rental_point_id?: string | null;
    rental_points?: { name?: string | null } | null;
  };
  const isManagerLike = row.role === "manager" || row.role === "guide" || row.role === "chief_guide";
  if (!isManagerLike) return { pointId: null, pointName: null, openedToday: false, setToday: false, todayWorkMode: "online" };
  const defaultMode: "point" | "promo" | "online" =
    row.role === "guide" || row.role === "chief_guide" ? "online" : "point";
  const pointId = row.rental_point_id && String(row.rental_point_id).trim() ? String(row.rental_point_id) : null;
  const pointName = row.rental_points?.name ? String(row.rental_points.name) : null;

  const openResFull = await supabase
    .from("manager_point_openings")
    .select("id,work_mode,point_id")
    .eq("manager_id", userId)
    .eq("opened_on", today)
    .order("confirmed_at", { ascending: false })
    .limit(1);
  const openRes =
    openResFull.error && /work_mode|confirmed_at|column|does not exist/i.test(String(openResFull.error.message))
      ? await supabase
          .from("manager_point_openings")
          .select("id,point_id")
          .eq("manager_id", userId)
          .eq("opened_on", today)
          .limit(1)
      : openResFull;
  if (openRes.error && /manager_point_openings|does not exist/i.test(String(openRes.error.message))) {
    return { pointId, pointName, openedToday: false, setToday: false, todayWorkMode: defaultMode };
  }
  const rec = (openRes.data as { id?: string; work_mode?: string; point_id?: string | null }[] | null)?.[0];
  const mode: "point" | "promo" | "online" =
    rec?.work_mode === "point" || rec?.work_mode === "promo" || rec?.work_mode === "online"
      ? rec.work_mode
      : defaultMode;
  const setToday = Boolean(rec?.id);
  const openedToday = mode === "point" && setToday && (!rec?.point_id || rec.point_id === pointId);
  return { pointId, pointName, openedToday, setToday, todayWorkMode: mode };
}

export async function confirmManagerSalesPointOpenToday(
  userId: string,
): Promise<{ ok: true; pointId: string; pointName: string | null; openedOn: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return { ok: false, error: "Supabase не настроен." };
  const today = tourBusinessTodayYmd();
  const userRes = await supabase.from("users").select("id,role,rental_point_id,rental_points(name)").eq("id", userId).maybeSingle();
  if (userRes.error || !userRes.data) return { ok: false, error: "Пользователь не найден." };
  const u = userRes.data as { role?: string; rental_point_id?: string | null; rental_points?: { name?: string | null } | null };
  if (u.role !== "manager") return { ok: false, error: "Подтверждение доступно только менеджеру." };
  const pointId = u.rental_point_id && String(u.rental_point_id).trim() ? String(u.rental_point_id) : null;
  if (!pointId) return { ok: false, error: "Вам еще не назначили точку продаж." };
  const pointName = u.rental_points?.name ? String(u.rental_points.name) : null;
  const ins = await supabase
    .from("manager_point_openings")
    .upsert([{ manager_id: userId, point_id: pointId, opened_on: today, work_mode: "point" }], {
      onConflict: "manager_id,opened_on",
      ignoreDuplicates: false,
    });
  if (ins.error) {
    if (/manager_point_openings|does not exist/i.test(String(ins.error.message))) {
      return { ok: false, error: "Выполните миграцию БД: manager_point_openings." };
    }
    return { ok: false, error: ins.error.message };
  }
  return { ok: true, pointId, pointName, openedOn: today };
}

export async function setManagerWorkModeForDay(
  managerId: string,
  mode: "point" | "promo" | "online",
  options?: {
    dayFrom?: string;
    dayTo?: string;
    pointId?: string | null;
    promoPlace?: string;
    onlineChannel?: string;
    onlineTrafficSource?: "own" | "office";
  },
): Promise<{ ok: true; openedOn: string; days: string[] } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !managerId) return { ok: false, error: "Supabase не настроен." };
  const today = tourBusinessTodayYmd();
  const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = options?.dayFrom && ymdRe.test(options.dayFrom) ? options.dayFrom : today;
  const to = options?.dayTo && ymdRe.test(options.dayTo) ? options.dayTo : from;
  if (from > to) return { ok: false, error: "Период указан неверно." };
  const days: string[] = [];
  {
    const cur = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (cur.getTime() <= end.getTime()) {
      days.push(localDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  if (days.length < 1 || days.length > 3) {
    return { ok: false, error: "Назначение возможно только на 1-3 дня." };
  }

  const userRes = await supabase
    .from("users")
    .select("id,role,rental_point_id")
    .eq("id", managerId)
    .maybeSingle();
  if (userRes.error || !userRes.data) return { ok: false, error: "Сотрудник не найден." };
  const u = userRes.data as { role?: string; rental_point_id?: string | null };
  const isManagerOrGuideManagerMode =
    u.role === "manager" || u.role === "director" || u.role === "chief_manager" ||
    u.role === "guide" || u.role === "chief_guide";
  if (!isManagerOrGuideManagerMode) {
    return { ok: false, error: "Режим работы задаётся только менеджеру." };
  }

  const assignedPointId = u.rental_point_id && String(u.rental_point_id).trim() ? String(u.rental_point_id) : null;
  const selectedPointId =
    options?.pointId != null && String(options.pointId).trim() !== "" ? String(options.pointId).trim() : assignedPointId;
  // mode=point без pointId — менеджер работает «на точке» без назначения конкретной точки

  const offRes = await supabase.from("manager_days_off").select("day_off").eq("manager_id", managerId).in("day_off", days);
  if (offRes.error) return { ok: false, error: offRes.error.message };
  const blockedOff = ((offRes.data as { day_off: string }[] | null) ?? []).map((r) => String(r.day_off).slice(0, 10));
  if (blockedOff.length > 0) {
    return { ok: false, error: `Нельзя назначить: выходной менеджера (${blockedOff.join(", ")}).` };
  }

  if (mode === "point" && selectedPointId) {
    const busy = await supabase
      .from("manager_point_openings")
      .select("opened_on,manager_id,work_mode")
      .eq("point_id", selectedPointId)
      .in("opened_on", days);
    if (busy.error && !/manager_point_openings|does not exist/i.test(String(busy.error.message))) {
      return { ok: false, error: busy.error.message };
    }
    const conflicts = ((busy.data as { opened_on: string; manager_id: string; work_mode?: string | null }[] | null) ?? [])
      .filter((r) => r.manager_id !== managerId && (r.work_mode == null || r.work_mode === "point"))
      .map((r) => String(r.opened_on).slice(0, 10));
    if (conflicts.length > 0) {
      return { ok: false, error: `Точка уже занята на даты: ${[...new Set(conflicts)].join(", ")}.` };
    }
  }

  const nowIso = new Date().toISOString();
  const rows = days.map((day) => ({
    manager_id: managerId,
    point_id: mode === "point" ? selectedPointId : null,
    opened_on: day,
    work_mode: mode,
    confirmed_at: nowIso,
    promo_place: mode === "promo" ? options?.promoPlace?.trim() || null : null,
    online_channel: mode === "online" ? options?.onlineChannel?.trim() || null : null,
    online_traffic_source: mode === "online" ? options?.onlineTrafficSource ?? null : null,
  }));
  let ins = await supabase.from("manager_point_openings").upsert(rows, {
    onConflict: "manager_id,opened_on",
    ignoreDuplicates: false,
  });
  if (ins.error && /promo_place|online_channel|online_traffic_source|column/i.test(String(ins.error.message))) {
    const legacyRows = rows.map((r) => ({
      manager_id: r.manager_id,
      point_id: r.point_id,
      opened_on: r.opened_on,
      work_mode: r.work_mode,
      confirmed_at: r.confirmed_at,
    }));
    ins = await supabase.from("manager_point_openings").upsert(legacyRows, {
      onConflict: "manager_id,opened_on",
      ignoreDuplicates: false,
    });
  }
  if (ins.error) {
    if (/manager_point_openings|does not exist|work_mode|column/i.test(String(ins.error.message))) {
      return { ok: false, error: "Выполните миграцию БД для режимов работы менеджеров." };
    }
    return { ok: false, error: ins.error.message };
  }
  return { ok: true, openedOn: days[0], days };
}

export async function getSalesPointAssignmentSnapshot(
  managerIds: string[],
  fromYmd: string,
  toYmd: string,
): Promise<{
  managerDaysOff: Record<string, string[]>;
  pointBusyDays: Record<string, string[]>;
  managerAssignmentsByDay: Record<string, Record<string, SalesDayAssignment>>;
}> {
  const out: {
    managerDaysOff: Record<string, string[]>;
    pointBusyDays: Record<string, string[]>;
    managerAssignmentsByDay: Record<string, Record<string, SalesDayAssignment>>;
  } = {
    managerDaysOff: {},
    pointBusyDays: {},
    managerAssignmentsByDay: {},
  };
  const supabase = getSupabaseAdmin();
  if (!supabase || managerIds.length === 0) return out;

  const off = await supabase
    .from("manager_days_off")
    .select("manager_id,day_off")
    .in("manager_id", managerIds)
    .gte("day_off", fromYmd)
    .lte("day_off", toYmd);
  if (!off.error) {
    for (const r of (off.data as { manager_id: string; day_off: string }[] | null) ?? []) {
      const id = r.manager_id;
      const arr = out.managerDaysOff[id] ?? [];
      arr.push(String(r.day_off).slice(0, 10));
      out.managerDaysOff[id] = arr;
    }
    for (const id of Object.keys(out.managerDaysOff)) {
      out.managerDaysOff[id] = [...new Set(out.managerDaysOff[id])].sort();
    }
  }

  const visaOff = await supabase
    .from("employee_visa_runs")
    .select("user_id,staff_mode,day_from,day_to")
    .in("user_id", managerIds)
    .eq("staff_mode", "manager")
    .lte("day_from", toYmd)
    .gte("day_to", fromYmd);
  if (!visaOff.error && visaOff.data) {
    for (const r of (visaOff.data as { user_id: string; day_from: string; day_to: string }[])) {
      const uid = String(r.user_id || "");
      if (!uid) continue;
      const start = String(r.day_from).slice(0, 10);
      const end = String(r.day_to).slice(0, 10);
      const cur = new Date(`${start}T00:00:00`);
      const toDate = new Date(`${end}T00:00:00`);
      while (cur.getTime() <= toDate.getTime()) {
        const day = localDateString(cur);
        if (day >= fromYmd && day <= toYmd) {
          const arr = out.managerDaysOff[uid] ?? [];
          arr.push(day);
          out.managerDaysOff[uid] = arr;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    for (const id of Object.keys(out.managerDaysOff)) {
      out.managerDaysOff[id] = [...new Set(out.managerDaysOff[id])].sort();
    }
  }

  const mp = await supabase
    .from("manager_point_openings")
    .select("manager_id,point_id,opened_on,work_mode,confirmed_at,promo_place,online_channel")
    .in("manager_id", managerIds)
    .gte("opened_on", fromYmd)
    .lte("opened_on", toYmd);
  if (!mp.error) {
    const openRows =
      ((mp.data as {
        manager_id: string;
        point_id: string | null;
        opened_on: string;
        work_mode?: string | null;
        confirmed_at?: string | null;
        promo_place?: string | null;
        online_channel?: string | null;
      }[] | null) ?? []);
    const pointIds = [...new Set(openRows.map((r) => String(r.point_id || "")).filter(Boolean))];
    const pointNameById = new Map<string, string>();
    if (pointIds.length > 0) {
      const pRes = await supabase.from("rental_points").select("id,name").in("id", pointIds);
      for (const p of ((pRes.data as { id: string; name: string }[] | null) ?? [])) {
        pointNameById.set(String(p.id), String(p.name || "Точка"));
      }
    }
    openRows.sort((a, b) => String(a.confirmed_at ?? "").localeCompare(String(b.confirmed_at ?? "")));
    for (const r of openRows) {
      const managerId = String(r.manager_id || "");
      const day = String(r.opened_on).slice(0, 10);
      if (!managerId || !day) continue;
      const mode: "point" | "promo" | "online" =
        r.work_mode === "promo" || r.work_mode === "online" ? r.work_mode : "point";
      const pointId = r.point_id ? String(r.point_id) : null;
      const byDay = out.managerAssignmentsByDay[managerId] ?? {};
      byDay[day] = {
        mode,
        pointId,
        pointName: pointId ? pointNameById.get(pointId) ?? "Точка" : null,
        promoPlace: r.promo_place ? String(r.promo_place) : null,
        onlineChannel: r.online_channel ? String(r.online_channel) : null,
      };
      out.managerAssignmentsByDay[managerId] = byDay;

      const pid = r.point_id ? String(r.point_id) : "";
      if (!pid) continue;
      if (mode === "promo" || mode === "online") continue;
      const arr = out.pointBusyDays[pid] ?? [];
      arr.push(day);
      out.pointBusyDays[pid] = arr;
    }
    for (const pid of Object.keys(out.pointBusyDays)) {
      out.pointBusyDays[pid] = [...new Set(out.pointBusyDays[pid])].sort();
    }
  }

  return out;
}

export type SalesPointWorkLogRow = {
  managerId: string;
  managerName: string;
  managerRole: Role;
  openedOn: string;
  confirmedAt: string | null;
  workMode: "point" | "promo" | "online";
  pointId: string | null;
  pointName: string | null;
  promoPlace: string | null;
  onlineChannel: string | null;
  onlineTrafficSource: "own" | "office" | null;
};

export type SalesPointWorkLogEfficiency = {
  managerId: string;
  managerName: string;
  managerRole: Role;
  assignedDays: number;
  bookingsOnAssignedDays: number;
  paymentsNetOnAssignedDaysVnd: number;
};

export async function getSalesPointWorkLog(
  fromYmd: string,
  toYmd: string,
): Promise<{ rows: SalesPointWorkLogRow[]; efficiency: SalesPointWorkLogEfficiency[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], efficiency: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd) || fromYmd > toYmd) {
    return { rows: [], efficiency: [] };
  }

  const openRes = await supabase
    .from("manager_point_openings")
    .select(
      "manager_id,point_id,opened_on,work_mode,confirmed_at,promo_place,online_channel,online_traffic_source",
    )
    .gte("opened_on", fromYmd)
    .lte("opened_on", toYmd)
    .order("opened_on", { ascending: false })
    .order("confirmed_at", { ascending: false });

  if (openRes.error) {
    if (/manager_point_openings|does not exist/i.test(String(openRes.error.message))) {
      return { rows: [], efficiency: [] };
    }
    return { rows: [], efficiency: [] };
  }

  const openRows =
    ((openRes.data as {
      manager_id: string;
      point_id: string | null;
      opened_on: string;
      work_mode?: string | null;
      confirmed_at?: string | null;
      promo_place?: string | null;
      online_channel?: string | null;
      online_traffic_source?: "own" | "office" | null;
    }[] | null) ?? []);
  if (openRows.length === 0) return { rows: [], efficiency: [] };

  const managerIds = [...new Set(openRows.map((r) => String(r.manager_id || "")).filter(Boolean))];
  const pointIds = [...new Set(openRows.map((r) => String(r.point_id || "")).filter(Boolean))];

  const userMap = new Map<string, { fullName: string; role: Role }>();
  if (managerIds.length > 0) {
    const uRes = await supabase.from("users").select("id,full_name,role").in("id", managerIds);
    for (const u of ((uRes.data as { id: string; full_name: string; role: Role }[] | null) ?? [])) {
      userMap.set(String(u.id), { fullName: String(u.full_name || "Сотрудник"), role: u.role });
    }
  }

  const pointMap = new Map<string, string>();
  if (pointIds.length > 0) {
    const pRes = await supabase.from("rental_points").select("id,name").in("id", pointIds);
    for (const p of ((pRes.data as { id: string; name: string }[] | null) ?? [])) {
      pointMap.set(String(p.id), String(p.name || "Точка"));
    }
  }

  const rows: SalesPointWorkLogRow[] = openRows.map((r) => {
    const mode: "point" | "promo" | "online" =
      r.work_mode === "promo" || r.work_mode === "online" ? r.work_mode : "point";
    const u = userMap.get(String(r.manager_id));
    return {
      managerId: String(r.manager_id),
      managerName: u?.fullName ?? "Сотрудник",
      managerRole: u?.role ?? "manager",
      openedOn: String(r.opened_on).slice(0, 10),
      confirmedAt: r.confirmed_at ? String(r.confirmed_at) : null,
      workMode: mode,
      pointId: r.point_id ? String(r.point_id) : null,
      pointName: r.point_id ? pointMap.get(String(r.point_id)) ?? "Точка" : null,
      promoPlace: r.promo_place ? String(r.promo_place) : null,
      onlineChannel: r.online_channel ? String(r.online_channel) : null,
      onlineTrafficSource: r.online_traffic_source ?? null,
    };
  });

  const assignmentDaysByManager = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = assignmentDaysByManager.get(r.managerId) ?? new Set<string>();
    set.add(r.openedOn);
    assignmentDaysByManager.set(r.managerId, set);
  }

  const bookingsByManager = new Map<string, number>();
  if (managerIds.length > 0) {
    const bRes = await supabase
      .from("bookings")
      .select("id,manager_id,tour_id")
      .in("manager_id", managerIds)
      .is("deleted_at", null);
    const bookings =
      ((bRes.data as { id: string; manager_id: string; tour_id: string }[] | null) ?? []);
    if (bookings.length > 0) {
      const tourIds = [...new Set(bookings.map((b) => b.tour_id).filter(Boolean))];
      const tRes = await supabase.from("tours").select("id,start_at").in("id", tourIds);
      const startByTour = new Map<string, string>();
      for (const t of ((tRes.data as { id: string; start_at: string }[] | null) ?? [])) {
        startByTour.set(String(t.id), tourCalendarDateFromStartAtIso(String(t.start_at)));
      }
      for (const b of bookings) {
        const day = startByTour.get(String(b.tour_id));
        if (!day) continue;
        const set = assignmentDaysByManager.get(String(b.manager_id));
        if (!set || !set.has(day)) continue;
        bookingsByManager.set(String(b.manager_id), (bookingsByManager.get(String(b.manager_id)) ?? 0) + 1);
      }
    }
  }

  const paymentsByManager = new Map<string, number>();
  if (managerIds.length > 0) {
    const fromIso = `${fromYmd}T00:00:00.000Z`;
    const toIsoExcl = `${nextDayYmd(toYmd)}T00:00:00.000Z`;
    const pRes = await supabase
      .from("payments")
      .select("actor_id,amount_vnd,kind,created_at,remitted_to_cash_at")
      .in("actor_id", managerIds)
      .gte("created_at", fromIso)
      .lt("created_at", toIsoExcl);
    const pRows =
      ((pRes.data as {
        actor_id: string | null;
        amount_vnd: number | string;
        kind: string;
        created_at: string;
        remitted_to_cash_at?: string | null;
      }[] | null) ?? []);
    for (const p of pRows) {
      const managerId = String(p.actor_id || "");
      if (!managerId) continue;
      const day = String(p.created_at || "").slice(0, 10);
      const set = assignmentDaysByManager.get(managerId);
      if (!set || !set.has(day)) continue;
      const signed = paymentSignedVndForStatsRow({
        booking_id: "",
        amount_vnd: Math.round(Number(p.amount_vnd || 0)),
        kind: String(p.kind || ""),
        remitted_to_cash_at:
          p.remitted_to_cash_at === undefined ? undefined : (p.remitted_to_cash_at as string | null),
      });
      paymentsByManager.set(managerId, (paymentsByManager.get(managerId) ?? 0) + signed);
    }
  }

  const efficiency: SalesPointWorkLogEfficiency[] = managerIds
    .map((id) => {
      const u = userMap.get(id);
      return {
        managerId: id,
        managerName: u?.fullName ?? "Сотрудник",
        managerRole: u?.role ?? "manager",
        assignedDays: assignmentDaysByManager.get(id)?.size ?? 0,
        bookingsOnAssignedDays: bookingsByManager.get(id) ?? 0,
        paymentsNetOnAssignedDaysVnd: paymentsByManager.get(id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.bookingsOnAssignedDays !== a.bookingsOnAssignedDays) {
        return b.bookingsOnAssignedDays - a.bookingsOnAssignedDays;
      }
      return b.paymentsNetOnAssignedDaysVnd - a.paymentsNetOnAssignedDaysVnd;
    });

  return { rows, efficiency };
}

export async function listManagerWorkModesToday(
  managerIds: string[],
): Promise<Map<string, "point" | "promo" | "online">> {
  const out = new Map<string, "point" | "promo" | "online">();
  const supabase = getSupabaseAdmin();
  if (!supabase || managerIds.length === 0) return out;
  const today = tourBusinessTodayYmd();
  const res = await supabase
    .from("manager_point_openings")
    .select("manager_id,work_mode,confirmed_at")
    .in("manager_id", managerIds)
    .eq("opened_on", today);
  if (res.error) return out;
  const rows =
    (res.data as { manager_id: string; work_mode?: string | null; confirmed_at?: string | null }[] | null) ?? [];
  rows.sort((a, b) => String(a.confirmed_at ?? "").localeCompare(String(b.confirmed_at ?? "")));
  for (const r of rows) {
    const mode = r.work_mode === "promo" || r.work_mode === "online" ? r.work_mode : "point";
    out.set(r.manager_id, mode);
  }
  return out;
}

export type SalesPointRatingRow = {
  pointId: string | null;
  pointName: string;
  monthlyRentVnd: number;
  managers: {
    id: string;
    fullName: string;
    openedDays: string[];
    bookingsInPeriod: number;
    paymentsNetVndInPeriod: number;
    modeStats: {
      point: { bookings: number; paymentsNetVnd: number };
      promo: { bookings: number; paymentsNetVnd: number };
      online: { bookings: number; paymentsNetVnd: number };
    };
  }[];
  /** Брони с датой тура в периоде (нормальный объём продаж). */
  bookingsOnToursInPeriod: number;
  /** Деньги по платежам (созданным в периоде): предоплата + принятые доплаты − возвраты. */
  paymentsNetVndInPeriod: number;
  pointExpensesVndInPeriod: number;
  calendarDaysInPeriod: number;
  closedDaysInPeriod: number;
  /** Календарные дни минус закрытые по точке. */
  workingDaysNet: number;
  managerRatingAvg: number | null;
  managerReviewsCount: number;
};

function paymentSignedVndForStatsRow(p: PaymentRowAgg): number {
  const amt = Math.round(Number(p.amount_vnd) || 0);
  if (p.kind === "refund") return -amt;
  if (p.kind === "deposit") return amt;
  if (p.kind === "office_cash") return amt;
  if (p.kind === "topup") return topupRemittedToCash(p) ? amt : 0;
  return amt;
}

/**
 * Сводка по точкам продаж за период (только руководство: директор / главный менеджер).
 * Доход - по дате создания платежа; объём броней - по календарной дате старта тура.
 */
export async function getSalesPointRatingReport(fromYmd: string, toYmd: string): Promise<SalesPointRatingRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd) || fromYmd > toYmd) return [];

  const rangeStart = `${fromYmd}T00:00:00.000Z`;
  const rangeEndExcl = `${nextDayYmd(toYmd)}T00:00:00.000Z`;
  const calendarDays = inclusiveCalendarDaysBetween(fromYmd, toYmd);

  const points = await listRentalPoints();
  let mgrRows: { id: string; full_name: string; rental_point_id: string | null }[] | null = null;
  const mgrTry = await supabase
    .from("users")
    .select("id,full_name,rental_point_id,role")
    .eq("is_active", true)
    .eq("role", "manager")
    .order("full_name");
  if (mgrTry.error && /rental_point_id|column|does not exist/i.test(String(mgrTry.error.message))) {
    const leg = await supabase
      .from("users")
      .select("id,full_name,role")
      .eq("is_active", true)
      .eq("role", "manager")
      .order("full_name");
    if (leg.error || !leg.data) return [];
    mgrRows = (leg.data as { id: string; full_name: string }[]).map((r) => ({
      ...r,
      rental_point_id: null,
    }));
  } else if (mgrTry.error || !mgrTry.data) {
    return [];
  } else {
    mgrRows = mgrTry.data as { id: string; full_name: string; rental_point_id: string | null }[];
  }

  const managersByPoint = new Map<string | null, { id: string; fullName: string }[]>();
  const managerPoint = new Map<string, string | null>();
  for (const m of mgrRows) {
    const pid = m.rental_point_id != null && String(m.rental_point_id).trim() ? String(m.rental_point_id) : null;
    managerPoint.set(m.id, pid);
    const list = managersByPoint.get(pid) ?? [];
    list.push({ id: m.id, fullName: String(m.full_name || "").trim() || "-" });
    managersByPoint.set(pid, list);
  }

  const allManagerIds = mgrRows.map((m) => m.id);
  const openedDaysByManager = new Map<string, Set<string>>();
  const modeByManagerDay = new Map<string, "point" | "promo" | "online">();
  let openedSet: Set<string> | null = null;
  if (allManagerIds.length > 0) {
    const openResFull = await supabase
      .from("manager_point_openings")
      .select("manager_id,point_id,opened_on,work_mode,confirmed_at")
      .in("manager_id", allManagerIds)
      .gte("opened_on", fromYmd)
      .lte("opened_on", toYmd);
    const openRes =
      openResFull.error && /work_mode|confirmed_at|column|does not exist/i.test(String(openResFull.error.message))
        ? await supabase
            .from("manager_point_openings")
            .select("manager_id,point_id,opened_on")
            .in("manager_id", allManagerIds)
            .gte("opened_on", fromYmd)
            .lte("opened_on", toYmd)
        : openResFull;
    if (!openRes.error) {
      const rows =
        (openRes.data as
          | { manager_id: string; point_id: string | null; opened_on: string; work_mode?: string | null; confirmed_at?: string | null }[]
          | null) ?? [];
      rows.sort((a, b) => String(a.confirmed_at ?? "").localeCompare(String(b.confirmed_at ?? "")));
      for (const r of rows) {
        const day = String(r.opened_on).slice(0, 10);
        const mode = r.work_mode === "promo" || r.work_mode === "online" ? r.work_mode : "point";
        modeByManagerDay.set(`${r.manager_id}|${day}`, mode);
        if (mode === "point") {
          const set = openedDaysByManager.get(r.manager_id) ?? new Set<string>();
          set.add(day);
          openedDaysByManager.set(r.manager_id, set);
        }
      }
      openedSet = new Set(
        rows
          .filter((r) => (r.work_mode === "promo" || r.work_mode === "online" ? false : true))
          .map(
          (r) => `${r.manager_id}|${r.point_id}|${String(r.opened_on).slice(0, 10)}`,
          ),
      );
    } else if (!/manager_point_openings|does not exist/i.test(String(openRes.error.message))) {
      return [];
    }
  }
  const modeForManagerOnDay = (managerId: string, ymd: string): "point" | "promo" | "online" => {
    return modeByManagerDay.get(`${managerId}|${ymd}`) ?? "point";
  };
  const isOpenedOnDay = (managerId: string, pointId: string | null, ymd: string): boolean => {
    if (!pointId) return false;
    if (modeForManagerOnDay(managerId, ymd) !== "point") return false;
    // Legacy fallback: if migration not applied yet, keep historical behavior.
    if (!openedSet) return true;
    return openedSet.has(`${managerId}|${pointId}|${ymd}`);
  };
  const bookingsByManager = new Map<string, number>();
  const payNetByManager = new Map<string, number>();
  const modeStatsByManager = new Map<
    string,
    { point: { bookings: number; paymentsNetVnd: number }; promo: { bookings: number; paymentsNetVnd: number }; online: { bookings: number; paymentsNetVnd: number } }
  >();
  const ensureModeStats = (managerId: string) => {
    const cur = modeStatsByManager.get(managerId);
    if (cur) return cur;
    const created = {
      point: { bookings: 0, paymentsNetVnd: 0 },
      promo: { bookings: 0, paymentsNetVnd: 0 },
      online: { bookings: 0, paymentsNetVnd: 0 },
    };
    modeStatsByManager.set(managerId, created);
    return created;
  };
  if (allManagerIds.length === 0) {
    return points.map((p) => ({
      pointId: p.id,
      pointName: p.name,
      monthlyRentVnd: p.monthlyRentVnd,
      managers: [],
      bookingsOnToursInPeriod: 0,
      paymentsNetVndInPeriod: 0,
      pointExpensesVndInPeriod: 0,
      calendarDaysInPeriod: calendarDays,
      closedDaysInPeriod: 0,
      workingDaysNet: calendarDays,
      managerRatingAvg: null,
      managerReviewsCount: 0,
    }));
  }

  const { data: bRows, error: bErr } = await supabase
    .from("bookings")
    .select("id,manager_id,tour_id")
    .in("manager_id", allManagerIds)
    .is("deleted_at", null);
  if (bErr || !bRows?.length) {
    // Нет броней у менеджеров или ошибка - всё равно показываем точки и закреплённых людей
    const closedByPoint = new Map<string, number>();
    const expByPoint = new Map<string, number>();
    const { data: cdRows } = await supabase
      .from("rental_point_closed_days")
      .select("point_id,closed_date")
      .gte("closed_date", fromYmd)
      .lte("closed_date", toYmd);
    for (const r of (cdRows as { point_id: string }[] | null) ?? []) {
      const id = String(r.point_id);
      closedByPoint.set(id, (closedByPoint.get(id) || 0) + 1);
    }
    const { data: exRows } = await supabase
      .from("rental_point_expenses")
      .select("point_id,amount_vnd")
      .gte("expense_date", fromYmd)
      .lte("expense_date", toYmd);
    for (const r of (exRows as { point_id: string; amount_vnd: number | string }[] | null) ?? []) {
      const id = String(r.point_id);
      expByPoint.set(id, (expByPoint.get(id) || 0) + Math.round(Number(r.amount_vnd || 0)));
    }
    const revAgg = await loadManagerReviewAggForIds(supabase, allManagerIds);
    const buildRow = (pointId: string | null, pointName: string, monthlyRentVnd: number): SalesPointRatingRow => {
      const mids = (managersByPoint.get(pointId) ?? []).map((x) => x.id);
      const { avg, n } = aggManagerReviewsForSubset(revAgg, mids);
      const closed = pointId ? closedByPoint.get(pointId) ?? 0 : 0;
      const exp = pointId ? expByPoint.get(pointId) ?? 0 : 0;
      return {
        pointId,
        pointName,
        monthlyRentVnd,
        managers: (managersByPoint.get(pointId) ?? []).map((m) => ({
          ...m,
          openedDays: [...(openedDaysByManager.get(m.id) ?? new Set<string>())].sort(),
          bookingsInPeriod: 0,
          paymentsNetVndInPeriod: 0,
          modeStats: ensureModeStats(m.id),
        })),
        bookingsOnToursInPeriod: 0,
        paymentsNetVndInPeriod: 0,
        pointExpensesVndInPeriod: exp,
        calendarDaysInPeriod: calendarDays,
        closedDaysInPeriod: closed,
        workingDaysNet: Math.max(0, calendarDays - closed),
        managerRatingAvg: avg,
        managerReviewsCount: n,
      };
    };
    const out: SalesPointRatingRow[] = points.map((p) => buildRow(p.id, p.name, p.monthlyRentVnd));
    if ((managersByPoint.get(null) ?? []).length > 0) {
      out.push(buildRow(null, "Без точки", 0));
    }
    out.sort((a, b) => {
      if (a.pointId == null) return 1;
      if (b.pointId == null) return -1;
      return a.pointName.localeCompare(b.pointName, "ru");
    });
    return out;
  }

  const bookings = bRows as { id: string; manager_id: string; tour_id: string }[];
  const bookingManager = new Map(bookings.map((b) => [b.id, b.manager_id]));
  const tourIds = [...new Set(bookings.map((b) => b.tour_id))];
  const { data: tRows } = await supabase
    .from("tours")
    .select("id,start_at,deleted_at,status")
    .in("id", tourIds);
  const tourMap = new Map<
    string,
    { startAt: string; ok: boolean }
  >();
  for (const t of (tRows as { id: string; start_at: string; deleted_at: string | null; status: string }[] | null) ?? []) {
    const ok = t.deleted_at == null && t.status !== "deleted";
    tourMap.set(t.id, { startAt: String(t.start_at || ""), ok });
  }

  const bookingsInPeriodByPoint = new Map<string | null, number>();
  const payNetByPoint = new Map<string | null, number>();

  for (const b of bookings) {
    const tr = tourMap.get(b.tour_id);
    if (!tr?.ok) continue;
    const tourDay = tourCalendarDateFromStartAtIso(tr.startAt);
    if (!tourDay || tourDay < fromYmd || tourDay > toYmd) continue;
    const pt = managerPoint.get(b.manager_id) ?? null;
    const mode = modeForManagerOnDay(b.manager_id, tourDay);
    const ms = ensureModeStats(b.manager_id);
    ms[mode].bookings += 1;
    if (!isOpenedOnDay(b.manager_id, pt, tourDay)) continue;
    bookingsInPeriodByPoint.set(pt, (bookingsInPeriodByPoint.get(pt) ?? 0) + 1);
    bookingsByManager.set(b.manager_id, (bookingsByManager.get(b.manager_id) ?? 0) + 1);
  }

  const bookingIds = bookings.map((b) => b.id);
  const payChunk = 120;
  const paySelect = "amount_vnd,kind,remitted_to_cash_at,created_at,booking_id";
  const paySelectLegacy = "amount_vnd,kind,created_at,booking_id";
  for (let i = 0; i < bookingIds.length; i += payChunk) {
    const chunk = bookingIds.slice(i, i + payChunk);
    const presFull = await supabase
      .from("payments")
      .select(paySelect)
      .in("booking_id", chunk)
      .gte("created_at", rangeStart)
      .lt("created_at", rangeEndExcl);
    const pres =
      presFull.error && /remitted_to_cash_at|column|does not exist/i.test(String(presFull.error.message))
        ? await supabase
            .from("payments")
            .select(paySelectLegacy)
            .in("booking_id", chunk)
            .gte("created_at", rangeStart)
            .lt("created_at", rangeEndExcl)
        : presFull;
    const prow = (pres.data as Record<string, unknown>[]) || [];
    for (const raw of prow) {
      const bid = String(raw.booking_id || "");
      const mgr = bookingManager.get(bid);
      if (!mgr) continue;
      const pt = managerPoint.get(mgr) ?? null;
      const payDay = String(raw.created_at || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payDay)) continue;
      const mode = modeForManagerOnDay(mgr, payDay);
      const row: PaymentRowAgg = {
        booking_id: bid,
        amount_vnd: Math.round(Number(raw.amount_vnd || 0)),
        kind: String(raw.kind || ""),
        remitted_to_cash_at:
          raw.remitted_to_cash_at === undefined ? undefined : (raw.remitted_to_cash_at as string | null),
      };
      const signed = paymentSignedVndForStatsRow(row);
      const ms = ensureModeStats(mgr);
      ms[mode].paymentsNetVnd += signed;
      if (!isOpenedOnDay(mgr, pt, payDay)) continue;
      payNetByPoint.set(pt, (payNetByPoint.get(pt) ?? 0) + signed);
      payNetByManager.set(mgr, (payNetByManager.get(mgr) ?? 0) + signed);
    }
  }

  const closedByPoint = new Map<string, number>();
  const { data: cdRows } = await supabase
    .from("rental_point_closed_days")
    .select("point_id,closed_date")
    .gte("closed_date", fromYmd)
    .lte("closed_date", toYmd);
  for (const r of (cdRows as { point_id: string }[] | null) ?? []) {
    const id = String(r.point_id);
    closedByPoint.set(id, (closedByPoint.get(id) || 0) + 1);
  }

  const expByPoint = new Map<string, number>();
  const { data: exRows } = await supabase
    .from("rental_point_expenses")
    .select("point_id,amount_vnd")
    .gte("expense_date", fromYmd)
    .lte("expense_date", toYmd);
  for (const r of (exRows as { point_id: string; amount_vnd: number | string }[] | null) ?? []) {
    const id = String(r.point_id);
    expByPoint.set(id, (expByPoint.get(id) || 0) + Math.round(Number(r.amount_vnd || 0)));
  }

  const revAgg = await loadManagerReviewAggForIds(supabase, allManagerIds);

  const buildRow = (pointId: string | null, pointName: string, monthlyRentVnd: number): SalesPointRatingRow => {
    const mids = (managersByPoint.get(pointId) ?? []).map((x) => x.id);
    const { avg, n } = aggManagerReviewsForSubset(revAgg, mids);
    const closed = pointId ? closedByPoint.get(pointId) ?? 0 : 0;
    const exp = pointId ? expByPoint.get(pointId) ?? 0 : 0;
    return {
      pointId,
      pointName,
      monthlyRentVnd,
      managers: (managersByPoint.get(pointId) ?? []).map((m) => ({
        ...m,
        openedDays: [...(openedDaysByManager.get(m.id) ?? new Set<string>())].sort(),
        bookingsInPeriod: bookingsByManager.get(m.id) ?? 0,
        paymentsNetVndInPeriod: payNetByManager.get(m.id) ?? 0,
        modeStats: ensureModeStats(m.id),
      })),
      bookingsOnToursInPeriod: bookingsInPeriodByPoint.get(pointId) ?? 0,
      paymentsNetVndInPeriod: payNetByPoint.get(pointId) ?? 0,
      pointExpensesVndInPeriod: exp,
      calendarDaysInPeriod: calendarDays,
      closedDaysInPeriod: closed,
      workingDaysNet: Math.max(0, calendarDays - closed),
      managerRatingAvg: avg,
      managerReviewsCount: n,
    };
  };

  const out: SalesPointRatingRow[] = points.map((p) => buildRow(p.id, p.name, p.monthlyRentVnd));
  if ((managersByPoint.get(null) ?? []).length > 0) {
    out.push(buildRow(null, "Без точки", 0));
  }
  out.sort((a, b) => {
    if (a.pointId == null) return 1;
    if (b.pointId == null) return -1;
    return a.pointName.localeCompare(b.pointName, "ru");
  });
  return out;
}

async function loadManagerReviewAggForIds(
  supabase: SupabaseClient,
  managerIds: string[],
): Promise<Map<string, { sum: number; n: number }>> {
  const map = new Map<string, { sum: number; n: number }>();
  if (!managerIds.length) return map;
  const { data: mRows } = await supabase.from("manager_reviews").select("manager_id,rating").in("manager_id", managerIds);
  for (const r of (mRows as { manager_id: string; rating: number | string }[] | null) ?? []) {
    const rate = Number(r.rating);
    if (Number.isNaN(rate)) continue;
    const cur = map.get(r.manager_id) || { sum: 0, n: 0 };
    cur.sum += rate;
    cur.n += 1;
    map.set(r.manager_id, cur);
  }
  return map;
}

function aggManagerReviewsForSubset(
  byManager: Map<string, { sum: number; n: number }>,
  ids: string[],
): { avg: number | null; n: number } {
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    const a = byManager.get(id);
    if (!a) continue;
    sum += a.sum;
    n += a.n;
  }
  if (n === 0) return { avg: null, n: 0 };
  return { avg: Math.round((sum / n) * 10) / 10, n };
}

/** Сводка для модалки «финальный расчёт с гидом» (те же цифры, что на странице бухгалтера). */
export async function getTourGuideSettlementBreakdownForTour(tourId: string): Promise<TourGuideSettlementBreakdown | null> {
  const [tour, rows, expenses, shopRows] = await Promise.all([
    getTourById(tourId),
    listBookingsForTour(tourId),
    listExpensesForTour(tourId),
    listShopSalaryRecordsForTour(tourId),
  ]);
  if (!tour) return null;
  const pendingTopupsSumVnd = rows.reduce((s, b) => s + (b.pendingGuideTopupVnd ?? 0), 0);
  /** После выезда (дата тура наступила) неоплаченный долг туристов по броням считается долгом гида перед офисом. */
  const tourDeparted = tour.date <= tourBusinessTodayYmd();
  const touristDebtSumVnd = tourDeparted ? rows.reduce((s, b) => s + (b.dueVnd ?? 0), 0) : 0;
  const { guide: guideExpenses } = partitionDispatcherExpenses(expenses);
  const guideExpensesTotalVnd = guideExpenses.reduce((s, e) => s + e.amountVnd, 0);
  const shopOfficeTotalVnd = shopRows.reduce((s, r) => {
    if (!r.shopAccountantConfirmedAt || r.shopAccountantOfficeVnd == null) return s;
    const settlement = parseShopExtraNote(r.note).settlement;
    // В баланс «гид -> офис» включаем только кейс «деньги у гида».
    if (settlement === "office_received") return s;
    return s + Math.max(0, Number(r.shopAccountantOfficeVnd) || 0);
  }, 0);
  const shopGuideDueFromOfficeVnd = shopRows.reduce((s, r) => {
    if (!r.shopAccountantConfirmedAt || r.shopAccountantGuideVnd == null) return s;
    const settlement = parseShopExtraNote(r.note).settlement;
    // При «деньги в офисе» и непогашенной выплате офис должен гиду его долю.
    if (settlement !== "office_received") return s;
    if (r.status === "paid") return s;
    return s + Math.max(0, Number(r.shopAccountantGuideVnd) || 0);
  }, 0);
  return computeTourGuideSettlementBreakdown({
    pendingTopupsSumVnd,
    touristDebtSumVnd,
    guideCashDepositVnd: tour.guideCashDepositVnd ?? null,
    guideExpensesTotalVnd,
    shopOfficeTotalVnd,
    shopGuideDueFromOfficeVnd,
    accountantGuideSalaryVnd: tour.accountantGuideSalaryVnd ?? null,
  });
}

// ─── Панель «Сдача в кассу сегодня» ─────────────────────────────────────────

export type TodayGuideHandoverEntry = {
  tourId: string;
  tourName: string;
  guideId: string;
  guideName: string;
  /** Гид должен офису (после вычета расходов и зарплаты). */
  guideOwesVnd: number;
  /** Офис должен гиду. */
  officeOwesVnd: number;
  /** Уже принято сегодня по этому туру от гида. */
  handedOverTodayVnd: number;
};

export type TodayManagerHandoverEntry = {
  tourId: string;
  tourName: string;
  managerId: string;
  managerName: string;
  /** Ещё не сдал в кассу по этому туру. */
  outstandingVnd: number;
  /** Сколько принято сегодня. */
  handedOverTodayVnd: number;
};

/** Загружает статус сдачи в кассу для туров сегодня: гиды + менеджеры. */
export async function listTodayHandoverStatus(
  tourRows: Array<{
    tourId: string;
    tourName: string;
    managerId: string | null;
    managerName: string | null;
    managerTourCashOutstandingVnd: number | null;
  }>,
  todayYmd: string,
): Promise<{ guides: TodayGuideHandoverEntry[]; managers: TodayManagerHandoverEntry[] }> {
  const empty = { guides: [], managers: [] };
  if (!tourRows.length) return empty;
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const tourIds = tourRows.map((r) => r.tourId);
  const tourNameById = new Map(tourRows.map((r) => [r.tourId, r.tourName]));
  const todayStart = `${todayYmd}T00:00:00`;

  type TgRow = { tour_id: string; guide_id: string };
  type HRow = { tour_id: string; holder_role: string; employee_id: string; amount_vnd: number | string };

  const [tgResult, handoverResult] = await Promise.all([
    supabase.from("tour_guides").select("tour_id,guide_id").in("tour_id", tourIds).eq("is_primary", true),
    supabase
      .from("tour_office_cash_handovers")
      .select("tour_id,holder_role,employee_id,amount_vnd")
      .in("tour_id", tourIds)
      .in("holder_role", ["guide", "manager"])
      .gte("received_at", todayStart),
  ]);

  const guideByTour = new Map<string, string>();
  const guideIds: string[] = [];
  for (const r of (tgResult.data as TgRow[] | null) ?? []) {
    guideByTour.set(r.tour_id, r.guide_id);
    guideIds.push(r.guide_id);
  }

  const guideHandoverByTour = new Map<string, number>();
  const mgrHandoverByTour = new Map<string, number>();
  for (const r of (handoverResult.data as HRow[] | null) ?? []) {
    const amt = Number(r.amount_vnd || 0);
    if (r.holder_role === "guide") {
      guideHandoverByTour.set(r.tour_id, (guideHandoverByTour.get(r.tour_id) ?? 0) + amt);
    } else if (r.holder_role === "manager") {
      mgrHandoverByTour.set(r.tour_id, (mgrHandoverByTour.get(r.tour_id) ?? 0) + amt);
    }
  }

  // ─── Гиды ────────────────────────────────────────────────────────────────
  let guideEntries: TodayGuideHandoverEntry[] = [];
  if (guideIds.length) {
    const { data: userRows } = await supabase.from("users").select("id,full_name").in("id", [...new Set(guideIds)]);
    const nameById = new Map<string, string>();
    for (const u of (userRows as { id: string; full_name: string | null }[] | null) ?? []) {
      nameById.set(u.id, String(u.full_name || "").trim() || "гид");
    }

    const tourIdsWithGuides = tourIds.filter((id) => guideByTour.has(id));
    const settlementResults = await Promise.all(
      tourIdsWithGuides.map(async (tourId) => ({
        tourId,
        settlement: await getTourGuideSettlementBreakdownForTour(tourId),
      })),
    );

    guideEntries = settlementResults
      .map(({ tourId, settlement }) => {
        const guideId = guideByTour.get(tourId)!;
        return {
          tourId,
          tourName: tourNameById.get(tourId) ?? "Тур",
          guideId,
          guideName: nameById.get(guideId) ?? "гид",
          guideOwesVnd: settlement?.guideOwesAfterSalaryVnd ?? 0,
          officeOwesVnd: settlement?.officeOwesAfterSalaryVnd ?? 0,
          handedOverTodayVnd: guideHandoverByTour.get(tourId) ?? 0,
        };
      })
      .sort((a, b) => b.guideOwesVnd - a.guideOwesVnd);
  }

  // ─── Менеджеры ───────────────────────────────────────────────────────────
  const managerEntries: TodayManagerHandoverEntry[] = tourRows
    .filter((t) => t.managerId)
    .map((t) => ({
      tourId: t.tourId,
      tourName: t.tourName,
      managerId: t.managerId!,
      managerName: (t.managerName || "").trim() || "Менеджер",
      outstandingVnd: Math.max(0, t.managerTourCashOutstandingVnd ?? 0),
      handedOverTodayVnd: mgrHandoverByTour.get(t.tourId) ?? 0,
    }))
    .filter((t) => t.outstandingVnd > 0 || t.handedOverTodayVnd > 0)
    .sort((a, b) => b.outstandingVnd - a.outstandingVnd);

  return { guides: guideEntries, managers: managerEntries };
}

// ─── Карточки туров с полной разбивкой по ролям ──────────────────────────────

export type TourHandoverPersonEntry = {
  managerId: string;
  managerName: string;
};

export type TourHandoverDispatcherEntry = {
  dispatcherId: string;
  dispatcherName: string;
};

export type TodayTourHandoverCard = {
  tourId: string;
  tourName: string;
  pax: number;
  guide: {
    guideId: string;
    guideName: string;
    guideOwesVnd: number;
    officeOwesVnd: number;
    /** Принято за период (сегодня или всё время — зависит от refYmd). */
    handedOverVnd: number;
  } | null;
  /** Все менеджеры на туре (не только первичный). */
  managers: TourHandoverPersonEntry[];
  /** Долг менеджеров: на руках у основного менеджера (из listAccountingTours). */
  managerOutstandingVnd: number;
  /** Принято от менеджеров за период. */
  managerHandedVnd: number;
  /** Диспетчеры, создававшие расходы на этом туре. */
  dispatchers: TourHandoverDispatcherEntry[];
};

/**
 * Возвращает карточки туров для панели «Сдача в кассу»:
 * по каждому туру — гид + все менеджеры + диспетчеры.
 */
export async function listTodayTourHandoverCards(
  tourRows: AccountingTourRow[],
  /** Фильтровать сдачи только с этой даты (YYYY-MM-DD). null = всё время. */
  refYmd: string | null,
): Promise<TodayTourHandoverCard[]> {
  if (!tourRows.length) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const tourIds = tourRows.map((r) => r.tourId);

  type TgRow = { tour_id: string; guide_id: string };
  type HRow = { tour_id: string; holder_role: string; amount_vnd: number | string };
  type BRow = { tour_id: string; manager_id: string | null; users?: unknown };
  type ExpRow = { tour_id: string; created_by: string | null };

  const handoverBaseQ = supabase
    .from("tour_office_cash_handovers")
    .select("tour_id,holder_role,amount_vnd")
    .in("tour_id", tourIds)
    .in("holder_role", ["guide", "manager"]);
  const handoverQ = refYmd ? handoverBaseQ.gte("received_at", `${refYmd}T00:00:00`) : handoverBaseQ;

  // Все запросы параллельно
  const [tgResult, handoverResult, bookingResult, expenseResult] = await Promise.all([
    supabase.from("tour_guides").select("tour_id,guide_id").in("tour_id", tourIds).eq("is_primary", true),
    handoverQ,
    supabase
      .from("bookings")
      .select("tour_id,manager_id,users!bookings_manager_id_fkey(id,full_name)")
      .in("tour_id", tourIds)
      .is("deleted_at", null)
      .not("manager_id", "is", null),
    supabase
      .from("expenses")
      .select("tour_id,created_by")
      .in("tour_id", tourIds)
      .in("category", ["bus", "booking"])
      .not("created_by", "is", null),
  ]);

  // ─── Гиды ────────────────────────────────────────────────────────────────
  const guideByTour = new Map<string, string>();
  const guideIds: string[] = [];
  for (const r of (tgResult.data as TgRow[] | null) ?? []) {
    guideByTour.set(r.tour_id, r.guide_id);
    guideIds.push(r.guide_id);
  }

  // ─── Сдачи сегодня ───────────────────────────────────────────────────────
  const guideHandoverByTour = new Map<string, number>();
  const mgrHandoverByTour = new Map<string, number>();
  for (const r of (handoverResult.data as HRow[] | null) ?? []) {
    const amt = Number(r.amount_vnd || 0);
    if (r.holder_role === "guide") guideHandoverByTour.set(r.tour_id, (guideHandoverByTour.get(r.tour_id) ?? 0) + amt);
    else if (r.holder_role === "manager") mgrHandoverByTour.set(r.tour_id, (mgrHandoverByTour.get(r.tour_id) ?? 0) + amt);
  }

  // ─── Менеджеры (все, не только первичный) ────────────────────────────────
  const managersByTour = new Map<string, Map<string, string>>(); // tour_id → Map<manager_id, name>
  for (const r of (bookingResult.data as BRow[] | null) ?? []) {
    if (!r.manager_id) continue;
    if (!managersByTour.has(r.tour_id)) managersByTour.set(r.tour_id, new Map());
    const inner = managersByTour.get(r.tour_id)!;
    if (!inner.has(r.manager_id)) {
      const u = r.users as { full_name?: string | null } | null;
      inner.set(r.manager_id, String(u?.full_name || "").trim() || "Менеджер");
    }
  }

  // ─── Диспетчеры (по расходам на туре) ────────────────────────────────────
  const dispatcherIdsByTour = new Map<string, Set<string>>();
  const allDispatcherIds: string[] = [];
  for (const r of (expenseResult.data as ExpRow[] | null) ?? []) {
    if (!r.created_by) continue;
    if (!dispatcherIdsByTour.has(r.tour_id)) dispatcherIdsByTour.set(r.tour_id, new Set());
    const ids = dispatcherIdsByTour.get(r.tour_id)!;
    if (!ids.has(r.created_by)) {
      ids.add(r.created_by);
      allDispatcherIds.push(r.created_by);
    }
  }

  // ─── Имена гидов + имена/роли диспетчеров (параллельно) ──────────────────
  const uniqueGuideIds = [...new Set(guideIds)];
  const uniqueDispatcherIds = [...new Set(allDispatcherIds)];

  const [guideNameResult, dispatcherNameResult] = await Promise.all([
    uniqueGuideIds.length
      ? supabase.from("users").select("id,full_name").in("id", uniqueGuideIds)
      : Promise.resolve({ data: null }),
    uniqueDispatcherIds.length
      ? supabase.from("users").select("id,full_name,role").in("id", uniqueDispatcherIds).in("role", ["dispatcher", "booking_dispatcher"])
      : Promise.resolve({ data: null }),
  ]);

  const guideNameById = new Map<string, string>();
  for (const u of (guideNameResult.data as { id: string; full_name: string | null }[] | null) ?? []) {
    guideNameById.set(u.id, String(u.full_name || "").trim() || "гид");
  }
  const dispatcherNameById = new Map<string, string>();
  for (const u of (dispatcherNameResult.data as { id: string; full_name: string | null }[] | null) ?? []) {
    dispatcherNameById.set(u.id, String(u.full_name || "").trim() || "диспетчер");
  }

  // ─── Расчёт гидов (параллельно) ──────────────────────────────────────────
  const tourIdsWithGuides = tourIds.filter((id) => guideByTour.has(id));
  const settlementMap = new Map<string, Awaited<ReturnType<typeof getTourGuideSettlementBreakdownForTour>>>();
  const settlements = await Promise.all(
    tourIdsWithGuides.map(async (tourId) => ({ tourId, s: await getTourGuideSettlementBreakdownForTour(tourId) })),
  );
  for (const { tourId, s } of settlements) settlementMap.set(tourId, s);

  // ─── Сборка карточек ─────────────────────────────────────────────────────
  const mgrOutstandingByTour = new Map(tourRows.map((r) => [r.tourId, Math.max(0, r.managerTourCashOutstandingVnd ?? 0)]));
  const tourNameById = new Map(tourRows.map((r) => [r.tourId, r.tourName]));
  const paxByTour = new Map(tourRows.map((r) => [r.tourId, r.pax ?? 0]));

  return tourIds.map((tourId) => {
    const guideId = guideByTour.get(tourId);
    const s = guideId ? settlementMap.get(tourId) : null;

    const guide = guideId
      ? {
          guideId,
          guideName: guideNameById.get(guideId) ?? "гид",
          guideOwesVnd: s?.guideOwesAfterSalaryVnd ?? 0,
          officeOwesVnd: s?.officeOwesAfterSalaryVnd ?? 0,
          handedOverVnd: guideHandoverByTour.get(tourId) ?? 0,
        }
      : null;

    const managersMap = managersByTour.get(tourId) ?? new Map<string, string>();
    const managers = [...managersMap.entries()].map(([managerId, managerName]) => ({ managerId, managerName }));

    const dispIds = dispatcherIdsByTour.get(tourId);
    const dispatchers = dispIds
      ? [...dispIds].filter((id) => dispatcherNameById.has(id)).map((id) => ({ dispatcherId: id, dispatcherName: dispatcherNameById.get(id)! }))
      : [];

    return {
      tourId,
      tourName: tourNameById.get(tourId) ?? "Тур",
      pax: paxByTour.get(tourId) ?? 0,
      guide,
      managers,
      managerOutstandingVnd: mgrOutstandingByTour.get(tourId) ?? 0,
      managerHandedVnd: mgrHandoverByTour.get(tourId) ?? 0,
      dispatchers,
    };
  });
}

export interface CurrentCashStateSummary {
  /** Расчётный баланс кассы (все движения: приходы − расходы). */
  currentCashBalanceVnd: number;
  /** На руках у менеджеров: все депозиты − все сдачи в кассу офиса. */
  managerHeldVnd: number;
  /** Суммарный долг по всем активным броням. */
  totalBookingDueVnd: number;
  /** Доплаты гида, ещё не принятые в кассу. */
  pendingGuideTopupsVnd: number;
  /** USD итого в ручных проводках «в кассу» (наличные + банк). */
  manualInUsd: number;
  /** Банковские переводы «в кассу» (₫ эквивалент). */
  bankTransferInVnd: number;
}

export async function getCurrentCashStateSummary(): Promise<CurrentCashStateSummary> {
  const supabase = getSupabaseAdmin();
  const empty: CurrentCashStateSummary = {
    currentCashBalanceVnd: 0,
    managerHeldVnd: 0,
    totalBookingDueVnd: 0,
    pendingGuideTopupsVnd: 0,
    manualInUsd: 0,
    bankTransferInVnd: 0,
  };
  if (!supabase) return empty;

  const todayYmd = (await import("@/lib/scheduling")).tourBusinessTodayYmd();

  const [cashData, bookingDue, pendingTopups, payKinds, manualLedger] = await Promise.all([
    getCashDashboardData(todayYmd, null),
    sumTotalBookingDueVnd(),
    sumPendingGuideTopupsVnd(),
    supabase.from("payments").select("kind,amount_vnd"),
    supabase
      .from("manual_cash_ledger")
      .select("direction,payment_kind,currency_code,amount,amount_vnd")
      .in("direction", ["in", "out"]),
  ]);

  let depositTotal = 0;
  let officeCashTotal = 0;
  for (const p of (payKinds.data || []) as { kind: string; amount_vnd: number }[]) {
    const amt = Number(p.amount_vnd || 0);
    if (p.kind === "deposit") depositTotal += amt;
    else if (p.kind === "office_cash") officeCashTotal += amt;
  }

  let manualInUsd = 0;
  let bankTransferInVnd = 0;
  for (const row of (manualLedger.data || []) as {
    direction: string;
    payment_kind: string;
    currency_code: string | null;
    amount: number | null;
    amount_vnd: number | null;
  }[]) {
    if (row.direction !== "in") continue;
    const vnd = Number(row.amount_vnd || 0);
    const amt = Number(row.amount || 0);
    const cur = (row.currency_code || "VND").toUpperCase();
    if (cur === "USD" && amt > 0) manualInUsd += amt;
    if (row.payment_kind === "bank_transfer") bankTransferInVnd += vnd;
  }

  return {
    currentCashBalanceVnd: cashData.currentBalanceVnd,
    managerHeldVnd: Math.max(0, depositTotal - officeCashTotal),
    totalBookingDueVnd: bookingDue,
    pendingGuideTopupsVnd: pendingTopups,
    manualInUsd,
    bankTransferInVnd,
  };
}

/**
 * Поиск туристов (броней) по имени, телефону, отелю или коду ON.
 * managerId: только брони этого менеджера (роль manager).
 * guideId: только брони туров, на которых назначен гид (роль guide/chief_guide).
 */
export async function getTouristProfileData(bookingId: string): Promise<TouristProfileData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  type EntryRow = {
    id: string; tour_id: string; manager_id: string; customer_name: string;
    hotel_name: string; phone_e164: string; telegram_username: string | null;
    online_code: string | null; adults: number; children: number; infants: number;
    users: { full_name: string } | { full_name: string }[] | null;
  };

  const { data: entry, error: entryErr } = await supabase
    .from("bookings")
    .select("id,tour_id,manager_id,customer_name,hotel_name,phone_e164,telegram_username,online_code,adults,children,infants,users!bookings_manager_id_fkey(full_name)")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (entryErr || !entry) return null;
  const e = entry as EntryRow;

  type BRow = { id: string; tour_id: string; manager_id: string; adults: number; children: number; infants: number; users: { full_name: string } | { full_name: string }[] | null };

  let allBookings: BRow[] = [];
  if (e.phone_e164) {
    const { data: byPhone } = await supabase
      .from("bookings")
      .select("id,tour_id,manager_id,adults,children,infants,users!bookings_manager_id_fkey(full_name)")
      .eq("phone_e164", e.phone_e164)
      .is("deleted_at", null)
      .limit(200);
    allBookings = (byPhone as BRow[] | null) ?? [];
  }
  if (!allBookings.find((b) => b.id === bookingId)) {
    allBookings = [{ id: e.id, tour_id: e.tour_id, manager_id: e.manager_id, adults: e.adults, children: e.children, infants: e.infants, users: e.users }, ...allBookings];
  }

  const bkIds = allBookings.map((b) => b.id);
  const tourIds = [...new Set(allBookings.map((b) => b.tour_id).filter(Boolean))];

  const [payRes, tourRes, priceRes] = await Promise.all([
    supabase.from("payments").select("booking_id,amount_vnd,kind").in("booking_id", bkIds),
    tourIds.length
      ? supabase.from("tours").select("id,name,start_at").in("id", tourIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabase.from("booking_prices").select("booking_id,amount_vnd").in("booking_id", bkIds),
  ]);

  const payments = (payRes.data as { booking_id: string; amount_vnd: number; kind: string }[] | null) ?? [];
  const tours = (tourRes.data as { id: string; name: string; start_at: string }[] | null) ?? [];
  const prices = (priceRes.data as { booking_id: string; amount_vnd: number }[] | null) ?? [];

  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const paidByBk = new Map<string, number>();
  for (const p of payments) {
    if (p.kind !== "refund") paidByBk.set(p.booking_id, (paidByBk.get(p.booking_id) ?? 0) + Number(p.amount_vnd));
    else paidByBk.set(p.booking_id, (paidByBk.get(p.booking_id) ?? 0) - Number(p.amount_vnd));
  }
  const totalByBk = new Map<string, number>();
  for (const p of prices) totalByBk.set(p.booking_id, Number(p.amount_vnd));

  const bookings: TouristHistoryRow[] = allBookings.map((b) => {
    const tour = tourMap.get(b.tour_id);
    const tourDate = tour?.start_at ? tour.start_at.slice(0, 10) : null;
    const total = totalByBk.get(b.id) ?? 0;
    const paid = Math.max(0, paidByBk.get(b.id) ?? 0);
    const due = Math.max(0, total - paid);
    const ps: import("@/lib/types").PaymentStatus = due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    const mgr = b.users;
    return {
      bookingId: b.id,
      tourId: b.tour_id,
      tourName: tour?.name ?? "Тур",
      tourDate,
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      totalVnd: total,
      paidVnd: paid,
      dueVnd: due,
      paymentStatus: ps,
      managerId: b.manager_id,
      managerName: Array.isArray(mgr) ? (mgr[0]?.full_name ?? "—") : (mgr?.full_name ?? "—"),
    };
  }).sort((a, b) => {
    if (!a.tourDate && !b.tourDate) return 0;
    if (!a.tourDate) return 1;
    if (!b.tourDate) return -1;
    return b.tourDate.localeCompare(a.tourDate);
  });

  const mgr = e.users;
  return {
    entryBookingId: e.id,
    customerName: e.customer_name,
    phone: e.phone_e164 ?? "",
    hotel: e.hotel_name ?? "",
    onlineCode: e.online_code ?? null,
    telegramUsername: e.telegram_username ?? null,
    managerId: e.manager_id,
    managerName: Array.isArray(mgr) ? (mgr[0]?.full_name ?? "—") : (mgr?.full_name ?? "—"),
    adults: e.adults,
    children: e.children,
    infants: e.infants,
    bookings,
  };
}

export async function listManagersFinanceSummary(): Promise<ManagerRosterFinanceSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const today = localDateString();
  const d = new Date(`${today}T12:00:00`);
  const monthStartYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const tomorrowYmd = nextDayYmd(today);
  const tomorrowIso = `${tomorrowYmd}T00:00:00.000Z`;

  const usersRes = await supabase
    .from("users")
    .select("id,full_name,manager_sales_commission_percent,rental_points(name)")
    .eq("is_active", true)
    .in("role", ["manager", "chief_manager"])
    .neq("login", "test")
    .order("full_name");

  const users = (usersRes.data as { id: string; full_name: string; manager_sales_commission_percent: number | null; rental_points: { name: string } | { name: string }[] | null }[] | null) ?? [];
  if (!users.length) return [];

  const managerIds = users.map((u) => u.id);

  const { data: bkData } = await supabase
    .from("bookings")
    .select("id,manager_id,created_at")
    .in("manager_id", managerIds)
    .is("deleted_at", null);
  const bookings = (bkData as { id: string; manager_id: string; created_at: string }[] | null) ?? [];

  const bookingIds = bookings.map((b) => b.id);
  const allPayments: { booking_id: string; amount_vnd: number; kind: string; created_at: string }[] = [];
  for (let i = 0; i < bookingIds.length; i += 500) {
    const chunk = bookingIds.slice(i, i + 500);
    if (!chunk.length) continue;
    const { data } = await supabase
      .from("payments")
      .select("booking_id,amount_vnd,kind,created_at")
      .in("booking_id", chunk);
    if (data) allPayments.push(...(data as typeof allPayments));
  }

  const { data: hoData } = await supabase
    .from("tour_office_cash_handovers")
    .select("employee_id,amount_vnd")
    .in("employee_id", managerIds)
    .eq("holder_role", "manager");
  const handovers = (hoData as { employee_id: string; amount_vnd: number }[] | null) ?? [];

  const bkCountMonth = new Map<string, number>();
  const bkCountAll = new Map<string, number>();
  const bkToManager = new Map<string, string>();
  for (const bk of bookings) {
    bkToManager.set(bk.id, bk.manager_id);
    bkCountAll.set(bk.manager_id, (bkCountAll.get(bk.manager_id) ?? 0) + 1);
    if (bk.created_at >= `${monthStartYmd}T00:00:00.000Z` && bk.created_at < tomorrowIso) {
      bkCountMonth.set(bk.manager_id, (bkCountMonth.get(bk.manager_id) ?? 0) + 1);
    }
  }

  const receivedAllTime = new Map<string, number>();
  for (const pay of allPayments) {
    const mid = bkToManager.get(pay.booking_id);
    if (!mid) continue;
    const amt = typeof pay.amount_vnd === "number" ? pay.amount_vnd : Number(pay.amount_vnd);
    const delta = pay.kind === "refund" ? -amt : amt;
    receivedAllTime.set(mid, (receivedAllTime.get(mid) ?? 0) + delta);
  }

  const handedAll = new Map<string, number>();
  for (const ho of handovers) {
    const amt = typeof ho.amount_vnd === "number" ? ho.amount_vnd : Number(ho.amount_vnd);
    handedAll.set(ho.employee_id, (handedAll.get(ho.employee_id) ?? 0) + amt);
  }

  return users.map((u) => {
    const rpRaw = u.rental_points;
    const rentalPointName = Array.isArray(rpRaw) ? (rpRaw[0]?.name ?? null) : (rpRaw?.name ?? null);
    const commission = typeof u.manager_sales_commission_percent === "number" ? u.manager_sales_commission_percent : 12;
    const received = Math.max(0, receivedAllTime.get(u.id) ?? 0);
    const handed = handedAll.get(u.id) ?? 0;
    const outstanding = Math.max(0, received - handed);
    return {
      id: u.id,
      fullName: u.full_name,
      commissionPercent: commission,
      rentalPointName: rentalPointName ?? null,
      bookingsMonth: bkCountMonth.get(u.id) ?? 0,
      bookingsAllTime: bkCountAll.get(u.id) ?? 0,
      receivedAllTimeVnd: received,
      handedAllTimeVnd: handed,
      outstandingVnd: outstanding,
      commissionEstimateVnd: Math.round(received * commission / 100),
    };
  });
}

export async function getManagerBookingAnalytics(managerId: string): Promise<ManagerBookingAnalytics> {
  const supabase = getSupabaseAdmin();
  const empty: ManagerBookingAnalytics = { totalBookings: 0, segments: { single: 0, couple: 0, family: 0, group: 0 }, peakHours: [] };
  if (!supabase) return empty;

  const { data: bkData } = await supabase
    .from("bookings")
    .select("adults,children,infants,created_at")
    .eq("manager_id", managerId)
    .is("deleted_at", null);
  const rows = (bkData as { adults: number; children: number; infants: number; created_at: string }[] | null) ?? [];
  if (!rows.length) return empty;

  const segments = { single: 0, couple: 0, family: 0, group: 0 };
  const hourCount = new Array<number>(24).fill(0);

  for (const bk of rows) {
    const pax = (Number(bk.adults ?? 1) || 1) + (Number(bk.children ?? 0)) + (Number(bk.infants ?? 0));
    if (pax === 1) segments.single++;
    else if (pax === 2) segments.couple++;
    else if (pax <= 4) segments.family++;
    else segments.group++;

    const dt = new Date(bk.created_at);
    const hourVn = (dt.getUTCHours() + 7) % 24;
    hourCount[hourVn]++;
  }

  const peakHours = hourCount
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { totalBookings: rows.length, segments, peakHours };
}

export type PersonalReportData =
  | { kind: "manager"; bookings: number; tourists: number; totalVnd: number; commissionVnd: number; commissionPct: number; ticketProfitVnd: number }
  | { kind: "guide"; trips: number; salaryAccruedVnd: number; salaryPaidVnd: number }
  | { kind: "dispatcher"; tours: number; busAssignments: number }
  | { kind: "accountant"; cashOps: number; cashInVnd: number; cashOutVnd: number }
  | { kind: "other" };

export type GuideProgramStat = {
  templateName: string;
  count: number;
  lastDate: string;
  inspectionCount: number;
};

/** All-time stats: which tour programs a user has worked + inspection count per program */
export async function getGuideAllTimeStats(userId: string): Promise<{
  programs: GuideProgramStat[];
  inspectionTotal: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { programs: [], inspectionTotal: 0 };

  const { data: tgRows } = await supabase
    .from("tour_guides")
    .select("tour_id,is_primary,is_inspection")
    .eq("guide_id", userId);

  const allSlots = (tgRows as { tour_id: string; is_primary: boolean; is_inspection: boolean }[] | null) ?? [];
  if (!allSlots.length) return { programs: [], inspectionTotal: 0 };

  const tourIds = [...new Set(allSlots.map((r) => r.tour_id))];
  const { data: tourRows } = await supabase
    .from("tours")
    .select("id,template_id,start_at,tour_templates(name)")
    .in("id", tourIds)
    .order("start_at", { ascending: false });

  type TRowRaw = { id: string; template_id: string | null; start_at: string; tour_templates: { name: string }[] | { name: string } | null };
  type TRow = { id: string; template_id: string | null; start_at: string; tour_templates: { name: string } | null };
  const tourMap = new Map<string, TRow>();
  for (const t of ((tourRows as unknown as TRowRaw[]) ?? [])) {
    const tpl = Array.isArray(t.tour_templates) ? (t.tour_templates[0] ?? null) : t.tour_templates;
    tourMap.set(t.id, { id: t.id, template_id: t.template_id, start_at: t.start_at, tour_templates: tpl });
  }

  // primary slots → count by template
  const primaryByTpl = new Map<string, { count: number; lastDate: string; templateName: string }>();
  const inspectionByTpl = new Map<string, number>();
  let inspectionTotal = 0;

  for (const slot of allSlots) {
    const tour = tourMap.get(slot.tour_id);
    if (!tour) continue;
    const tplName = tour.tour_templates?.name ?? tour.start_at.slice(0, 7);
    const dateYmd = startDateOnly(tour.start_at);

    if (slot.is_inspection) {
      inspectionTotal++;
      inspectionByTpl.set(tplName, (inspectionByTpl.get(tplName) ?? 0) + 1);
    } else {
      const cur = primaryByTpl.get(tplName) ?? { count: 0, lastDate: "", templateName: tplName };
      cur.count++;
      if (!cur.lastDate || dateYmd > cur.lastDate) cur.lastDate = dateYmd;
      primaryByTpl.set(tplName, cur);
    }
  }

  const programs: GuideProgramStat[] = [...primaryByTpl.entries()]
    .map(([tplName, v]) => ({
      templateName: v.templateName,
      count: v.count,
      lastDate: v.lastDate,
      inspectionCount: inspectionByTpl.get(tplName) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { programs, inspectionTotal };
}

export async function getPersonalReport(
  userId: string,
  role: Role,
  fromYmd: string,
  toYmd: string,
): Promise<PersonalReportData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (role === "manager" || role === "chief_manager")
      return { kind: "manager", bookings: 0, tourists: 0, totalVnd: 0, commissionVnd: 0, commissionPct: DEFAULT_MANAGER_SALES_COMMISSION, ticketProfitVnd: 0 };
    if (role === "guide" || role === "chief_guide")
      return { kind: "guide", trips: 0, salaryAccruedVnd: 0, salaryPaidVnd: 0 };
    if (role === "dispatcher" || role === "booking_dispatcher")
      return { kind: "dispatcher", tours: 0, busAssignments: 0 };
    if (role === "accountant")
      return { kind: "accountant", cashOps: 0, cashInVnd: 0, cashOutVnd: 0 };
    return { kind: "other" };
  }

  if (role === "manager" || role === "chief_manager") {
    const { data: pctRow } = await supabase
      .from("users")
      .select("manager_sales_commission_percent")
      .eq("id", userId)
      .maybeSingle();
    const pctRaw = (pctRow as { manager_sales_commission_percent?: number | string | null } | null)?.manager_sales_commission_percent;
    const commissionPct =
      pctRaw != null && pctRaw !== "" && Number.isFinite(Number(pctRaw))
        ? Math.min(100, Math.max(0, Number(pctRaw)))
        : DEFAULT_MANAGER_SALES_COMMISSION;

    // 1. Все брони менеджера + брони где он соисполнитель
    const [ownRes, sharesRes] = await Promise.all([
      supabase.from("bookings").select("id,tour_id,adults,children,infants").eq("manager_id", userId).is("deleted_at", null),
      supabase.from("booking_commission_shares").select("booking_id").eq("beneficiary_id", userId),
    ]);
    type BkRow = { id: string; tour_id: string; adults: number; children: number; infants: number };
    const ownRows = (ownRes.data as BkRow[] | null) ?? [];
    const shareBookingIds = (sharesRes.data as { booking_id: string }[] | null)?.map((r) => r.booking_id) ?? [];
    const shareRows = shareBookingIds.length
      ? (((await supabase.from("bookings").select("id,tour_id,adults,children,infants").in("id", shareBookingIds).is("deleted_at", null)).data as BkRow[] | null) ?? [])
      : [];

    const allById = new Map<string, BkRow>();
    for (const r of [...ownRows, ...shareRows]) allById.set(r.id, r);
    const allRows = [...allById.values()];
    if (!allRows.length) return { kind: "manager", bookings: 0, tourists: 0, totalVnd: 0, commissionVnd: 0, commissionPct, ticketProfitVnd: 0 };

    // 2. Даты туров → фильтрация по месяцу на клиенте
    const tourIds = [...new Set(allRows.map((r) => r.tour_id))];
    const { data: tourRows } = await supabase.from("tours").select("id,start_at").in("id", tourIds);
    const tourYmd = new Map(
      ((tourRows as { id: string; start_at: string }[]) || []).map((t) => [t.id, startDateOnly(t.start_at)]),
    );
    const filteredIds = allRows.filter((b) => {
      const ymd = tourYmd.get(b.tour_id);
      return ymd && ymd >= fromYmd && ymd <= toYmd;
    }).map((b) => b.id);

    if (!filteredIds.length) return { kind: "manager", bookings: 0, tourists: 0, totalVnd: 0, commissionVnd: 0, commissionPct, ticketProfitVnd: 0 };

    // 3. Сумма по прайсу из booking_prices
    const { data: priceRows } = await supabase.from("booking_prices").select("booking_id,amount_vnd").in("booking_id", filteredIds);
    const priceByBooking = new Map<string, number>();
    for (const p of (priceRows as { booking_id: string; amount_vnd: number }[]) ?? []) {
      priceByBooking.set(p.booking_id, (priceByBooking.get(p.booking_id) || 0) + Number(p.amount_vnd || 0));
    }

    let tourists = 0;
    let totalVnd = 0;
    for (const id of filteredIds) {
      const b = allById.get(id);
      if (b) tourists += (Number(b.adults) || 1) + (Number(b.children) || 0) + (Number(b.infants) || 0);
      totalVnd += priceByBooking.get(id) || 0;
    }
    // Билеты за период
    const { data: ticketRows } = await supabase
      .from("ticket_sales")
      .select("sold_at,manager_profit_vnd")
      .eq("manager_id", userId);
    let ticketProfitVnd = 0;
    for (const row of (ticketRows as { sold_at: string; manager_profit_vnd: number }[]) ?? []) {
      const d = localDateString(new Date(row.sold_at));
      if (d >= fromYmd && d <= toYmd) ticketProfitVnd += Number(row.manager_profit_vnd || 0);
    }

    return { kind: "manager", bookings: filteredIds.length, tourists, totalVnd, commissionVnd: Math.round((totalVnd * commissionPct) / 100), commissionPct, ticketProfitVnd };
  }

  if (role === "guide" || role === "chief_guide") {
    const { data: tgRows } = await supabase.from("tour_guides").select("tour_id").eq("guide_id", userId);
    const allTourIds = [...new Set((tgRows as { tour_id: string }[] | null)?.map((r) => r.tour_id) ?? [])];
    if (!allTourIds.length) return { kind: "guide", trips: 0, salaryAccruedVnd: 0, salaryPaidVnd: 0 };

    const { data: tourRows } = await supabase.from("tours").select("id,start_at").in("id", allTourIds);
    const filteredTourIds = ((tourRows as { id: string; start_at: string }[]) ?? [])
      .filter((t) => { const ymd = startDateOnly(t.start_at); return ymd >= fromYmd && ymd <= toYmd; })
      .map((t) => t.id);

    let salaryAccruedVnd = 0;
    let salaryPaidVnd = 0;
    if (filteredTourIds.length) {
      const { data: salRows } = await supabase
        .from("guide_salary_records").select("amount_vnd,status").eq("guide_id", userId).in("tour_id", filteredTourIds);
      for (const s of (salRows as { amount_vnd: number; status: string }[]) ?? []) {
        salaryAccruedVnd += Number(s.amount_vnd || 0);
        if (s.status === "paid") salaryPaidVnd += Number(s.amount_vnd || 0);
      }
    }
    return { kind: "guide", trips: filteredTourIds.length, salaryAccruedVnd, salaryPaidVnd };
  }

  if (role === "dispatcher" || role === "booking_dispatcher") {
    const { data: tourRows } = await supabase.from("tours").select("id,start_at").neq("status", "deleted");
    const filteredTourIds = ((tourRows as { id: string; start_at: string }[]) ?? [])
      .filter((t) => { const ymd = startDateOnly(t.start_at); return ymd >= fromYmd && ymd <= toYmd; })
      .map((t) => t.id);
    let busAssignments = 0;
    if (filteredTourIds.length) {
      const { count } = await supabase.from("bus_assignments").select("id", { count: "exact", head: true }).in("tour_id", filteredTourIds);
      busAssignments = count ?? 0;
    }
    return { kind: "dispatcher", tours: filteredTourIds.length, busAssignments };
  }

  if (role === "accountant") {
    const fromTs = `${fromYmd}T00:00:00`;
    const toTs = `${toYmd}T23:59:59`;
    const { data: ledgerRows } = await supabase
      .from("cash_manual_ledger_entries").select("direction,amount_vnd")
      .eq("created_by", userId).gte("created_at", fromTs).lte("created_at", toTs);
    let cashInVnd = 0;
    let cashOutVnd = 0;
    for (const r of (ledgerRows as { direction: string; amount_vnd: number }[]) ?? []) {
      if (r.direction === "in") cashInVnd += Number(r.amount_vnd || 0);
      else cashOutVnd += Number(r.amount_vnd || 0);
    }
    return { kind: "accountant", cashOps: ledgerRows?.length ?? 0, cashInVnd, cashOutVnd };
  }

  return { kind: "other" };
}

export async function searchBookingsGlobal(
  q: string,
  managerId?: string | null,
  limit = 100,
  guideId?: string | null,
  opts?: { allowEmpty?: boolean; orderByOnCode?: boolean },
): Promise<import("@/lib/types").TouristSearchRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const needle = q.trim();
  if (!needle && !managerId && !guideId && !opts?.allowEmpty) return [];

  // Для гида — получаем tour_id из tour_guides
  let guideTourIds: string[] | null = null;
  if (guideId) {
    const { data: tg } = await supabase
      .from("tour_guides")
      .select("tour_id")
      .eq("guide_id", guideId);
    guideTourIds = (tg as { tour_id: string }[] | null)?.map((r) => r.tour_id) ?? [];
    if (guideTourIds.length === 0 && !needle) return [];
  }

  type BRow = {
    id: string;
    tour_id: string;
    manager_id: string;
    customer_name: string;
    hotel_name: string;
    phone_e164: string;
    telegram_username?: string | null;
    online_code?: string | null;
    adults: number;
    children: number;
    infants: number;
    users: unknown;
  };

  const orderByOnCode = opts?.orderByOnCode ?? false;
  let qb = supabase
    .from("bookings")
    .select("id,tour_id,manager_id,customer_name,hotel_name,phone_e164,telegram_username,online_code,adults,children,infants,users!bookings_manager_id_fkey(full_name)")
    .is("deleted_at", null)
    .order(orderByOnCode ? "online_code" : "id", { ascending: orderByOnCode, nullsFirst: false })
    .limit(limit);

  if (managerId) {
    qb = qb.eq("manager_id", managerId);
  }

  if (guideTourIds !== null && guideTourIds.length > 0) {
    qb = qb.in("tour_id", guideTourIds);
  }

  if (needle) {
    qb = qb.or(
      [
        `customer_name.ilike.%${needle}%`,
        `phone_e164.ilike.%${needle}%`,
        `hotel_name.ilike.%${needle}%`,
        `online_code.ilike.%${needle}%`,
      ].join(","),
    );
  }

  const { data: bRows, error } = await qb;
  if (error || !bRows || !Array.isArray(bRows)) return [];
  const rows = bRows as BRow[];
  if (rows.length === 0) return [];

  const bookingIds = rows.map((r) => r.id);
  const tourIds = [...new Set(rows.map((r) => r.tour_id).filter(Boolean))];

  const [payRes, tourRes, priceRes] = await Promise.all([
    supabase
      .from("payments")
      .select("id,booking_id,amount_vnd,kind,remitted_to_cash_at")
      .in("booking_id", bookingIds),
    tourIds.length
      ? supabase.from("tours").select("id,name,start_at").in("id", tourIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabase
      .from("booking_prices")
      .select("booking_id,amount_vnd")
      .in("booking_id", bookingIds),
  ]);

  const payAggMap = aggregatePaymentsEx(
    ((payRes.data || []) as PaymentRowAgg[]),
  );

  const totalByBooking = new Map<string, number>();
  for (const p of (priceRes.data || []) as { booking_id: string; amount_vnd: number }[]) {
    totalByBooking.set(p.booking_id, (totalByBooking.get(p.booking_id) || 0) + Number(p.amount_vnd));
  }

  type TRow = { id: string; name: string; start_at: string };
  const tourMap = new Map<string, TRow>();
  for (const t of (tourRes.data || []) as TRow[]) {
    tourMap.set(t.id, t);
  }

  return rows.map((row) => {
    const tour = tourMap.get(row.tour_id);
    const tourDate = tour?.start_at ? (tourCalendarDateFromStartAtIso(tour.start_at) || tour.start_at.slice(0, 10)) : "";
    const agg = payAggMap.get(row.id) || emptyPayAggEx();
    const paid = paidOfficialFromAgg(agg);
    const total = totalByBooking.get(row.id) || 0;
    const due = Math.max(0, total - paid);
    return {
      bookingId: row.id,
      tourId: row.tour_id,
      tourName: tour?.name || "",
      tourDate,
      customerName: row.customer_name,
      hotel: row.hotel_name || "",
      phone: row.phone_e164 || "",
      telegramUsername: row.telegram_username?.trim() || null,
      onlineCode: row.online_code?.trim() || undefined,
      managerId: row.manager_id,
      managerName: bookingManagerFullName(row.users),
      totalVnd: total,
      paidVnd: paid,
      dueVnd: due,
      paymentStatus: paymentStatusFrom(total, paid),
      adults: row.adults,
      children: row.children,
      infants: row.infants,
    };
  });
}
