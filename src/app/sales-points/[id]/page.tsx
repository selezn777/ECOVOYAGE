import Link from "next/link";
import { notFound } from "next/navigation";
import { SalesPointExpenseRequestsPanel } from "@/components/sales-point-expense-requests-panel";
import { SalesPointPeriodControls } from "@/components/sales-point-period-controls";
import { TopNav } from "@/components/top-nav";
import { requireRoles } from "@/lib/auth-session";
import { getRentalPointById, getSalesPointRatingReport } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { SALES_POINT_LEADERSHIP_ROLES } from "@/lib/role-policy";
import { tourBusinessTodayYmd } from "@/lib/scheduling";

function monthBoundsYmd(year: number, month: number): { fromYmd: string; toYmd: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0);
  return {
    fromYmd: `${year}-${pad(month)}-01`,
    toYmd: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
  };
}

export default async function SalesPointDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preset?: string; day?: string; month?: string }>;
}) {
  const user = await requireRoles([...SALES_POINT_LEADERSHIP_ROLES]);
  const { id } = await params;
  const sp = await searchParams;
  const pointDetail = await getRentalPointById(id);
  if (!pointDetail) notFound();
  const preset = sp.preset === "day" || sp.preset === "all" ? sp.preset : "month";
  const todayYmd = tourBusinessTodayYmd();
  const dayYmd = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayYmd;
  const monthKey = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayYmd.slice(0, 7);
  const monthY = Number(monthKey.slice(0, 4));
  const monthM = Number(monthKey.slice(5, 7));
  const monthFromTo = monthBoundsYmd(monthY, monthM);
  const fromYmd = preset === "day" ? dayYmd : preset === "all" ? "2010-01-01" : monthFromTo.fromYmd;
  const toYmd = preset === "day" ? dayYmd : preset === "all" ? todayYmd : monthFromTo.toYmd;
  const rows = await getSalesPointRatingReport(fromYmd, toYmd);
  const row = rows.find((r) => r.pointId === id);
  if (!row) notFound();
  const periodLabel =
    preset === "day"
      ? `День · ${dayYmd}`
      : preset === "all"
        ? "Всё время"
        : new Date(monthY, monthM - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <section className="card mb-3 border-[var(--border)] bg-[var(--surface)] ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-[var(--text)]">{row.pointName}</h1>
          <Link href="/sales-points" className="btn-secondary px-3 py-2 text-xs font-medium">
            К списку точек
          </Link>
        </div>
        <SalesPointPeriodControls pointId={id} initialPreset={preset} initialDay={dayYmd} initialMonth={monthKey} />
        <p className="mt-2 text-xs text-[var(--muted2)]">
          Период:{" "}
          <span className="font-medium capitalize text-[var(--muted)]">{periodLabel}</span>{" "}
          ({fromYmd} - {toYmd})
        </p>
        {pointDetail.photoUrl ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">
            <img src={pointDetail.photoUrl} alt={`Фото точки ${row.pointName}`} className="h-44 w-full object-cover" />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">Фото точки пока не загружено диспетчером.</p>
        )}
      </section>

      <section className="card border-[var(--border)] bg-[var(--surface)] ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
        <div className="mt-1 text-xs text-[var(--muted)]">
          {row.managers.length === 0 ? (
            <span className="text-[var(--muted2)]">Менеджеры не закреплены</span>
          ) : (
            <>Менеджеры: {row.managers.map((m) => m.fullName).join(", ")}</>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Брони в периоде</div>
            <div className="mt-0.5 tabular-nums font-medium">{row.bookingsOnToursInPeriod}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Оплаты, ₫</div>
            <div className="mt-0.5 tabular-nums font-semibold">{formatVnd(row.paymentsNetVndInPeriod)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Расходы точки, ₫</div>
            <div className="mt-0.5 tabular-nums">{formatVnd(row.pointExpensesVndInPeriod)}</div>
          </div>
          {user.role === "director" ? (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Аренда / мес, ₫</div>
              <div className="mt-0.5 tabular-nums text-[var(--muted)]">{formatVnd(row.monthlyRentVnd)}</div>
            </div>
          ) : null}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Раб. дни</div>
            <div
              className="mt-0.5 tabular-nums text-[var(--muted)]"
              title={`Календарных дней: ${row.calendarDaysInPeriod}, закрытых: ${row.closedDaysInPeriod}`}
            >
              {row.workingDaysNet}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Оценка</div>
            <div className="mt-0.5 tabular-nums text-[var(--muted)]">
              {row.managerRatingAvg != null ? (
                <>
                  {row.managerRatingAvg}
                  <span className="text-[10px] text-[var(--muted2)]"> ({row.managerReviewsCount})</span>
                </>
              ) : (
                "-"
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted2)]">
          Оценка = средний балл отзывов руководства по работе менеджеров на точке за период.
        </p>
        {row.managers.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-2.5">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">
              Кто и когда работал / продажи
            </div>
            <ul className="space-y-2">
              {row.managers.map((m) => (
                <li key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs text-[var(--text)]">
                  <div className="font-semibold">{m.fullName}</div>
                  <div className="mt-1 text-[var(--muted)]">
                    Работал дней за период: <span className="font-semibold text-[var(--text)]">{m.openedDays.length}</span>
                  </div>
                  <div className="text-[var(--muted)]">
                    Брони: {m.bookingsInPeriod} · Оплаты: {formatVnd(m.paymentsNetVndInPeriod)}
                  </div>
                  <div className="text-[var(--muted)]">
                    По режимам: Точка {m.modeStats.point.bookings}/{formatVnd(m.modeStats.point.paymentsNetVnd)} · Промо{" "}
                    {m.modeStats.promo.bookings}/{formatVnd(m.modeStats.promo.paymentsNetVnd)} · Онлайн{" "}
                    {m.modeStats.online.bookings}/{formatVnd(m.modeStats.online.paymentsNetVnd)}
                  </div>
                  <div className="mt-1 text-[var(--muted)]">
                    Дни: {m.openedDays.length > 0 ? m.openedDays.join(", ") : "нет подтверждений"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <SalesPointExpenseRequestsPanel pointId={id} viewerRole={user.role} expenses={pointDetail.expenses} />
    </main>
  );
}

