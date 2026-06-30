import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { MyReportMonthPicker } from "@/components/my-report-month-picker";
import { CommissionSharesLog } from "@/components/commission-shares-log";
import { requireAuth } from "@/lib/auth-session";
import { getPersonalReport, type InspectionTourRow } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { roleLabel } from "@/lib/role-labels";

export const dynamic = "force-dynamic";

function currentMonthYm(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonth(raw?: string): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
  return currentMonthYm();
}

function monthRange(ym: string): { fromYmd: string; toYmd: string; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fromYmd = `${y}-${pad(m)}-01`;
  const toYmd = `${y}-${pad(m)}-${pad(to.getDate())}`;
  const monthNames = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const label = `${monthNames[m - 1]} ${y}`;
  return { fromYmd, toYmd, label };
  void from;
}

function InspectionBlock({ inspections, title, noneLabel }: { inspections: InspectionTourRow[]; title: string; noneLabel: string }) {
  if (inspections.length === 0) return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{noneLabel}</p>
    </div>
  );
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
        {title} · {inspections.length}
      </p>
      <ul className="space-y-1">
        {inspections.map((t, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-[var(--text)]">{t.name}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">{t.date.slice(5).replace("-", ".")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-[var(--border)]">
      <span className="shrink-0 text-sm text-[var(--muted)]">{label}</span>
      <span className={`min-w-0 truncate text-right text-sm font-semibold tabular-nums ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {value}
      </span>
    </div>
  );
}

function MoneyHero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-[var(--accent)] px-5 py-5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">{label}</div>
      <div className="mt-1.5 break-words text-3xl font-bold tabular-nums leading-tight text-white sm:text-4xl">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-white/60">{sub}</div> : null}
    </div>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-[var(--border)]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted2)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-tight text-[var(--text)]">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div> : null}
    </div>
  );
}

export default async function MyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const user = await requireAuth();
  const { getLocale } = await import("next-intl/server");
  const locale = await getLocale();
  const sp = await searchParams;
  const rawM = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  const monthYm = parseMonth(rawM);
  const { fromYmd, toYmd, label } = monthRange(monthYm);

  const [report, tMR] = await Promise.all([
    getPersonalReport(user.id, user.role, fromYmd, toYmd),
    getTranslations("myReport"),
  ]);

  return (
    <main className="app-wrap">
      <TopNav user={user} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title mb-0">Мой отчёт</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{roleLabel(user.role, locale)} · {user.fullName}</p>
        </div>
        <Suspense>
          <MyReportMonthPicker current={monthYm} />
        </Suspense>
      </div>

      <p className="mb-4 text-[13px] font-medium text-[var(--muted2)]">{label}</p>

      {report.kind === "manager" && (
        <div className="flex flex-col gap-3">
          <MoneyHero
            label={`Заработок · ${report.commissionPct}% комиссия`}
            value={report.commissionVnd > 0 ? formatVnd(report.commissionVnd) : "—"}
            sub={report.totalVnd > 0 ? `Оборот: ${formatVnd(report.totalVnd)}` : undefined}
          />
          <StatRow label="Билеты (прибыль)" value={report.ticketProfitVnd > 0 ? formatVnd(report.ticketProfitVnd) : "—"} />
          <StatRow
            label="Итого заработок"
            value={(report.commissionVnd + report.ticketProfitVnd) > 0 ? formatVnd(report.commissionVnd + report.ticketProfitVnd) : "—"}
            accent
          />
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="Броней" value={String(report.bookings)} />
            <BigStat label="Туристов" value={String(report.tourists)} />
          </div>
          {report.bookings === 0 && (
            <p className="mt-2 text-center text-sm text-[var(--muted)]">Нет броней за этот месяц</p>
          )}
          <InspectionBlock
            inspections={report.inspections}
            title={tMR("inspectionTitle")}
            noneLabel={tMR("inspectionNone")}
          />
          <div className="mt-1">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted2)]">Деление комиссии</p>
            <CommissionSharesLog alwaysOpen />
          </div>
        </div>
      )}

      {report.kind === "guide" && (
        <div className="flex flex-col gap-3">
          <MoneyHero
            label="Начислено"
            value={report.salaryAccruedVnd > 0 ? formatVnd(report.salaryAccruedVnd) : "—"}
            sub={report.trips > 0 ? `За ${report.trips} ${report.trips === 1 ? "выезд" : report.trips < 5 ? "выезда" : "выездов"}` : undefined}
          />
          <StatRow label="Выплачено" value={report.salaryPaidVnd > 0 ? formatVnd(report.salaryPaidVnd) : "—"} accent />
          {report.salaryAccruedVnd > report.salaryPaidVnd && report.salaryAccruedVnd > 0 && (
            <StatRow label="К выплате" value={formatVnd(report.salaryAccruedVnd - report.salaryPaidVnd)} />
          )}
          <StatRow label="Выездов" value={String(report.trips)} />
          {report.trips === 0 && (
            <p className="mt-2 text-center text-sm text-[var(--muted)]">Нет назначений в этом месяце</p>
          )}
          <InspectionBlock
            inspections={report.inspections}
            title={tMR("inspectionTitle")}
            noneLabel={tMR("inspectionNone")}
          />
        </div>
      )}

      {report.kind === "dispatcher" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="Туров в периоде" value={String(report.tours)} />
            <BigStat label="Автобусов назначено" value={String(report.busAssignments)} />
          </div>
          {report.tours === 0 && (
            <p className="mt-2 text-center text-sm text-[var(--muted)]">Нет туров за этот месяц</p>
          )}
        </div>
      )}

      {report.kind === "accountant" && (
        <div className="flex flex-col gap-3">
          <MoneyHero
            label="Принято в кассу"
            value={report.cashInVnd > 0 ? formatVnd(report.cashInVnd) : "—"}
            sub={report.cashOps > 0 ? `${report.cashOps} операций` : undefined}
          />
          <StatRow label="Выдано из кассы" value={report.cashOutVnd > 0 ? formatVnd(report.cashOutVnd) : "—"} />
          {report.cashOps === 0 && (
            <p className="mt-2 text-center text-sm text-[var(--muted)]">Нет операций за этот месяц</p>
          )}
        </div>
      )}

      {report.kind === "other" && (
        <div className="card py-8 text-center text-[var(--muted)]">
          Личный отчёт недоступен для вашей роли
        </div>
      )}
    </main>
  );
}
