import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { ExpenseForm } from "@/components/expense-form";
import { BookingsByHourChart } from "@/components/bookings-by-hour-chart";
import { formatVnd } from "@/lib/format";
import {
  getCurrentCashStateSummary,
  getBookingsByHour,
  getFinanceSnapshotForYmdRange,
  listPaymentsForYmdRange,
  listToursForExpenseForm,
  listManagersFinanceSummary,
  getCompanyPayrollCalendar,
} from "@/lib/data";
import { requireRoles } from "@/lib/auth-session";
import { COMPANY_PAYROLL_CALENDAR_EDIT_ROLES, FINANCE_PAGE_ROLES } from "@/lib/role-policy";
import { ManagerSalaryPayoutDayCard } from "@/components/manager-salary-payout-day-card";
import { ChiefManagerRosterPanel } from "@/components/chief-manager-roster-panel";
import { GoogleSyncPanel } from "@/components/google-sync-panel";
import { paymentKindRu } from "@/lib/payment-kind-labels";
import { localDateString, monthBoundsYmdFromAnchor } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

type RangePreset = "today" | "yesterday" | "week" | "month" | "custom";

function pickSp(v?: string | string[]): string {
  if (v == null) return "";
  return Array.isArray(v) ? String(v[0] ?? "") : String(v);
}

