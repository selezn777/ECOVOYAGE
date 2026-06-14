"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeMonthlyPayrollPanel } from "@/components/employee-monthly-payroll-panel";
import { EmployeePayrollContributionsPanel } from "@/components/employee-payroll-contributions-panel";
import { ManagerCashOnHandPanel } from "@/components/manager-cash-on-hand-panel";
import { GuideShopPerformancePanel } from "@/components/guide-shop-performance-panel";
import { ManagerSalesCommissionInline } from "@/components/manager-sales-commission-inline";
import { formatVnd } from "@/lib/format";
import { roleLabel } from "@/lib/role-labels";
import type { EmployeeFinanceCardData, RosterUser, Role } from "@/lib/types";
import { showConfirm } from "@/lib/ui-dialog";

function StatTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: "amber";
}) {
  const em =
    emphasize === "amber"
      ? "border-amber-200/80 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/35"
      : "";
  return (
    <div className={`rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow-sm)] ${em}`}>
      <div className="text-[11px] font-medium leading-snug text-[var(--muted2)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)] sm:text-xl">{formatVnd(value)}</div>
    </div>
  );
}

function StatTileText({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: "amber";
}) {
  const em =
    emphasize === "amber"
      ? "border-amber-200/80 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/35"
      : "";
  return (
    <div className={`rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow-sm)] ${em}`}>
      <div className="text-[11px] font-medium leading-snug text-[var(--muted2)]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text)] sm:text-xl">{value}</div>
    </div>
  );
}

const DETAILS_CARD = "card mb-3 [&_summary::-webkit-details-marker]:hidden";

function parseVndDigits(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Math.round(Number(digits)) : 0;
}

