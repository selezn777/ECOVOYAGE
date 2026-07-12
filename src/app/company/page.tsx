import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { requireAuth } from "@/lib/auth-session";
import { formatVnd } from "@/lib/format";
import { getDirectorCompanyDashboard, type DirectorCompanyDashboard } from "@/lib/data";
import { roleLabel } from "@/lib/role-labels";
import { localizeTourName } from "@/lib/tour-localization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanySearchParams = {
  month?: string | string[];
};

function pickFirst(v?: string | string[]): string {
  if (!v) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

type CompanyLocale = "ru" | "en" | "vi";

const COMPANY_TEXT: Record<CompanyLocale, {
  brand: string;
  title: string;
  subtitle: (period: string) => string;
  prevMonth: string;
  nextMonth: string;
  periodLabel: string;
  revenue: string;
  profit: string;
  paid: string;
  avgCheck: string;
  bookings: string;
  tourists: string;
  expenses: string;
  debt: string;
  paxInBooking: string;
  financeEyebrow: string;
  financeTitle: string;
  chartTitle: string;
  peakDay: string;
  days: string;
  revenueBars: string;
  expenseBars: string;
  collected: string;
  margin: string;
  exactPrices: string;
  estimatedPrices: string;
  refunds: string;
  fromBookingPrices: string;
  missingPriceBookings: (n: number) => string;
  minusPayments: string;
  dayDetails: string;
  riskEyebrow: string;
  riskTitle: string;
  paidShort: string;
  partialShort: string;
  unpaidShort: string;
  managersTitle: string;
  managersEyebrow: string;
  salesLeader: string;
  noManagerSales: string;
  allManagers: string;
  pointsTitle: string;
  pointsEyebrow: string;
  topPoint: string;
  staff: string;
  share: string;
  noSalesPoints: string;
  pointDetails: string;
  toursTitle: string;
  toursEyebrow: string;
  toursWithMotion: string;
  topTour: string;
  load: string;
  allToursWithMotion: string;
  urgentTours: string;
  noCriticalTours: string;
  guidesTitle: string;
  guidesEyebrow: string;
  noGuides: string;
  topGuide: string;
  allGuides: string;
  touristsTitle: string;
  touristsEyebrow: string;
  adults: string;
  children: string;
  infants: string;
  online: string;
  quality: string;
  missingPhone: string;
  missingHotel: string;
  soloPairs: string;
  familiesGroups: string;
  topHotels: string;
  noHotels: string;
  debtsByBookings: string;
  noDebts: string;
  pricesAndQuality: string;
  allExactPrices: string;
  fallbackWarning: string;
  open: string;
  rows: string;
  points: string;
  guides: string;
  noAssignments: string;
  date: string;
  tour: string;
  guide: string;
  role: string;
  point: string;
  employee: string;
  manager: string;
  reason: string;
  total: string;
  issue: string;
  estimate: string;
  trips: string;
  average: string;
  turnover: string;
  check: string;
  noData: string;
  seats: string;
  mainFlow: string;
  noChildren: string;
  debtIn: string;
  dataIssueSignals: string;
}> = {
  ru: {
    brand: "Центр Туризма",
    title: "Моя компания",
    subtitle: (period) => period,
    prevMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    periodLabel: "Период",
    revenue: "Выручка",
    profit: "Прибыль",
    paid: "Оплачено",
    avgCheck: "Средний чек",
    bookings: "броней",
    tourists: "туристов",
    expenses: "Расходы",
    debt: "К сбору",
    paxInBooking: "чел. в брони",
    financeEyebrow: "Финансы",
    financeTitle: "Деньги месяца",
    chartTitle: "Выручка и расходы по дням",
    peakDay: "Пик",
    days: "дней",
    revenueBars: "выручка",
    expenseBars: "расходы",
    collected: "Собрано",
    margin: "Маржа",
    exactPrices: "Выручка по броням",
    estimatedPrices: "Неполные оплаты",
    refunds: "Возвраты",
    fromBookingPrices: "Итоговая сумма проданных броней",
    missingPriceBookings: (n) => `${n} броней с незакрытой оплатой`,
    minusPayments: "Уменьшают выручку периода",
    dayDetails: "Дни месяца",
    riskEyebrow: "Контроль",
    riskTitle: "Что проверить",
    paidShort: "оплачено",
    partialShort: "частично",
    unpaidShort: "не оплачено",
    managersTitle: "Менеджеры",
    managersEyebrow: "",
    salesLeader: "Лидер продаж",
    noManagerSales: "За период нет продаж менеджеров.",
    allManagers: "Менеджеры: продажи и сборы",
    pointsTitle: "Точки продаж",
    pointsEyebrow: "Где продаем",
    topPoint: "Топ точка",
    staff: "сотр.",
    share: "доля",
    noSalesPoints: "Нет продаж по точкам за период.",
    pointDetails: "Разбор по точкам и онлайну",
    toursTitle: "Туры",
    toursEyebrow: "Что приносит деньги",
    toursWithMotion: "С движением",
    topTour: "Топ тур",
    load: "Заполняемость",
    allToursWithMotion: "Туры с продажами или расходами",
    urgentTours: "Что срочно проверить по турам",
    noCriticalTours: "Критичных сигналов по турам нет.",
    guidesTitle: "Тур-гиды",
    guidesEyebrow: "Кто ведет выезды",
    noGuides: "Нет назначенных гидов за период.",
    topGuide: "Топ-гид",
    allGuides: "Все гиды по выездам",
    touristsTitle: "Туристы и база",
    touristsEyebrow: "Качество данных",
    adults: "Взрослые",
    children: "Дети",
    infants: "Младенцы",
    online: "Онлайн",
    quality: "Качество",
    missingPhone: "Нет телефона",
    missingHotel: "нет отеля",
    soloPairs: "Соло/пары",
    familiesGroups: "Семьи/группы",
    topHotels: "Топ отелей по обороту",
    noHotels: "Отели не заполнены в бронях периода.",
    debtsByBookings: "К сбору по броням",
    noDebts: "К сбору по броням нет.",
    pricesAndQuality: "Сверка броней и данных",
    allExactPrices: "Во всех бронях цены заполнены.",
    fallbackWarning: "Цену нужно проверить",
    open: "открыть",
    rows: "строк",
    points: "точек",
    guides: "гидов",
    noAssignments: "без назначений",
    date: "Дата",
    tour: "Тур",
    guide: "Гид",
    role: "Роль",
    point: "Точка",
    employee: "Сотрудник",
    manager: "Менеджер",
    reason: "Причина",
    total: "Итого",
    issue: "Проблема",
    estimate: "Оценка",
    trips: "Выезды",
    average: "Среднее",
    turnover: "Оборот",
    check: "Проверка",
    noData: "нет данных",
    seats: "мест",
    mainFlow: "Основной поток",
    noChildren: "Тип брони без детей",
    debtIn: "К сбору в",
    dataIssueSignals: "сигналов",
  },
  en: {
    brand: "Центр Туризма",
    title: "My Company",
    subtitle: (period) => period,
    prevMonth: "Previous month",
    nextMonth: "Next month",
    periodLabel: "Period",
    revenue: "Revenue",
    profit: "Profit",
    paid: "Paid",
    avgCheck: "Avg. check",
    bookings: "bookings",
    tourists: "tourists",
    expenses: "Expenses",
    debt: "To collect",
    paxInBooking: "pax per booking",
    financeEyebrow: "Finance",
    financeTitle: "Month Money",
    chartTitle: "Revenue and expenses by day",
    peakDay: "Peak",
    days: "days",
    revenueBars: "revenue",
    expenseBars: "expenses",
    collected: "Collected",
    margin: "Margin",
    exactPrices: "Booking revenue",
    estimatedPrices: "Open payments",
    refunds: "Refunds",
    fromBookingPrices: "Final value of sold bookings",
    missingPriceBookings: (n) => `${n} bookings not fully paid`,
    minusPayments: "Reduces period revenue",
    dayDetails: "Month days",
    riskEyebrow: "Control",
    riskTitle: "What to check",
    paidShort: "paid",
    partialShort: "partial",
    unpaidShort: "unpaid",
    managersTitle: "Managers",
    managersEyebrow: "",
    salesLeader: "Sales leader",
    noManagerSales: "No manager sales in this period.",
    allManagers: "Managers: sales and collection",
    pointsTitle: "Sales Points",
    pointsEyebrow: "Where we sell",
    topPoint: "Top point",
    staff: "staff",
    share: "share",
    noSalesPoints: "No sales by points in this period.",
    pointDetails: "Sales points and online",
    toursTitle: "Tours",
    toursEyebrow: "What earns money",
    toursWithMotion: "With activity",
    topTour: "Top tour",
    load: "Load",
    allToursWithMotion: "Tours with sales or expenses",
    urgentTours: "Tours to check urgently",
    noCriticalTours: "No critical tour signals.",
    guidesTitle: "Tour Guides",
    guidesEyebrow: "Who runs trips",
    noGuides: "No guides assigned in this period.",
    topGuide: "Top guide",
    allGuides: "All guides by trips",
    touristsTitle: "Tourists and Data",
    touristsEyebrow: "Data quality",
    adults: "Adults",
    children: "Children",
    infants: "Infants",
    online: "Online",
    quality: "Quality",
    missingPhone: "No phone",
    missingHotel: "no hotel",
    soloPairs: "Solo/pairs",
    familiesGroups: "Families/groups",
    topHotels: "Top hotels by revenue",
    noHotels: "Hotels are not filled for this period.",
    debtsByBookings: "To collect by booking",
    noDebts: "Nothing to collect by booking.",
    pricesAndQuality: "Booking and data reconciliation",
    allExactPrices: "All bookings have filled prices.",
    fallbackWarning: "Price needs review",
    open: "open",
    rows: "rows",
    points: "points",
    guides: "guides",
    noAssignments: "no assignments",
    date: "Date",
    tour: "Tour",
    guide: "Guide",
    role: "Role",
    point: "Point",
    employee: "Employee",
    manager: "Manager",
    reason: "Reason",
    total: "Total",
    issue: "Issue",
    estimate: "Estimate",
    trips: "Trips",
    average: "Average",
    turnover: "Turnover",
    check: "Check",
    noData: "no data",
    seats: "seats",
    mainFlow: "Main flow",
    noChildren: "Booking type without children",
    debtIn: "To collect in",
    dataIssueSignals: "signals",
  },
  vi: {
    brand: "Центр Туризма",
    title: "Công ty",
    subtitle: (period) => period,
    prevMonth: "Tháng trước",
    nextMonth: "Tháng sau",
    periodLabel: "Kỳ",
    revenue: "Doanh thu",
    profit: "Lợi nhuận",
    paid: "Đã thu",
    avgCheck: "TB/booking",
    bookings: "booking",
    tourists: "khách",
    expenses: "Chi phí",
    debt: "Cần thu",
    paxInBooking: "khách/booking",
    financeEyebrow: "Tài chính",
    financeTitle: "Tiền trong tháng",
    chartTitle: "Doanh thu và chi phí theo ngày",
    peakDay: "Đỉnh",
    days: "ngày",
    revenueBars: "doanh thu",
    expenseBars: "chi phí",
    collected: "Đã thu",
    margin: "Biên LN",
    exactPrices: "Doanh thu booking",
    estimatedPrices: "Thanh toán mở",
    refunds: "Hoàn tiền",
    fromBookingPrices: "Tổng giá trị booking đã bán",
    missingPriceBookings: (n) => `${n} booking chưa thu đủ`,
    minusPayments: "Giảm doanh thu kỳ này",
    dayDetails: "Ngày trong tháng",
    riskEyebrow: "Kiểm soát",
    riskTitle: "Cần kiểm tra",
    paidShort: "đã thu",
    partialShort: "một phần",
    unpaidShort: "chưa thu",
    managersTitle: "Quản lý",
    managersEyebrow: "",
    salesLeader: "Bán tốt nhất",
    noManagerSales: "Không có doanh số quản lý trong kỳ.",
    allManagers: "Quản lý: bán hàng và thu tiền",
    pointsTitle: "Điểm bán",
    pointsEyebrow: "Bán ở đâu",
    topPoint: "Điểm top",
    staff: "NV",
    share: "tỷ lệ",
    noSalesPoints: "Không có doanh số theo điểm trong kỳ.",
    pointDetails: "Điểm bán và online",
    toursTitle: "Tour",
    toursEyebrow: "Nguồn doanh thu",
    toursWithMotion: "Có phát sinh",
    topTour: "Tour top",
    load: "Lấp đầy",
    allToursWithMotion: "Tour có doanh thu hoặc chi phí",
    urgentTours: "Tour cần kiểm tra gấp",
    noCriticalTours: "Không có tín hiệu tour nghiêm trọng.",
    guidesTitle: "HDV",
    guidesEyebrow: "Ai dẫn tour",
    noGuides: "Chưa có HDV trong kỳ.",
    topGuide: "HDV top",
    allGuides: "Tất cả HDV theo chuyến",
    touristsTitle: "Khách và dữ liệu",
    touristsEyebrow: "Chất lượng dữ liệu",
    adults: "Người lớn",
    children: "Trẻ em",
    infants: "Em bé",
    online: "Online",
    quality: "Chất lượng",
    missingPhone: "Thiếu SĐT",
    missingHotel: "thiếu KS",
    soloPairs: "Solo/cặp",
    familiesGroups: "Gia đình/nhóm",
    topHotels: "Khách sạn top theo doanh thu",
    noHotels: "Booking trong kỳ chưa có khách sạn.",
    debtsByBookings: "Cần thu theo booking",
    noDebts: "Không còn khoản cần thu theo booking.",
    pricesAndQuality: "Đối soát booking và dữ liệu",
    allExactPrices: "Tất cả booking đã có giá.",
    fallbackWarning: "Cần kiểm tra giá",
    open: "mở",
    rows: "dòng",
    points: "điểm",
    guides: "HDV",
    noAssignments: "chưa gán",
    date: "Ngày",
    tour: "Tour",
    guide: "HDV",
    role: "Vai trò",
    point: "Điểm",
    employee: "Nhân viên",
    manager: "Quản lý",
    reason: "Lý do",
    total: "Tổng",
    issue: "Vấn đề",
    estimate: "Ước tính",
    trips: "Chuyến",
    average: "Trung bình",
    turnover: "Doanh số",
    check: "Kiểm tra",
    noData: "chưa có dữ liệu",
    seats: "chỗ",
    mainFlow: "Luồng chính",
    noChildren: "Loại booking không trẻ em",
    debtIn: "Cần thu trong",
    dataIssueSignals: "tín hiệu",
  },
};

function companyLocale(raw: string): CompanyLocale {
  return raw === "en" || raw === "vi" ? raw : "ru";
}

function compactVnd(value: number, locale: CompanyLocale = "ru"): string {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const numberLocale = locale === "en" ? "en-US" : locale === "vi" ? "vi-VN" : "ru-RU";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString(numberLocale, { maximumFractionDigits: 1 })}B đ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString(numberLocale, { maximumFractionDigits: 1 })}M đ`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString(numberLocale, { maximumFractionDigits: 0 })}K đ`;
  return `${n.toLocaleString(numberLocale)} đ`;
}