function resolveDateRange(preset: RangePreset, fromRaw: string, toRaw: string): { from: string; to: string } {
  const today = localDateString();

  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const ymd = d.toISOString().slice(0, 10);
    return { from: ymd, to: ymd };
  }
  if (preset === "week") {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (preset === "month") {
    const m = monthBoundsYmdFromAnchor(today);
    return m ?? { from: today, to: today };
  }
  if (preset === "custom") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : today;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  // default: last 30 days
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 29);
  return { from: d.toISOString().slice(0, 10), to: today };
}

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "week", label: "7 дней" },
  { key: "month", label: "Месяц" },
  { key: "custom", label: "Период" },
];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const user = await requireRoles([...FINANCE_PAGE_ROLES]);
  const sp = await searchParams;

  const isDirector = user.role === "director";
  const isAccountant = user.role === "accountant";
  const isChiefManager = user.role === "chief_manager";

  const presetRaw = pickSp(sp.range) as RangePreset | "";
  const preset: RangePreset = (["today", "yesterday", "week", "month", "custom"] as RangePreset[]).includes(presetRaw as RangePreset)
    ? (presetRaw as RangePreset)
    : "month";

  const { from: fromYmd, to: toYmd } = resolveDateRange(preset, pickSp(sp.from), pickSp(sp.to));

  // Для chief_manager — грузим ростер менеджеров, не период-отчёт
  const [snap, cashState, byHour, payments, tourOptions, managerRoster, payrollCalendar] = await Promise.all([
    !isChiefManager ? getFinanceSnapshotForYmdRange(fromYmd, toYmd) : Promise.resolve(null),
    isDirector ? getCurrentCashStateSummary() : Promise.resolve(null),
    isDirector ? getBookingsByHour({ kind: "month", year: new Date(`${fromYmd}T12:00:00`).getFullYear(), month: new Date(`${fromYmd}T12:00:00`).getMonth() + 1 }) : Promise.resolve([]),
    !isChiefManager ? listPaymentsForYmdRange(fromYmd, toYmd, 100) : Promise.resolve([]),
    (!isDirector && !isAccountant && !isChiefManager) ? listToursForExpenseForm() : Promise.resolve([]),
    isChiefManager ? listManagersFinanceSummary() : Promise.resolve([]),
    isChiefManager ? getCompanyPayrollCalendar() : Promise.resolve(null),
  ]);

  // Агрегация по менеджерам из платежей (только для директора/бухгалтера)
  const byManagerMap = new Map<string, { name: string; amountVnd: number; count: number }>();
  for (const p of payments) {
    if (!p.managerName) continue;
    const cur = byManagerMap.get(p.managerName) ?? { name: p.managerName, amountVnd: 0, count: 0 };
    cur.amountVnd += p.amountVnd;
    cur.count++;
    byManagerMap.set(p.managerName, cur);
  }
  const byManager = [...byManagerMap.values()].sort((a, b) => b.amountVnd - a.amountVnd);
  const maxManagerAmount = byManager[0]?.amountVnd ?? 1;

  // Строим ссылки для пресетов
  function presetHref(p: RangePreset): string {
    return `/finance?range=${p}`;
  }

  const periodLabel = fromYmd === toYmd
    ? new Date(`${fromYmd}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : `${new Date(`${fromYmd}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${new Date(`${toYmd}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />

      {isAccountant ? (
        <section className="card mb-3 border-[var(--accent-soft)] bg-[var(--accent-soft)]/35 ring-1 ring-[var(--accent)]/25">
          <p className="text-sm text-[var(--text)]">
            Основной рабочий стол →{" "}
            <Link href="/accounting" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
              Бухгалтерия
            </Link>
          </p>
        </section>
      ) : null}

      {isDirector ? <GoogleSyncPanel /> : null}

      {COMPANY_PAYROLL_CALENDAR_EDIT_ROLES.includes(user.role) ? <ManagerSalaryPayoutDayCard /> : null}

      {/* ── chief_manager: ростер менеджеров ── */}
      {isChiefManager ? (
        <ChiefManagerRosterPanel
          managers={managerRoster}
          payoutDay={payrollCalendar?.managerSalaryPayoutDay ?? 5}
        />
      ) : null}

      {/* ── Заголовок + фильтр периода (директор / бухгалтер) ── */}
      {!isChiefManager ? (
        <section className="card mb-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold text-[var(--text)]">Финансовый отчёт</h1>
            <span className="text-xs text-[var(--muted)]">{periodLabel}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.filter(p => p.key !== "custom").map((p) => {
              const active = preset === p.key;
              return (
                <Link
                  key={p.key}
                  href={presetHref(p.key)}
                  className={`inline-flex min-h-[36px] items-center rounded-xl px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-soft)] text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
            <form method="get" className="flex items-center gap-1.5">
              <input type="hidden" name="range" value="custom" />
              <input
                type="date"
                name="from"
                defaultValue={preset === "custom" ? fromYmd : ""}
                className={`field-surface min-h-[36px] rounded-xl px-2 text-sm ${preset === "custom" ? "ring-2 ring-[var(--accent)]/50" : ""}`}
              />
              <span className="text-[var(--muted2)] text-sm">—</span>
              <input
                type="date"
                name="to"
                defaultValue={preset === "custom" ? toYmd : ""}
                className={`field-surface min-h-[36px] rounded-xl px-2 text-sm ${preset === "custom" ? "ring-2 ring-[var(--accent)]/50" : ""}`}
              />
              <button type="submit" className="btn-primary min-h-[36px] rounded-xl px-3 text-sm disabled:opacity-50">OK</button>
            </form>
          </div>
        </section>
      ) : null}

      {/* ── Текущее состояние кассы (директор) ── */}
      {isDirector && cashState ? (
        <section className="card mb-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Состояние кассы сейчас</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Касса офиса</div>
              <div className="mt-0.5 text-base font-bold tabular-nums">{formatVnd(cashState.currentCashBalanceVnd)}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">У менеджеров</div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatVnd(cashState.managerHeldVnd)}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Соберёт гид/менеджер</div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {formatVnd(cashState.totalBookingDueVnd)}
              </div>
              <div className="mt-0.5 text-[9px] text-[var(--muted2)]">остаток по броням</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Доплаты у гидов</div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-[var(--muted)]">{formatVnd(cashState.pendingGuideTopupsVnd)}</div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Сводка за период (директор + бухгалтер) ── */}
      {snap && !isChiefManager ? (
        <section className="card mb-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">За период · {periodLabel}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2.5 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Поступило</div>
              <div className="mt-1 text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatVnd(snap.incomeVnd)}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2.5 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Расходы</div>
              <div className="mt-1 text-base font-bold tabular-nums text-red-700 dark:text-red-400">{formatVnd(snap.expenseVnd)}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-soft)] px-2 py-2.5 ring-1 ring-[var(--border)]">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">Чистыми</div>
              <div className={`mt-1 text-base font-bold tabular-nums ${snap.netVnd >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {formatVnd(snap.netVnd)}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Топ менеджеров по суммам за период (директор / бухгалтер) ── */}
      {!isChiefManager && byManager.length > 0 ? (
        <section className="card mb-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
            {isChiefManager ? "Поступления по менеджерам" : "Менеджеры · поступления за период"}
          </div>
          <ul className="space-y-2">
            {byManager.map((m, i) => {
              const pct = Math.round((m.amountVnd / maxManagerAmount) * 100);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <li key={m.name}>
                  <div className="flex min-w-0 items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-sm leading-none">
                      {medal ?? <span className="w-5 block text-center text-[10px] font-semibold text-[var(--muted2)]">{i + 1}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-[var(--text)]">{m.name}</div>
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[11px] text-[var(--muted)]">{m.count} платежей</span>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums">{formatVnd(m.amountVnd)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%`, opacity: 0.6 + 0.4 * (pct / 100) }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── График записей по часам (директор) ── */}
      {isDirector && byHour.length > 0 ? (
        <section className="card mb-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Записи по часам · {periodLabel}</div>
          <BookingsByHourChart rows={byHour} />
        </section>
      ) : null}

      {/* ── Форма расхода (не директор/бухгалтер/chief_manager) ── */}
      {!isDirector && !isAccountant && !isChiefManager ? (
        <section className="card mb-3">
          <h2 className="mb-2 text-base font-semibold">Новый расход</h2>
          <ExpenseForm tours={tourOptions} />
        </section>
      ) : null}

      {/* ── Платёжный фид (директор / бухгалтер) ── */}
      {!isChiefManager ? <section className="card">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">Платежи</h2>
          <span className="text-xs text-[var(--muted)]">{payments.length} шт.</span>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Платежей за выбранный период нет.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {payments.map((p) => {
              const tourist = p.customerName
                ? (p.onlineCode ? `${p.customerName} (${p.onlineCode})` : p.customerName)
                : `Бронь: ${p.bookingId.slice(0, 8)}…`;
              const context = [
                p.managerName ?? null,
                p.tourName ? `${p.tourName}${p.tourDate ? ` · ${p.tourDate}` : ""}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <li key={p.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(p.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      {" · "}{paymentKindRu(p.kind)}
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${p.kind === "refund" ? "text-red-700 dark:text-red-400" : ""}`}>
                      {p.kind === "refund" ? "−" : ""}{formatVnd(p.amountVnd)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium text-[var(--text)]">{tourist}</div>
                  {context ? <div className="text-xs text-[var(--muted2)]">{context}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
        {payments.length >= 200 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Показано 200 записей — уточните период.</p>
        ) : null}
      </section> : null}
    </main>
  );
}
