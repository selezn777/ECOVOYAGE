import Link from "next/link";
import { SalesPointAssignmentPanel } from "@/components/sales-point-assignment-panel";
import { TopNav } from "@/components/top-nav";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import { formatVnd } from "@/lib/format";
import {
  getSalesPointAssignmentSnapshot,
  getSalesPointRatingReport,
  getSalesPointWorkLog,
  listTeamRoster,
} from "@/lib/data";
import { parseFinancePeriodFromSearchParam } from "@/lib/finance-period";
import { SALES_POINT_LEADERSHIP_ROLES } from "@/lib/role-policy";
import { formatYmdWithWeekdayRu, localDateString, tourBusinessTodayYmd } from "@/lib/scheduling";

function monthBoundsYmd(year: number, month: number): { fromYmd: string; toYmd: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0);
  return {
    fromYmd: `${year}-${pad(month)}-01`,
    toYmd: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
  };
}

export default async function SalesPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireRoles([...SALES_POINT_LEADERSHIP_ROLES]);
  if (isDemoUser(user)) return <main className="app-wrap"><TopNav user={user} /><div className="card mt-4 text-center text-[var(--muted)] py-12">Раздел недоступен в демо-режиме</div></main>;
  const sp = await searchParams;
  let period = parseFinancePeriodFromSearchParam(sp.month);
  if (period.kind === "all") {
    const t = tourBusinessTodayYmd();
    const y = Number(t.slice(0, 4));
    const m = Number(t.slice(5, 7));
    period = { kind: "month", year: y, month: m };
  }

  const { fromYmd, toYmd } = monthBoundsYmd(period.year, period.month);
  const rows = await getSalesPointRatingReport(fromYmd, toYmd);
  const pointRows = rows.filter((r) => Boolean(r.pointId));
  const roster = await listTeamRoster(user.role);
  const salesStaff = roster.filter((r) => r.role === "manager" || r.role === "director");
  const planFrom = localDateString();
  const planToDate = new Date(`${planFrom}T00:00:00`);
  planToDate.setDate(planToDate.getDate() + 90);
  const planTo = localDateString(planToDate);
  const assignmentSnapshot = await getSalesPointAssignmentSnapshot(
    salesStaff.map((r) => r.id),
    planFrom,
    planTo,
  );
  const workLog = await getSalesPointWorkLog(fromYmd, toYmd);
  const controlFrom = localDateString();
  const controlToDate = new Date(`${controlFrom}T00:00:00`);
  controlToDate.setDate(controlToDate.getDate() + 13);
  const controlTo = localDateString(controlToDate);
  const controlLog = await getSalesPointWorkLog(controlFrom, controlTo);
  const controlDays = (() => {
    const out: string[] = [];
    const cur = new Date(`${controlFrom}T00:00:00`);
    const end = new Date(`${controlTo}T00:00:00`);
    while (cur.getTime() <= end.getTime()) {
      out.push(localDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  })();

  const modeBadgeClass = (mode: "point" | "promo" | "online") => {
    if (mode === "point") return "border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200";
    if (mode === "promo") return "border-fuchsia-300/60 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-900/30 dark:text-fuchsia-200";
    return "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200";
  };
  const modeLabel = (mode: "point" | "promo" | "online") =>
    mode === "point" ? "Точка" : mode === "promo" ? "Промо" : "Онлайн";
  const roleLabel = (role: string) => {
    if (role === "manager") return "Менеджер";
    if (role === "chief_manager") return "Ст. менеджер";
    if (role === "chief_guide") return "Ст. гид";
    if (role === "guide") return "Гид";
    return role;
  };
  const controlByManagerDay = new Map<
    string,
    {
      workMode: "point" | "promo" | "online";
      pointId: string | null;
      pointName: string | null;
      promoPlace: string | null;
      onlineChannel: string | null;
    }
  >();
  for (const row of controlLog.rows) {
    const key = `${row.managerId}|${row.openedOn}`;
    if (controlByManagerDay.has(key)) continue;
    controlByManagerDay.set(key, {
      workMode: row.workMode,
      pointId: row.pointId,
      pointName: row.pointName,
      promoPlace: row.promoPlace,
      onlineChannel: row.onlineChannel,
    });
  }
  const offDaysByManager = new Map<string, Set<string>>();
  for (const m of salesStaff) {
    offDaysByManager.set(m.id, new Set(assignmentSnapshot.managerDaysOff[m.id] ?? []));
  }
  const pointIds = pointRows.map((p) => p.pointId as string).filter(Boolean);
  const uncoveredByDay = controlDays.map((day) => {
    const missingPoints: string[] = [];
    for (const pid of pointIds) {
      const hasCoverage = salesStaff.some((m) => {
        const st = controlByManagerDay.get(`${m.id}|${day}`);
        return st?.workMode === "point" && st.pointId === pid;
      });
      if (!hasCoverage) {
        const pointName = pointRows.find((r) => r.pointId === pid)?.pointName ?? "Точка";
        missingPoints.push(pointName);
      }
    }
    const unassignedManagers = salesStaff
      .filter((m) => {
        const offSet = offDaysByManager.get(m.id);
        if (offSet?.has(day)) return false;
        return !controlByManagerDay.has(`${m.id}|${day}`);
      })
      .map((m) => m.fullName);
    return { day, missingPoints, unassignedManagers };
  });

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <header className="mb-4">
        <h1 className="text-lg font-semibold">Точки продаж</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Сначала назначьте сотрудников отдела продаж на точки (учёт выходных обязателен), затем анализируйте сводку по
          точкам: продажи, деньги, рабочие дни и показатели по каждому менеджеру.
        </p>
      </header>

      <section className="card mb-4 space-y-3">
        <h2 className="text-base font-semibold">Сотрудники и назначение точек</h2>
        <p className="text-xs text-[var(--muted)]">
          Назначайте менеджера на 1-3 дня через календарь. Назначение блокируется, если в выбранный день у менеджера
          выходной или точка уже занята другим сотрудником.
        </p>
        <SalesPointAssignmentPanel
          salesStaff={salesStaff}
          managerDaysOffById={assignmentSnapshot.managerDaysOff}
          pointBusyDays={assignmentSnapshot.pointBusyDays}
          managerAssignmentsByDay={assignmentSnapshot.managerAssignmentsByDay}
        />
      </section>

      <section className="card mb-4">
        <h2 className="text-base font-semibold">Лог назначений и эффективность</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Журнал по выбранному периоду: кто, где и в каком режиме работал. Подсветка режима помогает быстро видеть
          распределение людей, а блок эффективности показывает итог по броням и денежному потоку на рабочих днях.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {workLog.efficiency.length === 0 ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2 lg:col-span-4">Назначений за период пока нет.</p>
          ) : (
            workLog.efficiency.map((e) => (
              <div
                key={`eff-${e.managerId}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"
              >
                <div className="text-sm font-semibold text-[var(--text)]">{e.managerName}</div>
                <div className="text-[11px] text-[var(--muted)]">{roleLabel(e.managerRole)}</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Рабочих дней: <span className="font-semibold text-[var(--text)]">{e.assignedDays}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Броней на назначенных днях:{" "}
                  <span className="font-semibold text-[var(--text)]">{e.bookingsOnAssignedDays}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Деньги по платежам:{" "}
                  <span className="font-semibold text-[var(--text)]">{formatVnd(e.paymentsNetOnAssignedDaysVnd)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 space-y-2">
          {workLog.rows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Лог пуст за выбранный период.</p>
          ) : (
            workLog.rows.slice(0, 220).map((row) => (
              <div
                key={`${row.managerId}-${row.openedOn}-${row.confirmedAt ?? "na"}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text)]">{row.managerName}</div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${modeBadgeClass(row.workMode)}`}>
                    {modeLabel(row.workMode)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--muted)]">{roleLabel(row.managerRole)}</div>
                <div className="mt-1 text-xs text-[var(--text)]">
                  Дата работы: <span className="font-semibold">{row.openedOn}</span>
                </div>
                {row.workMode === "point" ? (
                  <div className="text-xs text-[var(--text)]">
                    Точка: <span className="font-semibold">{row.pointName ?? "—"}</span>
                  </div>
                ) : null}
                {row.workMode === "promo" ? (
                  <div className="text-xs text-[var(--text)]">
                    Промо-локация: <span className="font-semibold">{row.promoPlace || "—"}</span>
                  </div>
                ) : null}
                {row.workMode === "online" ? (
                  <div className="text-xs text-[var(--text)]">
                    Канал: <span className="font-semibold">{row.onlineChannel || "—"}</span>
                    {" · "}Трафик:{" "}
                    <span className="font-semibold">{row.onlineTrafficSource === "office" ? "Офисный" : "Свой"}</span>
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-[var(--muted)]">
                  Назначено:{" "}
                  {row.confirmedAt
                    ? new Date(row.confirmedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                    : "без времени"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card mb-4">
        <h2 className="text-base font-semibold">Оперативный контроль покрытия (14 дней)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Один экран для быстрого дежурства: видно пустоты по точкам на даты, кто на выходном, кто уже назначен, а кто
          без назначения и требует доназначения или перевода в промо/онлайн.
        </p>

        <div className="mt-3 space-y-2">
          {uncoveredByDay.map((d) => (
            <div key={`gap-${d.day}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
              <div className="text-sm font-semibold text-[var(--text)]">{formatYmdWithWeekdayRu(d.day)}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Пустые точки:{" "}
                <span className="font-semibold text-[var(--text)]">
                  {d.missingPoints.length > 0 ? d.missingPoints.join(", ") : "нет пустот"}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                Неназначенные сотрудники:{" "}
                <span className="font-semibold text-[var(--text)]">
                  {d.unassignedManagers.length > 0 ? d.unassignedManagers.join(", ") : "все распределены"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[920px] w-full border-collapse text-xs">
            <thead className="bg-[var(--surface-soft)] text-[var(--muted2)]">
              <tr>
                <th className="px-2 py-2 text-left">Сотрудник</th>
                {controlDays.map((d) => (
                  <th key={`h-${d}`} className="px-2 py-2 text-left whitespace-nowrap">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesStaff.map((m) => (
                <tr key={`row-${m.id}`} className="border-t border-[var(--border)]">
                  <td className="px-2 py-2 align-top font-medium text-[var(--text)] whitespace-nowrap">{m.fullName}</td>
                  {controlDays.map((d) => {
                    const status = controlByManagerDay.get(`${m.id}|${d}`);
                    const isOff = offDaysByManager.get(m.id)?.has(d) ?? false;
                    if (isOff) {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200">
                            Выходной
                          </span>
                        </td>
                      );
                    }
                    if (!status) {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-rose-300/60 bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200">
                            Не назначен
                          </span>
                        </td>
                      );
                    }
                    if (status.workMode === "point") {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-sky-300/60 bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200">
                            Точка: {status.pointName ?? "—"}
                          </span>
                        </td>
                      );
                    }
                    if (status.workMode === "promo") {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-fuchsia-300/60 bg-fuchsia-50 px-2 py-1 text-[11px] text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-900/30 dark:text-fuchsia-200">
                            Промо: {status.promoPlace || "локация не указана"}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                        <span className="inline-flex rounded-md border border-emerald-300/60 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200">
                          Онлайн: {status.onlineChannel || "канал не указан"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Список точек продаж</h2>
      <div className="space-y-3">
        {pointRows.length === 0 ? (
          <section className="card text-sm text-[var(--muted)]">
            Нет точек в справочнике. Создайте турточку в разделе «Аренда» (бухгалтерия / диспетчер).
          </section>
        ) : (
          pointRows.map((row) => (
            <section
              key={row.pointId as string}
              className="card border-[var(--border)] bg-[var(--surface)] ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
            >
              <Link
                href={`/sales-points/${encodeURIComponent(row.pointId as string)}?month=${period.year}-${String(period.month).padStart(2, "0")}`}
                className="block rounded-xl p-1 transition hover:bg-[var(--surface-soft)]"
              >
                <div className="text-base font-semibold text-[var(--text)]">{row.pointName}</div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {row.managers.length > 0
                    ? `Менеджеров закреплено: ${row.managers.length}`
                    : "Менеджеры пока не закреплены"}
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--accent)]">Открыть отчёт по точке</p>
              </Link>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