function pct(value: number): string {
  return `${Math.round(Number(value) || 0)}%`;
}

function monthTitle(month: string, locale: CompanyLocale): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, month1] = month.split("-").map(Number);
  const localeName = locale === "en" ? "en-US" : locale === "vi" ? "vi-VN" : "ru-RU";
  return new Date(year, month1 - 1, 1).toLocaleDateString(localeName, { month: "short", year: "numeric" });
}

function roleName(role: string, locale: CompanyLocale): string {
  return roleLabel(role, locale);
}

function moneyTone(value: number): string {
  if (value < 0) return "text-rose-600";
  if (value === 0) return "text-[var(--muted)]";
  return "text-[var(--success)]";
}

function shortDateLabel(dateYmd: string, locale: CompanyLocale): string {
  const [, month, day] = dateYmd.split("-");
  if (!month || !day) return dateYmd;
  return locale === "en" ? `${month}/${day}` : `${day}.${month}`;
}

function MoneyChart({
  rows,
  labels,
  locale,
}: {
  rows: DirectorCompanyDashboard["trend"];
  labels: Pick<ReturnType<typeof companyCopy>, "chartTitle" | "revenueBars" | "expenseBars" | "peakDay">;
  locale: CompanyLocale;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenueVnd, r.expenseVnd)));
  const activeRows = rows.filter((r) => r.revenueVnd > 0 || r.expenseVnd > 0);
  const topDays = [...activeRows].sort((a, b) => b.revenueVnd - a.revenueVnd).slice(0, 4);
  const peak = topDays[0];
  const width = 360;
  const height = 150;
  const padX = 12;
  const padBottom = 24;
  const chartHeight = height - padBottom - 14;
  const slot = rows.length > 0 ? (width - padX * 2) / rows.length : width;
  const barW = Math.max(4, Math.min(14, slot * 0.45));
  const baseY = height - padBottom;
  const revenuePoints = rows.map((r, i) => {
    const x = padX + slot * i + slot / 2;
    const y = baseY - Math.max(2, (r.revenueVnd / max) * chartHeight);
    return { x, y, row: r };
  });
  const linePath = revenuePoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = revenuePoints.length > 0
    ? `${linePath} L${revenuePoints[revenuePoints.length - 1].x.toFixed(1)} ${baseY} L${revenuePoints[0].x.toFixed(1)} ${baseY} Z`
    : "";
  return (
    <div className="company-chart rounded-[22px] border border-[var(--border)] bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-soft)_100%)] p-4 shadow-[var(--shadow-md)] ring-1 ring-white/45 dark:ring-white/[0.04]">
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold text-[var(--text)]">{labels.chartTitle}</div>
        </div>
        {peak ? (
          <div className="shrink-0 rounded-[14px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-right">
            <div className="text-[10px] font-extrabold uppercase text-[var(--muted2)]">{labels.peakDay}</div>
            <div className="text-[13px] font-extrabold text-[var(--text)]">{shortDateLabel(peak.dateYmd, locale)} · {compactVnd(peak.revenueVnd, locale)}</div>
          </div>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[184px] w-full" role="img" aria-label={labels.chartTitle}>
        <defs>
          <linearGradient id="companyRevenueArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="companyRevenueLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="55%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <path d={`M${padX} 18H${width - padX}`} stroke="var(--border)" strokeWidth="1" opacity="0.55" />
        <path d={`M${padX} 58H${width - padX}`} stroke="var(--border)" strokeWidth="1" opacity="0.55" />
        <path d={`M${padX} 98H${width - padX}`} stroke="var(--border)" strokeWidth="1" opacity="0.55" />
        <path d={`M${padX} ${baseY}H${width - padX}`} stroke="var(--border)" strokeWidth="1.2" />
        {areaPath ? <path d={areaPath} fill="url(#companyRevenueArea)" /> : null}
        {rows.map((r, i) => {
          const center = padX + slot * i + slot / 2;
          const revenueH = Math.max(2, (r.revenueVnd / max) * chartHeight);
          const expenseH = r.expenseVnd > 0 ? Math.max(2, (r.expenseVnd / max) * chartHeight) : 0;
          const day = Number(r.dateYmd.slice(8, 10));
          const nearLast = rows.length - i <= 2;
          const showLabel = i === 0 || i === rows.length - 1 || (!nearLast && day % 5 === 0) || (r.dateYmd === peak?.dateYmd && !nearLast);
          return (
            <g key={r.dateYmd}>
              <rect
                x={center - barW - 1}
                y={height - padBottom - revenueH}
                width={barW}
                height={revenueH}
                rx="4"
                fill="var(--accent)"
              />
              {expenseH > 0 ? (
                <rect
                  x={center + 1}
                  y={height - padBottom - expenseH}
                  width={barW}
                  height={expenseH}
                  rx="4"
                  fill="var(--danger)"
                  opacity="0.82"
                />
              ) : null}
              {showLabel ? (
                <text x={center} y={height - 6} textAnchor="middle" className="fill-[var(--muted2)] text-[9px] font-bold">
                  {shortDateLabel(r.dateYmd, locale)}
                </text>
              ) : null}
            </g>
          );
        })}
        {linePath ? <path d={linePath} fill="none" stroke="url(#companyRevenueLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {revenuePoints.map((point) => point.row.dateYmd === peak?.dateYmd ? (
          <g key={`peak-${point.row.dateYmd}`}>
            <circle cx={point.x} cy={point.y} r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="3" />
            <circle cx={point.x} cy={point.y} r="2" fill="var(--accent)" />
          </g>
        ) : null)}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />{labels.revenueBars}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--danger)]" />{labels.expenseBars}</span>
      </div>
      {topDays.length > 0 ? (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-4">
          {topDays.map((day) => (
            <div key={day.dateYmd} className="min-w-0 rounded-[12px] bg-[var(--surface)] px-2.5 py-2 ring-1 ring-[var(--border)]">
              <div className="truncate text-[10px] font-extrabold text-[var(--muted2)]">{shortDateLabel(day.dateYmd, locale)}</div>
              <div className="mt-0.5 truncate text-[12px] font-extrabold tabular-nums text-[var(--text)]">{compactVnd(day.revenueVnd, locale)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function companyCopy(locale: CompanyLocale) {
  return COMPANY_TEXT[locale];
}

const FOCUS_COPY: Record<CompanyLocale, {
  money: string;
  sales: string;
  operations: string;
  clients: string;
  moneyGood: string;
  moneyWarn: string;
  moneyBad: string;
  salesGood: string;
  salesWarn: string;
  opsGood: string;
  opsWarn: string;
  clientsGood: string;
  clientsWarn: string;
  leader: string;
  topPoint: string;
  activeTours: string;
  riskTours: string;
  missingData: string;
}> = {
  ru: {
    money: "Деньги",
    sales: "Продажи",
    operations: "Туры",
    clients: "Сверка денег",
    moneyGood: "Прибыль, сборы и расходы в норме по выбранному периоду.",
    moneyWarn: "Есть отклонения по сборам или марже.",
    moneyBad: "Расходы выше выручки по выбранному периоду.",
    salesGood: "Продажи распределены между менеджерами и точками.",
    salesWarn: "Большая доля продаж сосредоточена у одного менеджера или канала.",
    opsGood: "Загрузка и финансовые отклонения по турам в норме.",
    opsWarn: "Есть туры с отклонениями по загрузке, прибыли или сбору.",
    clientsGood: "Оплаты, возвраты и остатки сходятся по периоду.",
    clientsWarn: "Есть незакрытые оплаты, возвраты или суммы к сбору.",
    leader: "Лидер",
    topPoint: "Точка",
    activeTours: "Активных туров",
    riskTours: "Отклонения",
    missingData: "Сигналы",
  },
  en: {
    money: "Money",
    sales: "Sales",
    operations: "Tours",
    clients: "Money check",
    moneyGood: "Profit, collection and costs are normal for the selected period.",
    moneyWarn: "There are deviations in collection or margin.",
    moneyBad: "Costs exceed revenue for the selected period.",
    salesGood: "Sales are distributed across managers and points.",
    salesWarn: "A large sales share is concentrated in one manager or channel.",
    opsGood: "Tour load and financial deviations are normal.",
    opsWarn: "Some tours have deviations in load, profit or collection.",
    clientsGood: "Payments, refunds and balances match for the period.",
    clientsWarn: "Open payments, refunds or collection balances exist.",
    leader: "Leader",
    topPoint: "Point",
    activeTours: "Active tours",
    riskTours: "Deviations",
    missingData: "Signals",
  },
  vi: {
    money: "Tiền",
    sales: "Bán hàng",
    operations: "Tour",
    clients: "Đối soát tiền",
    moneyGood: "Lợi nhuận, thu tiền và chi phí bình thường trong kỳ.",
    moneyWarn: "Có sai lệch về khoản thu hoặc biên lợi nhuận.",
    moneyBad: "Chi phí cao hơn doanh thu trong kỳ.",
    salesGood: "Doanh số được phân bổ giữa quản lý và điểm bán.",
    salesWarn: "Doanh số tập trung nhiều vào một người hoặc kênh.",
    opsGood: "Tải tour và sai lệch tài chính ở mức bình thường.",
    opsWarn: "Một số tour có sai lệch về tải, lợi nhuận hoặc khoản thu.",
    clientsGood: "Thanh toán, hoàn tiền và số dư khớp trong kỳ.",
    clientsWarn: "Có thanh toán mở, hoàn tiền hoặc khoản cần thu.",
    leader: "Dẫn đầu",
    topPoint: "Điểm",
    activeTours: "Tour hoạt động",
    riskTours: "Sai lệch",
    missingData: "Tín hiệu",
  },
};

function Ring({ value, label, sub, tone = "green" }: { value: number; label: string; sub: string; tone?: "green" | "blue" | "amber" }) {
  const color = tone === "blue" ? "#0ea5e9" : tone === "amber" ? "var(--warn)" : "var(--accent)";
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${clampUi(value)}%, var(--surface-elevated) 0)` }}
      >
        <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface)] text-[12px] font-bold text-[var(--text)]">{pct(value)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-[var(--text)]">{label}</div>
        <div className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{sub}</div>
      </div>
    </div>
  );
}

function clampUi(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-[13px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="text-[10px] font-bold uppercase text-[var(--muted2)]">{label}</div>
      <div className={`mt-1 truncate text-[16px] font-extrabold text-[var(--text)] ${tone || ""}`}>{value}</div>
      {sub ? <div className="mt-1 text-[10.5px] leading-snug text-[var(--muted)]">{sub}</div> : null}
    </div>
  );
}

function FinanceCheckRow({
  items,
}: {
  items: Array<{ label: string; value: string; sub: string; tone?: "green" | "blue" | "amber" | "red" }>;
}) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const dot =
          item.tone === "red"
            ? "bg-[var(--danger)]"
            : item.tone === "amber"
              ? "bg-[var(--warn)]"
              : item.tone === "blue"
                ? "bg-sky-500"
                : "bg-[var(--accent)]";
        const valueTone =
          item.tone === "red"
            ? "text-[var(--danger)]"
            : item.tone === "amber"
              ? "text-[var(--warn)]"
              : item.tone === "blue"
                ? "text-sky-700 dark:text-sky-300"
                : "text-[var(--text)]";
        return (
          <div key={item.label} className="flex min-w-0 items-center gap-2.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted2)]">{item.label}</span>
                <span className={`shrink-0 text-[13px] font-extrabold tabular-nums ${valueTone}`}>{item.value}</span>
              </div>
              <div className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--muted)]">{item.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DirectorFocus({
  cards,
}: {
  cards: Array<{
    title: string;
    value: string;
    verdict: string;
    facts: string[];
    tone: "green" | "amber" | "red" | "blue";
  }>;
}) {
  return (
    <div className="grid gap-3">
      {cards.map((card) => (
        <DirectorFocusCard key={card.title} card={card} />
      ))}
    </div>
  );
}

function DirectorFocusCard({
  card,
}: {
  card: {
    title: string;
    value: string;
    verdict: string;
    facts: string[];
    tone: "green" | "amber" | "red" | "blue";
  };
}) {
  const toneClass =
    card.tone === "red"
      ? "bg-red-500"
      : card.tone === "amber"
        ? "bg-[var(--warn)]"
        : card.tone === "blue"
          ? "bg-sky-500"
          : "bg-[var(--accent)]";
  const valueClass =
    card.tone === "red"
      ? "text-red-700 dark:text-red-300"
      : card.tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : card.tone === "blue"
          ? "text-sky-700 dark:text-sky-300"
          : "text-[var(--text)]";
  const glow =
    card.tone === "red"
      ? "rgba(239,68,68,0.16)"
      : card.tone === "amber"
        ? "rgba(245,158,11,0.18)"
        : card.tone === "blue"
          ? "rgba(14,165,233,0.16)"
          : "rgba(134,202,0,0.18)";
  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-md)] ring-1 ring-white/45 dark:ring-white/[0.04]"
      style={{ background: `linear-gradient(135deg, var(--surface) 0%, var(--surface) 58%, ${glow} 100%)` }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${toneClass}`} />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-8 w-1.5 shrink-0 rounded-full ${toneClass}`} />
            <div>
              <div className="truncate text-[13px] font-extrabold text-[var(--text)]">{card.title}</div>
            </div>
          </div>
          <div className="mt-2 text-[12px] font-bold leading-snug text-[var(--text)]">{card.verdict}</div>
        </div>
        <div className={`shrink-0 rounded-[14px] bg-[var(--surface)] px-3 py-2 text-right text-[15px] font-extrabold tabular-nums shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)] ${valueClass}`}>
          {card.value}
        </div>
      </div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {card.facts.map((fact) => (
          <div key={fact} className="min-w-0 rounded-[11px] bg-[var(--surface-soft)] px-2.5 py-2 text-[10.5px] font-bold leading-snug text-[var(--muted)] ring-1 ring-[var(--border)]">
            {fact}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutiveMetric({ label, value, sub, tone = "default" }: { label: string; value: string; sub: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const accent =
    tone === "good" ? "bg-[var(--success)]" : tone === "warn" ? "bg-[var(--warn)]" : tone === "bad" ? "bg-[var(--danger)]" : "bg-[var(--accent)]";
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]/90 p-3 shadow-[var(--shadow-sm)]">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted2)]">{label}</div>
      <div className="mt-2 truncate text-[18px] font-extrabold leading-none text-[var(--text)]">{value}</div>
      <div className="mt-2 min-h-[28px] text-[10.5px] font-semibold leading-snug text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  sub,
  percent,
  tone = "green",
}: {
  label: string;
  value: string;
  sub: string;
  percent: number;
  tone?: "green" | "blue" | "amber" | "red";
}) {
  const color =
    tone === "blue" ? "bg-sky-500" : tone === "amber" ? "bg-[var(--warn)]" : tone === "red" ? "bg-[var(--danger)]" : "bg-[var(--accent)]";
  return (
    <div className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-[var(--text)]">{label}</div>
          <div className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{sub}</div>
        </div>
        <div className="shrink-0 text-right text-[13px] font-extrabold text-[var(--text)]">{value}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clampUi(percent)}%` }} />
      </div>
    </div>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)] md:p-5">
      <div className="mb-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="text-[10px] font-extrabold uppercase text-[var(--accent-dark)]">{eyebrow}</div> : null}
          <h2 className={`${eyebrow ? "mt-1" : ""} truncate text-[18px] font-extrabold text-[var(--text)]`}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function DetailPanel({
  title,
  summary,
  children,
  open = false,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group mt-4 min-w-0 overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface-soft)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-[13px] font-extrabold text-[var(--text)]">
        <span className="min-w-0 truncate">{title}</span>
        <span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted)] group-open:bg-[var(--accent)] group-open:text-white">
          {summary}
        </span>
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">{children}</div>
    </details>
  );
}

