import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { requireAuth } from "@/lib/auth-session";
import { formatVnd } from "@/lib/format";
import { getDirectorCompanyDashboard, type DirectorCompanyDashboard } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanySearchParams = {
  month?: string | string[];
};

function pickFirst(v?: string | string[]): string {
  if (!v) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

function compactVnd(value: number): string {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}B đ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}M đ`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}K đ`;
  return `${n.toLocaleString("ru-RU")} đ`;
}

function pct(value: number): string {
  return `${Math.round(Number(value) || 0)}%`;
}

function roleRu(role: string): string {
  if (role === "director") return "директор";
  if (role === "chief_manager") return "ст. менеджер";
  if (role === "manager") return "менеджер";
  return role || "сотрудник";
}

function moneyTone(value: number): string {
  if (value < 0) return "text-rose-600";
  if (value === 0) return "text-[var(--muted)]";
  return "text-emerald-700";
}

function SparkLine({ rows }: { rows: DirectorCompanyDashboard["trend"] }) {
  const values = rows.map((r) => r.revenueVnd);
  const max = Math.max(1, ...values);
  const width = 320;
  const height = 112;
  const points = rows.length
    ? rows
        .map((r, i) => {
          const x = rows.length === 1 ? width / 2 : (i / (rows.length - 1)) * width;
          const y = height - (r.revenueVnd / max) * (height - 18) - 8;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : `0,${height} ${width},${height}`;
  const area = rows.length ? `0,${height} ${points} ${width},${height}` : "";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[138px] w-full" role="img" aria-label="График выручки по дням">
      <defs>
        <linearGradient id="companyLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8fd400" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d="M0 104H320" stroke="#e5e7eb" strokeWidth="1" />
      <path d="M0 68H320" stroke="#eef2f7" strokeWidth="1" />
      <path d="M0 32H320" stroke="#eef2f7" strokeWidth="1" />
      {area ? <polygon points={area} fill="url(#companyLineFill)" /> : null}
      <polyline points={points} fill="none" stroke="#8fd400" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {rows.map((r, i) => {
        const x = rows.length === 1 ? width / 2 : (i / (rows.length - 1)) * width;
        const y = height - (r.revenueVnd / max) * (height - 18) - 8;
        return <circle key={`${r.dateYmd}-${i}`} cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#8fd400" strokeWidth="2" />;
      })}
    </svg>
  );
}

function Ring({ value, label, sub, tone = "green" }: { value: number; label: string; sub: string; tone?: "green" | "blue" | "amber" }) {
  const color = tone === "blue" ? "#0ea5e9" : tone === "amber" ? "#f59e0b" : "#8fd400";
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${clampUi(value)}%, #eef2f7 0)` }}
      >
        <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-[12px] font-bold text-slate-900">{pct(value)}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-slate-900">{label}</div>
        <div className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</div>
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
    <div className="min-w-0 rounded-[14px] border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className={`mt-1 truncate text-[20px] font-black text-slate-950 ${tone || ""}`}>{value}</div>
      {sub ? <div className="mt-1 min-h-[28px] text-[11px] leading-snug text-slate-500">{sub}</div> : null}
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
    tone === "blue" ? "bg-sky-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-rose-500" : "bg-[#8fd400]";
  return (
    <div className="min-w-0 rounded-[12px] border border-slate-200 bg-white p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-slate-900">{label}</div>
          <div className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</div>
        </div>
        <div className="shrink-0 text-right text-[13px] font-black text-slate-950">{value}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clampUi(percent)}%` }} />
      </div>
    </div>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:p-5">
      <div className="mb-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase text-[#7fbf00]">{eyebrow}</div>
          <h2 className="mt-1 truncate text-[22px] font-black text-slate-950">{title}</h2>
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
    <details open={open} className="group mt-4 min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-[13px] font-black text-slate-950">
        <span className="min-w-0 truncate">{title}</span>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 group-open:bg-[#8fd400] group-open:text-white">
          {summary}
        </span>
      </summary>
      <div className="border-t border-slate-200 bg-white p-3">{children}</div>
    </details>
  );
}

function DetailTable({
  headers,
  children,
  minWidth = 720,
}: {
  headers: string[];
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-[12px] border border-slate-200">
      <table className="w-full border-collapse bg-white text-left text-[12px]" style={{ minWidth }}>
        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="border-b border-slate-200 px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function CellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-black text-slate-950 underline decoration-[#8fd400]/50 underline-offset-4">
      {children}
    </Link>
  );
}

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<CompanySearchParams>;
}) {
  const user = await requireAuth();
  if (user.role !== "director") redirect("/dashboard");

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

  return (
    <main className="mx-auto w-full max-w-[1180px] px-3 pb-[92px] pt-3 sm:px-4 md:pb-8">
      <TopNav user={user} />

      <div className="mb-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase text-[#7fbf00]">EcoVoyage</div>
            <h1 className="mt-1 text-[32px] font-black leading-tight text-slate-950 sm:text-[40px]">Моя компания</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-slate-600">
              Полная картина за {data.period.title}: деньги, продажи, точки, туры, гиды и качество базы.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/company?month=${data.period.prevMonth}`} className="btn-secondary min-h-[42px] rounded-[12px] px-3" aria-label="Предыдущий месяц">
              ‹
            </Link>
            <div className="min-w-[154px] rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-2 text-center text-[14px] font-black text-slate-950">
              {data.period.title}
            </div>
            <Link href={`/company?month=${data.period.nextMonth}`} className="btn-secondary min-h-[42px] rounded-[12px] px-3" aria-label="Следующий месяц">
              ›
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Выручка" value={compactVnd(f.revenueVnd)} sub={`${f.bookingsCount} броней · ${f.touristsCount} туристов`} />
          <Metric label="Прибыль" value={compactVnd(f.profitVnd)} sub={`Расходы ${compactVnd(f.expenseVnd)}`} tone={moneyTone(f.profitVnd)} />
          <Metric label="Оплачено" value={compactVnd(f.paidVnd)} sub={`Долг ${compactVnd(f.dueVnd)}`} />
          <Metric label="Средний чек" value={compactVnd(f.avgCheckVnd)} sub={`${f.avgPaxPerBooking} чел. в брони`} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Section title="Деньги и темп" eyebrow="Финансы">
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="min-w-0 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-slate-950">Выручка по датам туров</div>
                  <div className="text-[11px] text-slate-500">Линия показывает, где месяц реально зарабатывает.</div>
                </div>
                <div className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600">{data.trend.length} дней</div>
              </div>
              <SparkLine rows={data.trend} />
            </div>
            <div className="grid gap-3">
              <Ring value={paidPct} label="Собрано" sub={formatVnd(f.paidVnd)} />
              <Ring value={Math.max(0, f.marginPct)} label="Маржа" sub={`Прибыль ${compactVnd(f.profitVnd)}`} tone="blue" />
              <Ring value={duePct} label="Долг" sub={`${f.partialBookings + f.unpaidBookings} броней`} tone="amber" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Точные цены" value={compactVnd(f.exactRevenueVnd)} sub="Из booking_prices" />
            <Metric label="Оценка цены" value={compactVnd(f.estimatedRevenueVnd)} sub={`${f.missingPriceBookings} броней без строки цены`} />
            <Metric label="Возвраты" value={compactVnd(f.refundVnd)} sub="Минус к оплатам" tone="text-rose-600" />
            <Metric label="Маржа" value={pct(f.marginPct)} sub={`${formatVnd(f.revenueVnd)} − ${formatVnd(f.expenseVnd)}`} tone={moneyTone(f.profitVnd)} />
          </div>
          <DetailPanel title="Дни месяца под графиком" summary={`${data.trend.length} дней`}>
            <DetailTable headers={["Дата", "Брони", "Туристы", "Выручка", "Расходы", "Прибыль"]}>
              {data.trend.map((d) => (
                <tr key={d.dateYmd}>
                  <td className="px-3 py-2 font-black">{d.dateYmd}</td>
                  <td className="px-3 py-2 font-bold">{d.bookings}</td>
                  <td className="px-3 py-2 font-bold">{d.tourists}</td>
                  <td className="px-3 py-2 font-bold">{compactVnd(d.revenueVnd)}</td>
                  <td className="px-3 py-2 text-rose-700 font-bold">{compactVnd(d.expenseVnd)}</td>
                  <td className={`px-3 py-2 font-bold ${moneyTone(d.revenueVnd - d.expenseVnd)}`}>{compactVnd(d.revenueVnd - d.expenseVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>

        <Section title="Риски месяца" eyebrow="Контроль">
          <div className="grid gap-3">
            {data.risks.map((r) => (
              <div key={r.title} className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-slate-50 p-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black text-slate-950">{r.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">Показатель для быстрой проверки директором</div>
                </div>
                <div
                  className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-black ${
                    r.tone === "red"
                      ? "bg-rose-50 text-rose-700"
                      : r.tone === "amber"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {r.value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-[16px] border border-slate-200 bg-white p-3 text-center">
            <div>
              <div className="text-[20px] font-black text-emerald-700">{f.paidBookings}</div>
              <div className="text-[10px] font-bold uppercase text-slate-400">оплачено</div>
            </div>
            <div>
              <div className="text-[20px] font-black text-amber-600">{f.partialBookings}</div>
              <div className="text-[10px] font-bold uppercase text-slate-400">частично</div>
            </div>
            <div>
              <div className="text-[20px] font-black text-rose-600">{f.unpaidBookings}</div>
              <div className="text-[10px] font-bold uppercase text-slate-400">не оплачено</div>
            </div>
          </div>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Section title="Менеджеры" eyebrow="Кто продает">
          <div className="grid gap-3">
            {bestManager ? (
              <div className="rounded-[16px] border border-[#cdeb91] bg-[#f7ffe9] p-4">
                <div className="text-[11px] font-black uppercase text-[#7fbf00]">Лидер продаж</div>
                <div className="mt-1 text-[22px] font-black text-slate-950">{bestManager.name}</div>
                <div className="mt-1 text-[12px] text-slate-600">
                  {roleRu(bestManager.role)} · {bestManager.pointName} · {bestManager.bookings} броней
                </div>
              </div>
            ) : null}
            {data.managers.slice(0, 8).map((m, idx) => (
              <BarRow
                key={m.managerId}
                label={`${idx + 1}. ${m.name}`}
                value={compactVnd(m.revenueVnd)}
                sub={`${roleRu(m.role)} · ${m.pointName} · ${m.tourists} чел. · долг ${compactVnd(m.dueVnd)}`}
                percent={m.sharePct}
                tone={idx === 0 ? "green" : idx < 3 ? "blue" : "amber"}
              />
            ))}
            {data.managers.length === 0 ? <div className="rounded-[14px] bg-slate-50 p-4 text-[13px] text-slate-500">За период нет продаж менеджеров.</div> : null}
          </div>
          <DetailPanel title="Все менеджеры и долги" summary={`${data.managers.length} строк`}>
            <DetailTable headers={["Сотрудник", "Роль", "Точка", "Брони", "Туристы", "Выручка", "Оплачено", "Долг"]}>
              {data.managers.map((m) => (
                <tr key={m.managerId}>
                  <td className="px-3 py-2"><CellLink href={`/team/${m.managerId}`}>{m.name}</CellLink></td>
                  <td className="px-3 py-2 text-slate-600">{roleRu(m.role)}</td>
                  <td className="px-3 py-2 text-slate-600">{m.pointName}</td>
                  <td className="px-3 py-2 font-bold">{m.bookings}</td>
                  <td className="px-3 py-2 font-bold">{m.tourists}</td>
                  <td className="px-3 py-2 font-bold">{compactVnd(m.revenueVnd)}</td>
                  <td className="px-3 py-2 text-emerald-700 font-bold">{compactVnd(m.paidVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{compactVnd(m.dueVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>

        <Section title="Точки продаж" eyebrow="Где продаем">
          <div className="grid gap-3">
            {bestPoint ? (
              <div className="grid gap-3 rounded-[16px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_110px]">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase text-sky-600">Топ точка</div>
                  <div className="mt-1 truncate text-[21px] font-black text-slate-950">{bestPoint.name}</div>
                  <div className="mt-1 text-[12px] text-slate-600">
                    {bestPoint.staffCount} сотрудников · {bestPoint.bookings} броней · {bestPoint.tourists} чел.
                  </div>
                </div>
                <div className="rounded-[14px] bg-white p-3 text-center">
                  <div className="text-[22px] font-black text-slate-950">{pct(bestPoint.sharePct)}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">доля</div>
                </div>
              </div>
            ) : null}
            {data.salesPoints.slice(0, 8).map((p, idx) => (
              <BarRow
                key={p.pointId}
                label={`${idx + 1}. ${p.name}`}
                value={compactVnd(p.revenueVnd)}
                sub={`${p.staffCount} сотр. · ${p.bookings} броней · долг ${compactVnd(p.dueVnd)} · ${p.managerNames.slice(0, 3).join(", ") || "без назначений"}`}
                percent={p.sharePct}
                tone={p.pointId === "online" ? "blue" : "green"}
              />
            ))}
            {data.salesPoints.length === 0 ? <div className="rounded-[14px] bg-slate-50 p-4 text-[13px] text-slate-500">Нет продаж по точкам за период.</div> : null}
          </div>
          <DetailPanel title="Разбор по точкам и онлайну" summary={`${data.salesPoints.length} точек`}>
            <DetailTable headers={["Точка", "Сотрудники", "Брони", "Туристы", "Выручка", "Оплачено", "Долг", "Менеджеры"]} minWidth={820}>
              {data.salesPoints.map((p) => (
                <tr key={p.pointId}>
                  <td className="px-3 py-2">
                    {p.pointId === "online" ? <span className="font-black text-slate-950">{p.name}</span> : <CellLink href={`/sales-points/${p.pointId}`}>{p.name}</CellLink>}
                  </td>
                  <td className="px-3 py-2 font-bold">{p.staffCount}</td>
                  <td className="px-3 py-2 font-bold">{p.bookings}</td>
                  <td className="px-3 py-2 font-bold">{p.tourists}</td>
                  <td className="px-3 py-2 font-bold">{compactVnd(p.revenueVnd)}</td>
                  <td className="px-3 py-2 text-emerald-700 font-bold">{compactVnd(p.paidVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{compactVnd(p.dueVnd)}</td>
                  <td className="px-3 py-2 text-slate-600">{p.managerNames.join(", ") || "нет назначений"}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Туры" eyebrow="Что приносит деньги">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Metric label="Туров" value={String(toursWithMotion.length)} sub={data.tours.length > toursWithMotion.length ? `С движением · всего ${data.tours.length}` : "С движением"} />
            <Metric label="Топ тур" value={bestTour ? compactVnd(bestTour.revenueVnd) : "0 đ"} sub={bestTour?.name || "нет данных"} />
            <Metric label="Заполняемость" value={bestTour ? pct(bestTour.loadPct) : "0%"} sub={bestTour ? `${bestTour.tourists}/${bestTour.capacity || "?"} мест` : "нет данных"} />
          </div>
          <div className="grid gap-3">
            {toursWithMotion.slice(0, 12).map((t, idx) => (
              <BarRow
                key={t.tourId}
                label={`${idx + 1}. ${t.name}`}
                value={compactVnd(t.profitVnd)}
                sub={`${t.dateYmd} · ${t.bookings} броней · ${t.tourists} чел. · выручка ${compactVnd(t.revenueVnd)} · расходы ${compactVnd(t.expenseVnd)}`}
                percent={t.loadPct || (f.revenueVnd > 0 ? (t.revenueVnd / f.revenueVnd) * 100 : 0)}
                tone={t.profitVnd < 0 ? "red" : idx < 3 ? "green" : "blue"}
              />
            ))}
          </div>
          <DetailPanel title="Туры с продажами или расходами" summary={`${toursWithMotion.length} строк`}>
            <DetailTable headers={["Тур", "Дата", "Брони", "Туристы", "Загрузка", "Выручка", "Расходы", "Прибыль", "Долг"]} minWidth={900}>
              {toursWithMotion.map((t) => (
                <tr key={t.tourId}>
                  <td className="px-3 py-2"><CellLink href={`/tours/${t.tourId}`}>{t.name}</CellLink></td>
                  <td className="px-3 py-2 text-slate-600">{t.dateYmd}</td>
                  <td className="px-3 py-2 font-bold">{t.bookings}</td>
                  <td className="px-3 py-2 font-bold">{t.tourists}</td>
                  <td className="px-3 py-2 font-bold">{t.capacity > 0 ? `${t.loadPct}%` : "-"}</td>
                  <td className="px-3 py-2 font-bold">{compactVnd(t.revenueVnd)}</td>
                  <td className="px-3 py-2 text-rose-700 font-bold">{compactVnd(t.expenseVnd)}</td>
                  <td className={`px-3 py-2 font-bold ${moneyTone(t.profitVnd)}`}>{compactVnd(t.profitVnd)}</td>
                  <td className="px-3 py-2 text-amber-700 font-bold">{compactVnd(t.dueVnd)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
          <DetailPanel title="Что срочно проверить по турам" summary={`${data.investigations.weakTours.length} сигналов`}>
            {data.investigations.weakTours.length > 0 ? (
              <DetailTable headers={["Тур", "Дата", "Причина", "Выручка", "Прибыль", "Загрузка", "Долг"]} minWidth={820}>
                {data.investigations.weakTours.map((t) => (
                  <tr key={`${t.tourId}-${t.reason}`}>
                    <td className="px-3 py-2"><CellLink href={`/tours/${t.tourId}`}>{t.name}</CellLink></td>
                    <td className="px-3 py-2 text-slate-600">{t.dateYmd}</td>
                    <td className="px-3 py-2 text-amber-700 font-bold">{t.reason}</td>
                    <td className="px-3 py-2 font-bold">{compactVnd(t.revenueVnd)}</td>
                    <td className={`px-3 py-2 font-bold ${moneyTone(t.profitVnd)}`}>{compactVnd(t.profitVnd)}</td>
                    <td className="px-3 py-2 font-bold">{t.loadPct}%</td>
                    <td className="px-3 py-2 text-amber-700 font-bold">{compactVnd(t.dueVnd)}</td>
                  </tr>
                ))}
              </DetailTable>
            ) : (
              <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">Критичных сигналов по турам нет.</div>
            )}
          </DetailPanel>
        </Section>

        <Section title="Тур-гиды" eyebrow="Кто ведет выезды">
          <div className="mb-4 flex h-[180px] items-end gap-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
            {data.guides.slice(0, 8).map((g) => (
              <div key={g.guideId} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-[10px] bg-[#8fd400]"
                  style={{ height: `${Math.max(18, clampUi(g.sharePct) * 1.35)}px` }}
                  title={`${g.name}: ${compactVnd(g.revenueVnd)}`}
                />
                <div className="w-full truncate text-center text-[10px] font-bold text-slate-500">{g.name}</div>
              </div>
            ))}
            {data.guides.length === 0 ? <div className="m-auto text-[13px] text-slate-500">Нет назначенных гидов за период.</div> : null}
          </div>
          <div className="grid gap-3">
            {bestGuide ? (
              <Metric
                label="Топ-гид"
                value={bestGuide.name}
                sub={`${bestGuide.trips} выездов · ${bestGuide.tourists} чел. · ${compactVnd(bestGuide.revenueVnd)}`}
              />
            ) : null}
            {data.guides.slice(0, 10).map((g, idx) => (
              <BarRow
                key={g.guideId}
                label={`${idx + 1}. ${g.name}`}
                value={`${g.trips} тур.`}
                sub={`${g.tourists} чел. · среднее ${g.avgTouristsPerTrip} · оборот туров ${compactVnd(g.revenueVnd)}`}
                percent={g.sharePct}
                tone={idx === 0 ? "green" : "blue"}
              />
            ))}
          </div>
          <DetailPanel title="Все гиды по выездам" summary={`${data.guides.length} гидов`}>
            <DetailTable headers={["Гид", "Выезды", "Туристы", "Среднее", "Оборот туров", "Доля"]}>
              {data.guides.map((g) => (
                <tr key={g.guideId}>
                  <td className="px-3 py-2"><CellLink href={`/team/${g.guideId}`}>{g.name}</CellLink></td>
                  <td className="px-3 py-2 font-bold">{g.trips}</td>
                  <td className="px-3 py-2 font-bold">{g.tourists}</td>
                  <td className="px-3 py-2 font-bold">{g.avgTouristsPerTrip}</td>
                  <td className="px-3 py-2 font-bold">{compactVnd(g.revenueVnd)}</td>
                  <td className="px-3 py-2 font-bold">{pct(g.sharePct)}</td>
                </tr>
              ))}
            </DetailTable>
          </DetailPanel>
        </Section>
      </div>

      <div className="mt-4">
        <Section title="Туристы и база" eyebrow="Качество данных">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Взрослые" value={String(data.tourists.adults)} sub="Основной поток" />
              <Metric label="Дети" value={String(data.tourists.children)} sub={`Младенцы ${data.tourists.infants}`} />
              <Metric label="Онлайн" value={String(data.tourists.onlineBookings)} sub="Брони с онлайн-кодом" />
              <Metric label="Качество" value={pct(data.tourists.dataQualityPct)} sub={`Нет телефона ${data.tourists.missingPhone} · нет отеля ${data.tourists.missingHotel}`} />
              <Metric label="Соло/пары" value={`${data.tourists.soloBookings}/${data.tourists.pairBookings}`} sub="Тип брони без детей" />
              <Metric label="Семьи/группы" value={`${data.tourists.familyBookings}/${data.tourists.groupBookings}`} sub={`Долг в ${data.tourists.debtBookings} бронях`} />
            </div>
            <div className="grid gap-3">
              <div className="text-[13px] font-black text-slate-950">Топ отелей по обороту</div>
              {data.tourists.topHotels.map((h, idx) => (
                <BarRow
                  key={h.name}
                  label={`${idx + 1}. ${h.name}`}
                  value={compactVnd(h.revenueVnd)}
                  sub={`${h.bookings} броней · ${h.tourists} чел.`}
                  percent={f.revenueVnd > 0 ? (h.revenueVnd / f.revenueVnd) * 100 : 0}
                  tone="blue"
                />
              ))}
              {data.tourists.topHotels.length === 0 ? <div className="rounded-[14px] bg-slate-50 p-4 text-[13px] text-slate-500">Отели не заполнены в бронях периода.</div> : null}
            </div>
          </div>
          <DetailPanel title="Долги по броням" summary={`${data.investigations.debtBookings.length} строк`} open={data.investigations.debtBookings.length > 0}>
            {data.investigations.debtBookings.length > 0 ? (
              <DetailTable headers={["Бронь", "Турист", "Тур", "Дата", "Менеджер", "Точка", "Итого", "Оплачено", "Долг"]} minWidth={980}>
                {data.investigations.debtBookings.map((b) => (
                  <tr key={b.bookingId}>
                    <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                    <td className="px-3 py-2 font-bold">{b.customerName}</td>
                    <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{b.tourName}</CellLink></td>
                    <td className="px-3 py-2 text-slate-600">{b.dateYmd}</td>
                    <td className="px-3 py-2 text-slate-600">{b.managerName}</td>
                    <td className="px-3 py-2 text-slate-600">{b.pointName}</td>
                    <td className="px-3 py-2 font-bold">{compactVnd(b.totalVnd)}</td>
                    <td className="px-3 py-2 text-emerald-700 font-bold">{compactVnd(b.paidVnd)}</td>
                    <td className="px-3 py-2 text-amber-700 font-black">{compactVnd(b.dueVnd)}</td>
                  </tr>
                ))}
              </DetailTable>
            ) : (
              <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">Долгов по броням нет.</div>
            )}
          </DetailPanel>
          <DetailPanel title="Оценочные цены и качество базы" summary={`${data.investigations.dataIssues.length} сигналов`}>
            <div className="grid gap-3">
              {data.investigations.priceFallbackBookings.length > 0 ? (
                <DetailTable headers={["Бронь", "Турист", "Тур", "Дата", "Менеджер", "Туристы", "Оценка"]} minWidth={820}>
                  {data.investigations.priceFallbackBookings.map((b) => (
                    <tr key={b.bookingId}>
                      <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                      <td className="px-3 py-2 font-bold">{b.customerName}</td>
                      <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{b.tourName}</CellLink></td>
                      <td className="px-3 py-2 text-slate-600">{b.dateYmd}</td>
                      <td className="px-3 py-2 text-slate-600">{b.managerName}</td>
                      <td className="px-3 py-2 font-bold">{b.tourists}</td>
                      <td className="px-3 py-2 text-amber-700 font-bold">{compactVnd(b.estimatedVnd)}</td>
                    </tr>
                  ))}
                </DetailTable>
              ) : (
                <div className="rounded-[12px] bg-emerald-50 p-3 text-[13px] font-bold text-emerald-700">Все брони имеют точные строки цены.</div>
              )}
              {data.investigations.dataIssues.length > 0 ? (
                <DetailTable headers={["Бронь", "Турист", "Проблема", "Тур", "Дата", "Менеджер"]} minWidth={820}>
                  {data.investigations.dataIssues.map((b) => (
                    <tr key={`${b.bookingId}-${b.issue}`}>
                      <td className="px-3 py-2"><CellLink href={`/tourists/${b.bookingId}`}>{b.code}</CellLink></td>
                      <td className="px-3 py-2 font-bold">{b.customerName}</td>
                      <td className="px-3 py-2 text-amber-700 font-bold">{b.issue}</td>
                      <td className="px-3 py-2"><CellLink href={`/tours/${b.tourId}`}>{b.tourName}</CellLink></td>
                      <td className="px-3 py-2 text-slate-600">{b.dateYmd}</td>
                      <td className="px-3 py-2 text-slate-600">{b.managerName}</td>
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