function formatVndInputDots(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function EmployeeFinanceCard({
  employee,
  viewerCanPayBonusFromCash,
  viewerCanEditManagerCommission,
  viewerCanManagePayrollTaxes,
  viewerRole,
}: {
  employee: EmployeeFinanceCardData;
  viewerCanPayBonusFromCash: boolean;
  viewerCanEditManagerCommission: boolean;
  viewerCanManagePayrollTaxes: boolean;
  /** Для главного менеджера — правка % только у менеджеров по продажам (не у других главных). */
  viewerRole?: Role;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [bonusAmountText, setBonusAmountText] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [bonusPlannedPayDate, setBonusPlannedPayDate] = useState("");
  const [bonusBusy, setBonusBusy] = useState(false);
  const [payingBonusId, setPayingBonusId] = useState<string | null>(null);
  const [salaryRecordId, setSalaryRecordId] = useState(employee.pendingSalaryRecords[0]?.id ?? "");
  const [cashSearch, setCashSearch] = useState("");

  const canEditManagerCommissionInline =
    viewerCanEditManagerCommission &&
    !(viewerRole === "chief_manager" && employee.employeeRole === "chief_manager");

  const netSettlementVnd = useMemo(
    () => employee.shouldReceiveVnd - employee.shouldReturnVnd,
    [employee.shouldReceiveVnd, employee.shouldReturnVnd],
  );

  const managerNetSettlementText = useMemo(() => {
    const s = employee.managerFullSettlement;
    if (!s) return "";
    const net = s.netAfterBookingsCashVsCommissionVnd;
    const cash = s.cashToHandInFromBookingsVnd;
    const tot = s.commissionTotalEstimateVnd;
    if (net > 0) {
      return `После сдачи ${formatVnd(cash)} по броням в кассу по оценке компании остаётся выплатить менеджеру ${formatVnd(net)} (заработок ${formatVnd(tot)} минус эта сдача).`;
    }
    if (net < 0) {
      return `Заработок по оценке ${formatVnd(tot)} меньше, чем наличные к сдаче ${formatVnd(cash)}. После сдачи по броням менеджеру может оставаться внести в кассу разницу ${formatVnd(-net)} - либо уточните уже выплаченные суммы в кассе.`;
    }
    return `По оценке заработок ${formatVnd(tot)} и сдача ${formatVnd(cash)} по броням совпадают по сумме.`;
  }, [employee.managerFullSettlement]);

  const rosterStubForCommission: RosterUser = useMemo(
    () => ({
      id: employee.employeeId,
      fullName: employee.employeeName,
      role: employee.employeeRole,
      offToday: false,
      upcomingDaysOff: [],
      whatsappPhone: null,
      managerSalesCommissionPercent: employee.managerSalesCommissionPercent ?? null,
    }),
    [employee],
  );

  const isMgr = employee.employeeRole === "manager" || employee.employeeRole === "chief_manager";
  const isGuide = employee.employeeRole === "guide" || employee.employeeRole === "chief_guide";
  const isGuideManagerMode = isGuide && employee.managerModeEnabled === true && Boolean(employee.managerFullSettlement);
  const managerPerf = employee.managerModePerformance ?? null;
  const m = employee.managerCashOnHand;

  const handsLabel = isMgr ? "Деньги на руках (оценка)" : "Подотчёт к сдаче (на руках)";
  const handsVnd = isMgr && m ? m.outstandingAllTimeVnd : employee.shouldReturnVnd;

  const handedLabel = isMgr ? "Деньги сдал в кассу (всего)" : "Возврат подотчёта в кассу (всего)";
  const handedVnd = isMgr && m ? m.allTimeHandedVnd : employee.spentVnd;

  const earnLabel = isMgr ? "Процент с прайса (брони)" : "Начислено всего";
  const earnPercentText =
    employee.managerSalesCommissionPercent != null && Number.isFinite(employee.managerSalesCommissionPercent)
      ? `${employee.managerSalesCommissionPercent}%`
      : "-";

  const activityLabel = isMgr ? "Операций по платежам (месяц)" : isGuide ? "Туров с датой в этом месяце" : "Активность (месяц)";

  const cashQueryBase = useMemo(() => {
    const q = new URLSearchParams();
    q.set("employeeId", employee.employeeId);
    q.set("employeeName", employee.employeeName);
    return q.toString();
  }, [employee.employeeId, employee.employeeName]);

  const cashRowsFiltered = useMemo(() => {
    const q = cashSearch.trim().toLowerCase();
    if (!q) return employee.cashPreviewRows;
    return employee.cashPreviewRows.filter((r) => r.summary.toLowerCase().includes(q));
  }, [employee.cashPreviewRows, cashSearch]);

  const cashInTotal = useMemo(
    () => cashRowsFiltered.filter((r) => r.direction === "in").reduce((s, r) => s + r.amountVnd, 0),
    [cashRowsFiltered],
  );
  const cashOutTotal = useMemo(
    () => cashRowsFiltered.filter((r) => r.direction === "out").reduce((s, r) => s + r.amountVnd, 0),
    [cashRowsFiltered],
  );

  async function payout() {
    if (!salaryRecordId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/guide-salary-records/${salaryRecordId}/pay`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Ошибка ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  async function submitBonus() {
    const amountVnd = parseVndDigits(bonusAmountText);
    if (amountVnd <= 0 || bonusBusy) return;
    setBonusBusy(true);
    try {
      const res = await fetch(`/api/team/${employee.employeeId}/bonus-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd,
          note: bonusNote.trim() || undefined,
          plannedPayDate: bonusPlannedPayDate.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : typeof j.error === "object" && j.error && "formErrors" in j.error
              ? String((j.error as { formErrors?: string[] }).formErrors?.join(" "))
              : "Не удалось сохранить";
        alert(msg);
        return;
      }
      setBonusAmountText("");
      setBonusNote("");
      setBonusPlannedPayDate("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBonusBusy(false);
    }
  }

  async function payBonus(bid: string) {
    if (!viewerCanPayBonusFromCash || payingBonusId) return;
    const ok = await showConfirm("Провести расход в кассе и отметить выплату премии сотруднику?");
    if (!ok) return;
    setPayingBonusId(bid);
    try {
      const res = await fetch(`/api/team/${employee.employeeId}/bonus-records/${bid}/pay`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPayingBonusId(null);
    }
  }

  async function confirmFullSettlement() {
    const ok = await showConfirm(
      "Открыть кассу для полного расчёта? Дальнейшие нули по деньгам фиксируйте проводками в кассе или у директора по финансам.",
    );
    if (!ok) return;
    const q = new URLSearchParams(cashQueryBase);
    q.set("prefillTitle", `Полный расчёт: ${employee.employeeName}`);
    router.push(`/cash?${q.toString()}`);
  }

  const cashLinkExpense = `/cash?${new URLSearchParams({
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    prefillTitle: `Расход: ${employee.employeeName}`,
  }).toString()}`;

  return (
    <>
      <section className="card mb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">{employee.employeeName}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Роль: {roleLabel(employee.employeeRole)}</p>
          </div>
          <Link
            href="/team"
            className="btn-secondary shrink-0 px-3 py-2 text-xs font-medium no-underline"
          >
            К списку сотрудников
          </Link>
        </div>
      </section>

      {isMgr && (
        <section className="card mb-3">
          <h2 className="mb-1 text-base font-semibold">Процент от прайса (брони)</h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            {canEditManagerCommissionInline ? (
              <>
                Хранится в профиле сотрудника; от него считаются «Мои продажи», блок подотчёта и суммы на этой странице —
                после сохранения обновите экран или откройте карточку заново.
              </>
            ) : (
              <>Процент главного менеджера задают директор или бухгалтерия.</>
            )}
          </p>
          {canEditManagerCommissionInline ? (
            <ManagerSalesCommissionInline r={rosterStubForCommission} onSaved={() => router.refresh()} />
          ) : (
            <p className="text-sm font-medium tabular-nums text-[var(--text)]">
              {employee.managerSalesCommissionPercent != null && Number.isFinite(employee.managerSalesCommissionPercent)
                ? `${employee.managerSalesCommissionPercent}%`
                : "12% (по умолчанию)"}
            </p>
          )}
        </section>
      )}

      {isGuideManagerMode && (
        <section className="card mb-3">
          <h2 className="mb-1 text-base font-semibold">Работа как менеджер (гид в режиме менеджера)</h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Отдельный контур: процент с прайса, закрытия и расчёт выплаты именно за менеджерские действия.
          </p>
          <div className="mb-3">
            {canEditManagerCommissionInline ? (
              <ManagerSalesCommissionInline r={rosterStubForCommission} onSaved={() => router.refresh()} />
            ) : (
              <p className="text-sm font-medium tabular-nums text-[var(--text)]">
                Процент:{" "}
                {employee.managerSalesCommissionPercent != null && Number.isFinite(employee.managerSalesCommissionPercent)
                  ? `${employee.managerSalesCommissionPercent}%`
                  : "12% (по умолчанию)"}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatTileText label="Закрыто броней (месяц)" value={String(managerPerf?.monthBookingsCount ?? 0)} />
            <StatTileText label="Закрыто туристов (месяц)" value={String(managerPerf?.monthPaxClosed ?? 0)} />
            <StatTileText label="Закрыто броней (всё время)" value={String(managerPerf?.allBookingsCount ?? 0)} />
            <StatTileText label="Закрыто туристов (всё время)" value={String(managerPerf?.allPaxClosed ?? 0)} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <StatTile
              label="Оценка выплаты как менеджеру"
              value={employee.managerFullSettlement?.commissionTotalEstimateVnd ?? 0}
            />
            <StatTileText
              label="После сдачи наличных по броням"
              value={
                ((employee.managerFullSettlement?.netAfterBookingsCashVsCommissionVnd ?? 0) >= 0 ? "" : "-") +
                formatVnd(Math.abs(employee.managerFullSettlement?.netAfterBookingsCashVsCommissionVnd ?? 0))
              }
              emphasize="amber"
            />
          </div>
        </section>
      )}

      {viewerCanManagePayrollTaxes ? (
        <>
          <EmployeePayrollContributionsPanel employee={employee} />
          <EmployeeMonthlyPayrollPanel employee={employee} viewerCanEdit />
        </>
      ) : null}

      {m ? (
        <section className="card mb-3">
          <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Брони и касса (всего)</h2>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Принято по броням этого менеджера и сдачи в центральную кассу с туров; «на руках» - оценка за всё время.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <StatTile label="Принято по броням (всего)" value={m.allTimeReceivedVnd} />
            <StatTile label="Сдано в центральную кассу (всего)" value={m.allTimeHandedVnd} />
            <StatTile label="На руках / к сдаче" value={m.outstandingAllTimeVnd} emphasize="amber" />
          </div>
        </section>
      ) : null}

      {m ? <ManagerCashOnHandPanel employeeId={employee.employeeId} snapshot={m} /> : null}

      {isGuide && employee.guideShopSnapshot ? (
        <GuideShopPerformancePanel employeeId={employee.employeeId} snapshot={employee.guideShopSnapshot} />
      ) : null}

      <section className="card mb-3">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Деньги сотрудника по системе</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Отдельно от начислений: сколько сейчас на руках у сотрудника и сколько уже возвращено в кассу по системе.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatTile label={handsLabel} value={handsVnd} emphasize="amber" />
          <StatTile label={handedLabel} value={handedVnd} />
        </div>
      </section>

      <section className="card mb-3">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Зарплата и подотчёт</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <StatTileText label={activityLabel} value={String(employee.monthStats.activityMonthToDate)} />
          {isMgr ? (
            <StatTileText label={earnLabel} value={earnPercentText} />
          ) : (
            <StatTile label={earnLabel} value={employee.accruedVnd} />
          )}
          <StatTile label="Выплачено из начисленного" value={employee.paidVnd} />
          <StatTile label="Премия к выплате (начислено)" value={employee.bonusPendingVnd} />
          <StatTile label="Премия выплачено" value={employee.bonusPaidVnd} />
          <StatTileText
            label="Выходных (с 1-го числа месяца)"
            value={String(employee.monthStats.daysOffMonthToDate)}
          />
        </div>
      </section>

      <details className={DETAILS_CARD}>
        <summary className="cursor-pointer list-none">
          <h2 className="text-base font-semibold text-[var(--text)]">Выдать премию</h2>
        </summary>
        <div className="mt-3 border-t border-[var(--border)]/60 pt-3 text-sm text-[var(--text)]">
          <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
            Начисляйте премию здесь: до фактической выплаты из кассы это ожидание у сотрудника. Доход в учёте - после
            проводки «Премия» в кассе (бухгалтерия). Можно указать планируемую дату выплаты.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--muted2)]">Сумма, ₫</span>
              <input
                value={bonusAmountText}
                onChange={(e) => setBonusAmountText(formatVndInputDots(parseVndDigits(e.target.value)))}
                inputMode="numeric"
                placeholder="0"
                className="field-surface rounded-xl px-3 py-2.5 text-sm tabular-nums"
                disabled={bonusBusy}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--muted2)]">Планируемая выплата (необязательно)</span>
              <input
                type="date"
                value={bonusPlannedPayDate}
                onChange={(e) => setBonusPlannedPayDate(e.target.value)}
                className="field-surface rounded-xl px-3 py-2.5 text-sm"
                disabled={bonusBusy}
              />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--muted2)]">Комментарий</span>
              <input
                value={bonusNote}
                onChange={(e) => setBonusNote(e.target.value)}
                maxLength={2000}
                placeholder="За что премия"
                className="field-surface rounded-xl px-3 py-2.5 text-sm"
                disabled={bonusBusy}
              />
            </label>
          </div>
          <div className="action-row mt-3">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={bonusBusy || parseVndDigits(bonusAmountText) <= 0}
              onClick={() => void submitBonus()}
            >
              {bonusBusy ? "Сохранение…" : "Начислить премию"}
            </button>
          </div>

          {employee.bonusRecords.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-[var(--border)]/60 pt-4">
              {employee.bonusRecords.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums">{formatVnd(r.amountVnd)}</div>
                    <div className="text-xs text-[var(--muted)]">
                      Начислено:{" "}
                      {new Date(r.accruedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      {r.plannedPayDate
                        ? ` · план выплаты: ${new Date(r.plannedPayDate + "T12:00:00").toLocaleDateString("ru-RU")}`
                        : null}
                    </div>
                    {r.note ? <div className="mt-1 text-xs text-[var(--muted2)]">{r.note}</div> : null}
                    {r.paidAt ? (
                      <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                        Выплачено:{" "}
                        {new Date(r.paidAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">Ожидает выплаты из кассы</div>
                    )}
                  </div>
                  {!r.paidAt ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0 px-3 py-2 text-xs font-medium disabled:opacity-50"
                      disabled={!viewerCanPayBonusFromCash || payingBonusId === r.id}
                      title={
                        viewerCanPayBonusFromCash
                          ? "Провести расход в кассе и отметить выплату"
                          : "Только бухгалтерия"
                      }
                      onClick={() => void payBonus(r.id)}
                    >
                      {payingBonusId === r.id ? "Касса…" : "Выплатить из кассы"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-[var(--border)]/60 pt-4 text-xs text-[var(--muted)]">
              Пока нет начислений премии.
            </p>
          )}
        </div>
      </details>

      <details className={DETAILS_CARD}>
        <summary className="cursor-pointer list-none">
          <h2 className="text-base font-semibold text-[var(--text)]">Разовый расход по сотруднику</h2>
        </summary>
        <div className="mt-3 border-t border-[var(--border)]/60 pt-3 text-sm text-[var(--muted)]">
          <p className="mb-3 text-xs leading-relaxed">
            Непредвиденные выплаты (например мелкий ремонт). Проводка в кассе с привязкой к сотруднику в комментарии.
          </p>
          <Link href={cashLinkExpense} className="btn-secondary inline-flex px-4 py-2 text-sm font-medium no-underline">
            Открыть кассу - расход
          </Link>
        </div>
      </details>

      <section className="card mb-3">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Касса по сотруднику</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            Плюс: {formatVnd(cashInTotal)}
          </div>
          <div className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">
            Минус: {formatVnd(cashOutTotal)}
          </div>
        </div>
        <input
          type="search"
          value={cashSearch}
          onChange={(e) => setCashSearch(e.target.value)}
          placeholder="Поиск по выплатам и операциям…"
          className="field-surface mt-3 w-full rounded-xl px-3 py-2.5 text-sm"
        />
        {cashRowsFiltered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Пока нет строк в кассе с участием сотрудника.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {cashRowsFiltered.map((r, i) => (
              <li
                key={`${r.at}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-1 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 text-[var(--text)]">{r.summary}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted2)]">
                  {new Date(r.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span
                  className={`shrink-0 text-right text-base font-semibold tabular-nums ${
                    r.direction === "in" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {r.direction === "in" ? "+" : "−"}
                  {formatVnd(r.amountVnd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className={DETAILS_CARD}>
        <summary className="cursor-pointer list-none">
          <h2 className="text-base font-semibold text-[var(--text)]">Полный расчёт</h2>
        </summary>
        <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
          {employee.managerFullSettlement ? (
            <>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Сначала сдайте в кассу наличные, принятые по броням; затем оформляется выплата процента с прайса по броням и
                прибыли с билетов. Оценка заработка не вычитает уже выплаченное без отдельного учёта в кассе.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-sm)] border border-amber-200/80 bg-amber-50/90 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/35">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                    1. Наличные по броням к сдаче (сначала)
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                    {formatVnd(employee.managerFullSettlement.cashToHandInFromBookingsVnd)}
                  </div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                    2. Процент с прайса (брони, {employee.managerFullSettlement.salesCommissionPercent}%)
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                    {formatVnd(employee.managerFullSettlement.commissionFromBookingsVnd)}
                  </div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                    Билеты (официальный магазин)
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                    {formatVnd(employee.managerFullSettlement.ticketProfitAllTimeVnd)}
                  </div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                    Итого заработок (оценка)
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                    {formatVnd(employee.managerFullSettlement.commissionTotalEstimateVnd)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                  Оценка после сдачи наличных по броням
                </div>
                <p className="mt-2 text-sm leading-snug text-[var(--text)]">{managerNetSettlementText}</p>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                Ниже - подотчёт и начисления гиду в CRM (отдельно от денег по броням менеджера).
              </p>
            </>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                {employee.managerFullSettlement ? "Подотчёт - должен сотрудник" : "Сотрудник должен компании (подотчёт)"}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                {formatVnd(employee.shouldReturnVnd)}
              </div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                {employee.managerFullSettlement
                  ? "Начисления в CRM - компания должна"
                  : "Компания должна сотруднику (начисления)"}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)] sm:text-2xl">
                {formatVnd(employee.shouldReceiveVnd)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              {employee.managerFullSettlement
                ? "Итог по подотчёту и начислениям в CRM"
                : "Итог «на сегодня» по этим двум строкам"}
            </div>
            <p className="mt-2 text-sm leading-snug text-[var(--text)]">
              {netSettlementVnd > 0 && (
                <>
                  К выплате сотруднику: <span className="font-semibold tabular-nums">{formatVnd(netSettlementVnd)}</span>
                </>
              )}
              {netSettlementVnd < 0 && (
                <>
                  К внесению от сотрудника в кассу:{" "}
                  <span className="font-semibold tabular-nums">{formatVnd(-netSettlementVnd)}</span>
                </>
              )}
              {netSettlementVnd === 0 && <>По этим двум показателям взаимные требования совпадают.</>}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-4 py-2 text-sm font-medium" onClick={() => confirmFullSettlement()}>
              Рассчитать
            </button>
          </div>

          {employee.pendingSalaryRecords.length > 0 ? (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Очередь начислений к выплате</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Отметка «выплачено» проводит движение в журнале кассы.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <select
                  className="field-surface min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-sm sm:min-w-[240px]"
                  value={salaryRecordId}
                  onChange={(e) => setSalaryRecordId(e.target.value)}
                  disabled={busy}
                >
                  {employee.pendingSalaryRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tourName ?? r.tourId} · {formatVnd(r.amountVnd)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary shrink-0 disabled:opacity-50"
                  disabled={!salaryRecordId || busy}
                  onClick={() => void payout()}
                >
                  Отметить выплату
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">Очередь пуста.</p>
          )}
        </div>
      </details>
    </>
  );
}