function DetailTable({
  headers,
  children,
  minWidth = 720,
  mobile,
}: {
  headers: string[];
  children: React.ReactNode;
  minWidth?: number;
  mobile?: React.ReactNode;
}) {
  return (
    <>
      {mobile ? <div className="grid gap-2 md:hidden">{mobile}</div> : null}
    <div className={`${mobile ? "hidden md:block" : ""} min-w-0 overflow-x-auto rounded-[12px] border border-[var(--border)]`}>
      <table className="w-full border-collapse bg-[var(--surface)] text-left text-[12px]" style={{ minWidth }}>
        <thead className="bg-[var(--surface-soft)] text-[10px] font-extrabold uppercase text-[var(--muted2)]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="border-b border-[var(--border)] px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
    </>
  );
}

function CellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-extrabold text-[var(--text)] underline decoration-[var(--accent)]/60 underline-offset-4">
      {children}
    </Link>
  );
}

function MobileDetailCard({
  title,
  href,
  meta,
  stats,
  warning,
}: {
  title: string;
  href?: string;
  meta?: string;
  stats: Array<{ label: string; value: string; tone?: "green" | "red" | "amber" | "blue" }>;
  warning?: string;
}) {
  return (
    <div className="min-w-0 rounded-[13px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="min-w-0">
        {href ? <CellLink href={href}>{title}</CellLink> : <div className="font-extrabold text-[var(--text)]">{title}</div>}
        {meta ? <div className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{meta}</div> : null}
        {warning ? <div className="mt-2 rounded-[10px] bg-[var(--warn-soft)] px-2 py-1 text-[11px] font-bold text-[var(--warn)]">{warning}</div> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={`${s.label}-${s.value}`} className="rounded-[10px] bg-[var(--surface-soft)] px-2 py-2">
            <div className="text-[9px] font-extrabold uppercase text-[var(--muted2)]">{s.label}</div>
            <div
              className={`mt-0.5 truncate text-[13px] font-extrabold ${
                s.tone === "green"
                  ? "text-[var(--success)]"
                  : s.tone === "red"
                    ? "text-[var(--danger)]"
                    : s.tone === "amber"
                      ? "text-[var(--warn)]"
                      : s.tone === "blue"
                        ? "text-sky-700"
                        : "text-[var(--text)]"
              }`}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<CompanySearchParams>;
}) {
  const user = await requireAuth();
  if (user.role !== "director") redirect("/dashboard");
  const locale = companyLocale(await getLocale());
  const t = companyCopy(locale);
  const vnd = (value: number) => compactVnd(value, locale);
  const rLabel = (role: string) => roleName(role, locale);
  const lTour = (name: string | null | undefined) => localizeTourName(String(name || ""), locale);

  const sp = await searchParams;
  const rawMonth = pickFirst(sp.month);
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : "";
  const data = await getDirectorCompanyDashboard(month);
  const f = data.finance;
  const paidPct = f.revenueVnd > 0 ? (f.paidVnd / f.revenueVnd) * 100 : 0;
  const duePct = f.revenueVnd > 0 ? (f.dueVnd / f.revenueVnd) * 100 : 0;
  const bestManager = data.managers[0];
  const bestPoint = data.salesPoints[0];
  const toursWithMotion = data.tours.filter((t) => t.bookings > 0 || t.tourists > 0 || t.revenueVnd > 0 || t.expenseVnd > 0);
  const bestTour = toursWithMotion[0];
  const bestGuide = data.guides[0];
  const managerRows = bestManager ? data.managers.filter((m) => m.managerId !== bestManager.managerId) : data.managers;
  const pointRows = bestPoint ? data.salesPoints.filter((p) => p.pointId !== bestPoint.pointId) : data.salesPoints;
  const tourRows = bestTour ? toursWithMotion.filter((tour) => tour.tourId !== bestTour.tourId) : toursWithMotion;
  const prevMonthTitle = monthTitle(data.period.prevMonth, locale);
  const currentMonthTitle = monthTitle(data.period.month, locale);
  const nextMonthTitle = monthTitle(data.period.nextMonth, locale);
  const focus = FOCUS_COPY[locale];
  const lowMargin = f.revenueVnd > 0 && f.marginPct < 20;
  const negativeProfit = f.profitVnd < 0;
  const paymentNeedsAction = f.dueVnd > 0 || f.partialBookings > 0 || f.unpaidBookings > 0;
  const weakToursCount = data.investigations.weakTours.length;
  const guideTripTotal = data.guides.reduce((sum, g) => sum + g.trips, 0);
  const guideTouristTotal = data.guides.reduce((sum, g) => sum + g.tourists, 0);
  const guideAvgGroup = guideTripTotal > 0 ? Math.round((guideTouristTotal / guideTripTotal) * 10) / 10 : 0;
  const pricedLoadTours = toursWithMotion.filter((tour) => tour.capacity > 0);
  const avgLoadPct = pricedLoadTours.length > 0 ? Math.round(pricedLoadTours.reduce((sum, tour) => sum + tour.loadPct, 0) / pricedLoadTours.length) : 0;
  const negativeTourCount = toursWithMotion.filter((tour) => tour.profitVnd < 0).length;
  const lowLoadTourCount = toursWithMotion.filter((tour) => tour.capacity > 0 && tour.loadPct < 35).length;
  const collectionTourCount = toursWithMotion.filter((tour) => tour.dueVnd > 0).length;
  const noRevenueExpenseTourCount = toursWithMotion.filter((tour) => tour.revenueVnd === 0 && tour.expenseVnd > 0).length;
  const operationsNeedsAction = negativeTourCount > 0 || lowLoadTourCount > 0 || collectionTourCount > 0 || noRevenueExpenseTourCount > 0;
  const salesConcentration = bestManager && f.revenueVnd > 0 ? Math.round((bestManager.revenueVnd / f.revenueVnd) * 100) : 0;
  const openPaymentBookings = f.partialBookings + f.unpaidBookings;
  const reconciliationSignals = openPaymentBookings + (f.refundVnd > 0 ? 1 : 0) + collectionTourCount;
  const reconciliationNeedsAction = reconciliationSignals > 0;

  return (
    <main className="company-dashboard mx-auto w-full max-w-[1180px] px-3 pb-[92px] pt-3 sm:px-4 md:pb-8">
      <TopNav user={user} />

      <div className="mb-4 overflow-hidden rounded-[26px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_45%,var(--accent-soft)_100%)] p-4 shadow-[var(--shadow-lg)] ring-1 ring-white/40 md:p-5 dark:ring-white/[0.04]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent-dark)]">
              {t.brand}
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-[var(--text)] sm:text-[36px]">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-[14px] font-bold leading-relaxed text-[var(--muted)]">
              {t.subtitle(data.period.title)}
            </p>
          </div>
          <div className="w-full shrink-0 rounded-[24px] border border-[var(--border)] bg-[var(--surface)]/90 p-3 shadow-[var(--shadow-lg)] ring-1 ring-white/50 backdrop-blur sm:w-[430px] dark:ring-white/[0.05]">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/company?month=${data.period.prevMonth}`}
                className="group grid h-12 w-12 shrink-0 place-items-center rounded-[17px] border border-[var(--border)] bg-[var(--surface-soft)] text-[18px] font-extrabold text-[var(--muted)] shadow-[var(--shadow-sm)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] active:scale-[0.98]"
                aria-label={t.prevMonth}
                title={prevMonthTitle}
              >
                ‹
              </Link>
              <div className="min-w-0 flex-1 text-center">
                <div className="mx-auto inline-flex rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-dark)]">
                  {t.periodLabel}
                </div>
                <div className="mt-2 truncate text-[22px] font-black leading-none text-[var(--text)]">{currentMonthTitle}</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] font-extrabold text-[var(--muted)]">
                  <Link
                    href={`/company?month=${data.period.prevMonth}`}
                    className="truncate rounded-full bg-[var(--surface-soft)] px-2 py-1.5 transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]"
                    title={prevMonthTitle}
                  >
                    {prevMonthTitle}
                  </Link>
                  <Link
                    href={`/company?month=${data.period.nextMonth}`}
                    className="truncate rounded-full bg-[var(--surface-soft)] px-2 py-1.5 transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]"
                    title={nextMonthTitle}
                  >
                    {nextMonthTitle}
                  </Link>
                </div>
              </div>
              <Link
                href={`/company?month=${data.period.nextMonth}`}
                className="group grid h-12 w-12 shrink-0 place-items-center rounded-[17px] border border-[var(--border)] bg-[var(--surface-soft)] text-[18px] font-extrabold text-[var(--muted)] shadow-[var(--shadow-sm)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)] active:scale-[0.98]"
                aria-label={t.nextMonth}
                title={nextMonthTitle}
              >
                ›
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ExecutiveMetric label={t.revenue} value={vnd(f.revenueVnd)} sub={`${f.bookingsCount} ${t.bookings} · ${f.touristsCount} ${t.tourists}`} tone="default" />
          <ExecutiveMetric label={t.profit} value={vnd(f.profitVnd)} sub={`${t.expenses} ${vnd(f.expenseVnd)}`} tone={f.profitVnd < 0 ? "bad" : "good"} />
          <ExecutiveMetric label={t.paid} value={vnd(f.paidVnd)} sub={`${t.debt} ${vnd(f.dueVnd)}`} tone={f.dueVnd > 0 ? "warn" : "good"} />
          <ExecutiveMetric label={t.avgCheck} value={vnd(f.avgCheckVnd)} sub={`${f.avgPaxPerBooking} ${t.paxInBooking}`} tone="default" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Section title={t.financeTitle} eyebrow={t.financeEyebrow}>
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <MoneyChart rows={data.trend} labels={t} locale={locale} />
            <div className="grid gap-3">
              <Ring value={paidPct} label={t.collected} sub={formatVnd(f.paidVnd)} />
              <Ring value={Math.max(0, f.marginPct)} label={t.margin} sub={`${t.profit} ${vnd(f.profitVnd)}`} tone="blue" />
              <Ring value={duePct} label={t.debt} sub={`${f.partialBookings + f.unpaidBookings} ${t.bookings}`} tone="amber" />
            </div>
          </div>
          <FinanceCheckRow
            items={[
              { label: t.exactPrices, value: vnd(f.exactRevenueVnd), sub: t.fromBookingPrices, tone: "green" },
              {
                label: t.estimatedPrices,
                value: f.dueVnd > 0 ? vnd(f.dueVnd) : "0",
                sub: t.missingPriceBookings(openPaymentBookings),
                tone: f.dueVnd > 0 ? "amber" : "green",
              },
              {
                label: t.refunds,
                value: f.refundVnd > 0 ? vnd(f.refundVnd) : "0",
                sub: t.minusPayments,
                tone: f.refundVnd > 0 ? "red" : "green",
              },
              { label: t.margin, value: pct(f.marginPct), sub: `${formatVnd(f.revenueVnd)} - ${formatVnd(f.expenseVnd)}`, tone: f.profitVnd < 0 ? "red" : "blue" },
            ]}
          />
          <DetailPanel title={t.dayDetails} summary={`${data.trend.length} ${t.days}`}>
            <DetailTable
              headers={[t.date, t.bookings, t.tourists, t.revenue, t.expenses, t.profit]}
              mobile={data.trend.map((d) => (
                <MobileDetailCard
                  key={d.dateYmd}
                  title={d.dateYmd}
                  stats={[
                    { label: t.bookings, value: String(d.bookings) },
                    { label: t.tourists, value: String(d.tourists) },
                    { label: t.revenue, value: vnd(d.revenueVnd), tone: "green" },
                    { label: t.profit, value: vnd(d.revenueVnd - d.expenseVnd), tone: d.revenueVnd - d.expenseVnd < 0 ? "red" : "green" },
                  ]}
                />
              ))}
            >
              {data.trend.map((d) => (
                <tr key={d.dateYmd}>
                  <td className="px-3 py-2 font-extrabold">{d.dateYmd}</td>
                  <td className="px-3 py-2 font-bold">{d.bookings}</td>
                  <td className="px-3 py-2 font-bold">{d.tourists}</td>
                  <td className="px-3 py-2 font-bold">{vnd(d.revenueVnd)}</td>
                  <td className="px-3 py-2 text-rose-700 font-bold">{vnd(d.expenseVnd)}</td>
                  <td className={`px-3 py-2 font-bold ${moneyTone(d.revenueVnd - d.expenseVnd)}`}>{vnd(d.revenueVnd - d.expenseVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>

        <Section title={t.riskTitle} eyebrow={t.riskEyebrow}>
          <DirectorFocus
            cards={[
              {
                title: focus.money,
                value: vnd(f.profitVnd),
                verdict: negativeProfit ? focus.moneyBad : paymentNeedsAction || lowMargin ? focus.moneyWarn : focus.moneyGood,
                facts: [
                  `${t.margin}: ${pct(f.marginPct)} · ${t.expenses}: ${vnd(f.expenseVnd)}`,
                  `${t.collected}: ${pct(paidPct)} · ${t.debt}: ${vnd(f.dueVnd)}`,
                  `${t.paidShort}: ${f.paidBookings} · ${t.partialShort}: ${f.partialBookings} · ${t.unpaidShort}: ${f.unpaidBookings}`,
                ],
                tone: negativeProfit ? "red" : paymentNeedsAction || lowMargin ? "amber" : "green",
              },
              {
                title: focus.sales,
                value: bestManager ? vnd(bestManager.revenueVnd) : "0",
                verdict: bestManager && salesConcentration > 55 ? focus.salesWarn : focus.salesGood,
                facts: [
                  `${focus.leader}: ${bestManager ? `${bestManager.name} · ${salesConcentration}%` : t.noData}`,
                  `${focus.topPoint}: ${bestPoint ? `${bestPoint.name} · ${pct(bestPoint.sharePct)}` : t.noData}`,
                  `${t.bookings}: ${f.bookingsCount} · ${t.tourists}: ${f.touristsCount}`,
                ],
                tone: bestManager && salesConcentration > 55 ? "amber" : "blue",
              },
              {
                title: focus.operations,
                value: pct(avgLoadPct),
                verdict: operationsNeedsAction ? focus.opsWarn : focus.opsGood,
                facts: [
                  `${focus.activeTours}: ${toursWithMotion.length}`,
                  `${t.profit}: ${negativeTourCount} · ${t.load}: ${lowLoadTourCount}`,
                  `${t.debt}: ${collectionTourCount}`,
                  `${focus.riskTours}: ${weakToursCount} · ${t.expenses}: ${noRevenueExpenseTourCount}`,
                ],
                tone: operationsNeedsAction ? "amber" : "green",
              },
              {
                title: focus.clients,
                value: f.dueVnd > 0 ? vnd(f.dueVnd) : "0",
                verdict: reconciliationNeedsAction ? focus.clientsWarn : focus.clientsGood,
                facts: [
                  `${focus.missingData}: ${reconciliationSignals}`,
                  `${t.partialShort}: ${f.partialBookings} · ${t.unpaidShort}: ${f.unpaidBookings}`,
                  `${t.refunds}: ${vnd(f.refundVnd)} · ${t.debt}: ${collectionTourCount}`,
                ],
                tone: reconciliationNeedsAction ? "amber" : "green",
              },
            ]}
          />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Section title={t.managersTitle} eyebrow={t.managersEyebrow}>
          <div className="grid gap-3">
            {bestManager ? (
              <div className="rounded-[14px] border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent-dark)]">{t.salesLeader}</div>
                    <div className="mt-0.5 truncate text-[16px] font-extrabold text-[var(--text)]">{bestManager.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                      {rLabel(bestManager.role)} · {bestManager.pointName}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[16px] font-extrabold tabular-nums text-[var(--accent-dark)]">{vnd(bestManager.revenueVnd)}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted2)]">{t.revenue}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                  <span>
                    {t.paid}: <b className="font-extrabold tabular-nums text-emerald-700">{vnd(bestManager.paidVnd)}</b>
                  </span>
                  <span>
                    {t.debt}:{" "}
                    <b className={`font-extrabold tabular-nums ${bestManager.dueVnd > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {vnd(bestManager.dueVnd)}
                    </b>
                  </span>
                  <span>
                    {bestManager.bookings} {t.bookings}
                  </span>
                  <span>
                    {bestManager.tourists} {t.tourists}
                  </span>
                </div>
              </div>
            ) : null}
            {managerRows.slice(0, 7).map((m, idx) => (
              <BarRow
                key={m.managerId}
                label={`${idx + 2}. ${m.name}`}
                value={vnd(m.revenueVnd)}
                sub={`${rLabel(m.role)} · ${m.pointName} · ${m.tourists} ${t.tourists} · ${t.debt} ${vnd(m.dueVnd)}`}
                percent={m.sharePct}
                tone={idx === 0 ? "green" : idx < 3 ? "blue" : "amber"}
              />
            ))}
            {data.managers.length === 0 ? <div className="rounded-[14px] bg-[var(--surface-soft)] p-4 text-[13px] text-[var(--muted)]">{t.noManagerSales}</div> : null}
          </div>
          <DetailPanel title={t.allManagers} summary={`${data.managers.length} ${t.rows}`}>
            <DetailTable
              headers={[t.employee, t.role, t.point, t.bookings, t.tourists, t.revenue, t.paid, t.debt]}
              mobile={data.managers.map((m) => (
                <MobileDetailCard
                  key={m.managerId}
                  title={m.name}
                  href={`/team/${m.managerId}`}
                  meta={`${rLabel(m.role)} · ${m.pointName}`}
                  stats={[
                    { label: t.bookings, value: String(m.bookings) },
                    { label: t.tourists, value: String(m.tourists) },
                    { label: t.revenue, value: vnd(m.revenueVnd), tone: "green" },
                    { label: t.debt, value: vnd(m.dueVnd), tone: m.dueVnd > 0 ? "amber" : "green" },
                  ]}
                />
              ))}
            >
              {data.managers.map((m) => (
                <tr key={m.managerId}>
                  <td className="px-3 py-2"><CellLink href={`/team/${m.managerId}`}>{m.name}</CellLink></td>
                  <td className="px-3 py-2 text-[var(--muted)]">{rLabel(m.role)}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{m.pointName}</td>
                  <td className="px-3 py-2 font-bold">{m.bookings}</td>
                  <td className="px-3 py-2 font-bold">{m.tourists}</td>
                  <td className="px-3 py-2 font-bold">{vnd(m.revenueVnd)}</td>
                  <td className="px-3 py-2 text-emerald-700 font-bold">{vnd(m.paidVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{vnd(m.dueVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>

        <Section title={t.pointsTitle} eyebrow={t.pointsEyebrow}>
          <div className="grid gap-3">
            {bestPoint ? (
              <div className="grid gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:grid-cols-[1fr_110px]">
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase text-sky-600">{t.topPoint}</div>
                  <div className="mt-1 truncate text-[21px] font-extrabold text-[var(--text)]">{bestPoint.name}</div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">
                    {bestPoint.staffCount} {t.staff} · {bestPoint.bookings} {t.bookings} · {bestPoint.tourists} {t.tourists}
                  </div>
                </div>
                <div className="rounded-[14px] bg-[var(--surface)] p-3 text-center">
                  <div className="text-[18px] font-extrabold text-[var(--text)]">{pct(bestPoint.sharePct)}</div>
                  <div className="text-[10px] font-bold uppercase text-[var(--muted2)]">{t.share}</div>
                </div>
              </div>
            ) : null}
            {pointRows.slice(0, 7).map((p, idx) => (
              <BarRow
                key={p.pointId}
                label={`${idx + 2}. ${p.name}`}
                value={vnd(p.revenueVnd)}
                sub={`${p.staffCount} ${t.staff} · ${p.bookings} ${t.bookings} · ${t.debt} ${vnd(p.dueVnd)} · ${p.managerNames.slice(0, 3).join(", ") || t.noAssignments}`}
                percent={p.sharePct}
                tone={p.pointId === "online" ? "blue" : "green"}
              />
            ))}
            {data.salesPoints.length === 0 ? <div className="rounded-[14px] bg-[var(--surface-soft)] p-4 text-[13px] text-[var(--muted)]">{t.noSalesPoints}</div> : null}
          </div>
          <DetailPanel title={t.pointDetails} summary={`${data.salesPoints.length} ${t.points}`}>
            <DetailTable
              headers={[t.point, t.staff, t.bookings, t.tourists, t.revenue, t.paid, t.debt, t.managersTitle]}
              minWidth={820}
              mobile={data.salesPoints.map((p) => (
                <MobileDetailCard
                  key={p.pointId}
                  title={p.name}
                  href={p.pointId === "online" ? undefined : `/sales-points/${p.pointId}`}
                  meta={p.managerNames.join(", ") || t.noAssignments}
                  stats={[
                    { label: t.staff, value: String(p.staffCount) },
                    { label: t.bookings, value: String(p.bookings) },
                    { label: t.revenue, value: vnd(p.revenueVnd), tone: "green" },
                    { label: t.debt, value: vnd(p.dueVnd), tone: p.dueVnd > 0 ? "amber" : "green" },
                  ]}
                />
              ))}
            >
              {data.salesPoints.map((p) => (
                <tr key={p.pointId}>
                  <td className="px-3 py-2">
                    {p.pointId === "online" ? <span className="font-extrabold text-[var(--text)]">{p.name}</span> : <CellLink href={`/sales-points/${p.pointId}`}>{p.name}</CellLink>}
                  </td>
                  <td className="px-3 py-2 font-bold">{p.staffCount}</td>
                  <td className="px-3 py-2 font-bold">{p.bookings}</td>
                  <td className="px-3 py-2 font-bold">{p.tourists}</td>
                  <td className="px-3 py-2 font-bold">{vnd(p.revenueVnd)}</td>
                  <td className="px-3 py-2 text-emerald-700 font-bold">{vnd(p.paidVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{vnd(p.dueVnd)}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{p.managerNames.join(", ") || t.noAssignments}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title={t.toursTitle} eyebrow={t.toursEyebrow}>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Metric label={t.toursTitle} value={String(toursWithMotion.length)} sub={data.tours.length > toursWithMotion.length ? `${t.toursWithMotion} · ${data.tours.length}` : t.toursWithMotion} />
            <Metric label={t.topTour} value={bestTour ? vnd(bestTour.revenueVnd) : "0 đ"} sub={bestTour ? lTour(bestTour.name) : t.noData} />
            <Metric label={t.load} value={bestTour ? pct(bestTour.loadPct) : "0%"} sub={bestTour ? `${bestTour.tourists}/${bestTour.capacity || "?"} ${t.seats}` : t.noData} />
          </div>
          <div className="grid gap-3">
            {tourRows.slice(0, 11).map((t, idx) => (
              <BarRow
                key={t.tourId}
                label={`${idx + 2}. ${lTour(t.name)}`}
                value={vnd(t.profitVnd)}
                sub={`${t.dateYmd} · ${t.bookings} ${COMPANY_TEXT[locale].bookings} · ${t.tourists} ${COMPANY_TEXT[locale].tourists} · ${COMPANY_TEXT[locale].revenue} ${vnd(t.revenueVnd)} · ${COMPANY_TEXT[locale].expenses} ${vnd(t.expenseVnd)}`}
                percent={t.loadPct || (f.revenueVnd > 0 ? (t.revenueVnd / f.revenueVnd) * 100 : 0)}
                tone={t.profitVnd < 0 ? "red" : idx < 3 ? "green" : "blue"}
              />
            ))}
          </div>
          <DetailPanel title={t.allToursWithMotion} summary={`${toursWithMotion.length} ${t.rows}`}>
            <DetailTable
              headers={[t.tour, t.date, t.bookings, t.tourists, t.load, t.revenue, t.expenses, t.profit, t.debt]}
              minWidth={900}
              mobile={toursWithMotion.map((t) => (
                <MobileDetailCard
                  key={t.tourId}
                  title={lTour(t.name)}
                  href={`/tours/${t.tourId}`}
                  meta={`${t.dateYmd} · ${t.bookings} ${COMPANY_TEXT[locale].bookings} · ${t.tourists} ${COMPANY_TEXT[locale].tourists}`}
                  stats={[
                    { label: COMPANY_TEXT[locale].load, value: t.capacity > 0 ? `${t.loadPct}%` : "-" },
                    { label: COMPANY_TEXT[locale].revenue, value: vnd(t.revenueVnd), tone: "green" },
                    { label: COMPANY_TEXT[locale].profit, value: vnd(t.profitVnd), tone: t.profitVnd < 0 ? "red" : "green" },
                    { label: COMPANY_TEXT[locale].debt, value: vnd(t.dueVnd), tone: t.dueVnd > 0 ? "amber" : "green" },
                  ]}
                />
              ))}
            >
              {toursWithMotion.map((t) => (
                <tr key={t.tourId}>
                  <td className="px-3 py-2"><CellLink href={`/tours/${t.tourId}`}>{lTour(t.name)}</CellLink></td>
                  <td className="px-3 py-2 text-[var(--muted)]">{t.dateYmd}</td>
                  <td className="px-3 py-2 font-bold">{t.bookings}</td>
                  <td className="px-3 py-2 font-bold">{t.tourists}</td>
                  <td className="px-3 py-2 font-bold">{t.capacity > 0 ? `${t.loadPct}%` : "-"}</td>
                  <td className="px-3 py-2 font-bold">{vnd(t.revenueVnd)}</td>
                  <td className="px-3 py-2 text-rose-700 font-bold">{vnd(t.expenseVnd)}</td>
                  <td className={`px-3 py-2 font-bold ${moneyTone(t.profitVnd)}`}>{vnd(t.profitVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{vnd(t.dueVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
          <DetailPanel title={t.urgentTours} summary={`${data.investigations.weakTours.length} ${t.dataIssueSignals}`}>
            {data.investigations.weakTours.length > 0 ? (
              <DetailTable
                headers={[t.tour, t.date, t.reason, t.revenue, t.profit, t.load, t.debt]}
                minWidth={820}
                mobile={data.investigations.weakTours.map((t) => (
                  <MobileDetailCard
                    key={`${t.tourId}-${t.reason}`}
                    title={lTour(t.name)}
                    href={`/tours/${t.tourId}`}
                    meta={t.dateYmd}
                    warning={t.reason}
                    stats={[
                      { label: COMPANY_TEXT[locale].revenue, value: vnd(t.revenueVnd), tone: "green" },
                      { label: COMPANY_TEXT[locale].profit, value: vnd(t.profitVnd), tone: t.profitVnd < 0 ? "red" : "green" },
                      { label: COMPANY_TEXT[locale].load, value: `${t.loadPct}%`, tone: t.loadPct < 35 ? "amber" : "blue" },
                      { label: COMPANY_TEXT[locale].debt, value: vnd(t.dueVnd), tone: t.dueVnd > 0 ? "amber" : "green" },
                    ]}
                  />
                ))}
              >
                {data.investigations.weakTours.map((t) => (
                  <tr key={`${t.tourId}-${t.reason}`}>
                    <td className="px-3 py-2"><CellLink href={`/tours/${t.tourId}`}>{lTour(t.name)}</CellLink></td>
                    <td className="px-3 py-2 text-[var(--muted)]">{t.dateYmd}</td>
                    <td className="px-3 py-2 text-amber-700 font-bold">{t.reason}</td>
                    <td className="px-3 py-2 font-bold">{vnd(t.revenueVnd)}</td>
                    <td className={`px-3 py-2 font-bold ${moneyTone(t.profitVnd)}`}>{vnd(t.profitVnd)}</td>
                    <td className="px-3 py-2 font-bold">{t.loadPct}%</td>
                    <td className="px-3 py-2 text-amber-700 font-bold">{vnd(t.dueVnd)}</td>
                  </tr>
                ))}
              </DetailTable>
            ) : (
              <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">{t.noCriticalTours}</div>
            )}
          </DetailPanel>
        </Section>

        <Section title={t.guidesTitle} eyebrow={t.guidesEyebrow}>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <Metric label={t.guides} value={String(data.guides.length)} sub={t.allGuides} />
            <Metric label={t.trips} value={String(guideTripTotal)} sub={focus.activeTours} />
            <Metric label={t.tourists} value={String(guideTouristTotal)} sub={`${t.average} ${guideAvgGroup}`} />
            <Metric
              label={t.topGuide}
              value={bestGuide ? bestGuide.name : t.noData}
              sub={bestGuide ? `${bestGuide.trips} ${t.trips} · ${bestGuide.tourists} ${t.tourists} · ${t.paid} ${vnd(bestGuide.salaryVnd)}` : t.noGuides}
            />
          </div>
          <div className="grid gap-2">
            {data.guides.slice(0, 10).map((g, idx) => (
              <Link
                key={g.guideId}
                href={`/team/${g.guideId}`}
                className="group min-w-0 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[11px] font-extrabold text-white shadow-[0_8px_18px_rgba(134,202,0,0.28)]">
                        {idx + 1}
                      </span>
                      <div className="truncate text-[14px] font-extrabold text-[var(--text)]">{g.name}</div>
                    </div>
                    <div className="mt-1 truncate text-[11px] font-bold text-[var(--muted)]">
                      {g.trips} {t.trips} · {g.tourists} {t.tourists}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[14px] font-extrabold tabular-nums text-[var(--accent-dark)]">{vnd(g.salaryVnd)}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted2)]">{t.paid}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  {[
                    { label: t.trips, value: String(g.trips) },
                    { label: t.tourists, value: String(g.tourists) },
                    { label: t.average, value: String(g.avgTouristsPerTrip) },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 rounded-[10px] bg-[var(--surface-soft)] px-1.5 py-2">
                      <div className="truncate text-[10.5px] font-extrabold tabular-nums text-[var(--text)]">{item.value}</div>
                      <div className="mt-0.5 truncate text-[8.5px] font-bold uppercase text-[var(--muted2)]">{item.label}</div>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
            {data.guides.length === 0 ? <div className="rounded-[14px] bg-[var(--surface-soft)] p-4 text-[13px] text-[var(--muted)]">{t.noGuides}</div> : null}
          </div>
          <DetailPanel title={t.allGuides} summary={`${data.guides.length} ${t.guides}`}>
            <DetailTable
              headers={[t.guide, t.trips, t.tourists, t.average, t.paid, t.turnover]}
              mobile={data.guides.map((g) => (
                <MobileDetailCard
                  key={g.guideId}
                  title={g.name}
                  href={`/team/${g.guideId}`}
                  stats={[
                    { label: t.trips, value: String(g.trips) },
                    { label: t.tourists, value: String(g.tourists) },
                    { label: t.average, value: String(g.avgTouristsPerTrip) },
                    { label: t.paid, value: vnd(g.salaryVnd), tone: "green" },
                  ]}
                />
              ))}
            >
              {data.guides.map((g) => (
                <tr key={g.guideId}>
                  <td className="px-3 py-2"><CellLink href={`/team/${g.guideId}`}>{g.name}</CellLink></td>
                  <td className="px-3 py-2 font-bold">{g.trips}</td>
                  <td className="px-3 py-2 font-bold">{g.tourists}</td>
                  <td className="px-3 py-2 font-bold">{g.avgTouristsPerTrip}</td>
                  <td className="px-3 py-2 font-bold">{vnd(g.salaryVnd)}</td>
                  <td className="px-3 py-2 font-bold">{vnd(g.revenueVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>
      </div>

      <div className="mt-4">
        <Section title={t.touristsTitle} eyebrow={t.touristsEyebrow}>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label={t.adults} value={String(data.tourists.adults)} sub={t.mainFlow} />
              <Metric label={t.children} value={String(data.tourists.children)} sub={`${t.infants} ${data.tourists.infants}`} />
              <Metric label={t.online} value={String(data.tourists.onlineBookings)} sub={`${t.bookings} online`} />
              <Metric label={t.soloPairs} value={`${data.tourists.soloBookings}/${data.tourists.pairBookings}`} sub={t.noChildren} />
              <Metric label={t.familiesGroups} value={`${data.tourists.familyBookings}/${data.tourists.groupBookings}`} sub={`${t.debtIn} ${data.tourists.debtBookings} ${t.bookings}`} />
            </div>
            <div className="grid gap-3">
              <div className="text-[13px] font-extrabold text-[var(--text)]">{t.topHotels}</div>
              {data.tourists.topHotels.map((h, idx) => (
                <BarRow
                  key={h.name}
                  label={`${idx + 1}. ${h.name}`}
                  value={vnd(h.revenueVnd)}
                  sub={`${h.bookings} ${t.bookings} · ${h.tourists} ${t.tourists}`}
                  percent={f.revenueVnd > 0 ? (h.revenueVnd / f.revenueVnd) * 100 : 0}
                  tone="blue"
                />
              ))}
              {data.tourists.topHotels.length === 0 ? <div className="rounded-[14px] bg-[var(--surface-soft)] p-4 text-[13px] text-[var(--muted)]">{t.noHotels}</div> : null}
            </div>
          </div>
          <DetailPanel title={t.debtsByBookings} summary={`${data.investigations.debtBookings.length} ${t.rows}`} open={data.investigations.debtBookings.length > 0}>
            {data.investigations.debtBookings.length > 0 ? (
              <DetailTable
                headers={[t.bookings, t.tourists, t.tour, t.date, t.manager, t.point, t.total, t.paid, t.debt]}
                minWidth={980}
                mobile={data.investigations.debtBookings.map((b) => (
                  <MobileDetailCard
                    key={b.bookingId}
                    title={`${b.code} · ${b.customerName}`}
                    href={`/tourists/${b.bookingId}`}
                    meta={`${lTour(b.tourName)} · ${b.dateYmd} · ${b.managerName}`}
                    stats={[
                      { label: t.total, value: vnd(b.totalVnd) },
                      { label: t.paid, value: vnd(b.paidVnd), tone: "green" },
                      { label: t.debt, value: vnd(b.dueVnd), tone: "amber" },
                      { label: t.tourists, value: String(b.tourists) },
                    ]}
                  />
                ))}
              >
                {data.investigations.debtBookings.map((b) => (
                  <tr key={b.bookingId}>
                    <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                    <td className="px-3 py-2 font-bold">{b.customerName}</td>
                    <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{lTour(b.tourName)}</CellLink></td>
                    <td className="px-3 py-2 text-[var(--muted)]">{b.dateYmd}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{b.managerName}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{b.pointName}</td>
                    <td className="px-3 py-2 font-bold">{vnd(b.totalVnd)}</td>
                    <td className="px-3 py-2 text-emerald-700 font-bold">{vnd(b.paidVnd)}</td>
                    <td className="px-3 py-2 text-amber-700 font-extrabold">{vnd(b.dueVnd)}</td>
                  </tr>
                ))}
              </DetailTable>
            ) : (
              <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">{t.noDebts}</div>
            )}
          </DetailPanel>
          <DetailPanel title={t.pricesAndQuality} summary={`${data.investigations.dataIssues.length} ${t.dataIssueSignals}`}>
            <div className="grid gap-3">
              {data.investigations.priceFallbackBookings.length > 0 ? (
                <DetailTable
                  headers={[t.bookings, t.tourists, t.tour, t.date, t.manager, t.tourists, t.estimate]}
                  minWidth={820}
                  mobile={data.investigations.priceFallbackBookings.map((b) => (
                    <MobileDetailCard
                      key={b.bookingId}
                      title={`${b.code} · ${b.customerName}`}
                      href={`/tourists/${b.bookingId}`}
                      meta={`${lTour(b.tourName)} · ${b.dateYmd} · ${b.managerName}`}
                      warning={t.fallbackWarning}
                      stats={[
                        { label: t.estimate, value: vnd(b.estimatedVnd), tone: "amber" },
                        { label: t.tourists, value: String(b.tourists) },
                      ]}
                    />
                  ))}
                >
                  {data.investigations.priceFallbackBookings.map((b) => (
                    <tr key={b.bookingId}>
                      <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                      <td className="px-3 py-2 font-bold">{b.customerName}</td>
                      <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{lTour(b.tourName)}</CellLink></td>
                      <td className="px-3 py-2 text-[var(--muted)]">{b.dateYmd}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{b.managerName}</td>
                      <td className="px-3 py-2 font-bold">{b.tourists}</td>
                      <td className="px-3 py-2 text-amber-700 font-bold">{vnd(b.estimatedVnd)}</td>
                    </tr>
                  ))}
                </DetailTable>
              ) : (
                <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">{t.allExactPrices}</div>
              )}
              {data.investigations.dataIssues.length > 0 ? (
                <DetailTable
                  headers={[t.bookings, t.tourists, t.issue, t.tour, t.date, t.manager]}
                  minWidth={820}
                  mobile={data.investigations.dataIssues.map((b) => (
                    <MobileDetailCard
                      key={`${b.bookingId}-${b.issue}`}
                      title={`${b.code} · ${b.customerName}`}
                      href={`/tourists/${b.bookingId}`}
                      meta={`${lTour(b.tourName)} · ${b.dateYmd} · ${b.managerName}`}
                      warning={b.issue}
                      stats={[
                        { label: t.check, value: t.open },
                      ]}
                    />
                  ))}
                >
                  {data.investigations.dataIssues.map((b) => (
                    <tr key={`${b.bookingId}-${b.issue}`}>
                      <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                      <td className="px-3 py-2 font-bold">{b.customerName}</td>
                      <td className="px-3 py-2 text-amber-700 font-bold">{b.issue}</td>
                      <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{lTour(b.tourName)}</CellLink></td>
                      <td className="px-3 py-2 text-[var(--muted)]">{b.dateYmd}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{b.managerName}</td>
                    </tr>
                  ))}
                </DetailTable>
              ) : null}
            </div>
          </DetailPanel>
        </Section>
      </div>
    </main>
  );
}
