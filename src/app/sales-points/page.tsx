import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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
import { formatDateTimeShort, formatYmdWithWeekday, localDateString, tourBusinessTodayYmd } from "@/lib/scheduling";

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
  const t = await getTranslations("salesPointsPage");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  if (isDemoUser(user)) return <main className="app-wrap"><TopNav user={user} /><div className="card mt-4 text-center text-[var(--muted)] py-12">{tc("demoNotAvailable")}</div></main>;
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
    mode === "point" ? t("modes.point") : mode === "promo" ? t("modes.promo") : t("modes.online");
  const roleLabel = (role: string) => {
    if (role === "manager") return t("roles.manager");
    if (role === "chief_manager") return t("roles.chiefManager");
    if (role === "chief_guide") return t("roles.chiefGuide");
    if (role === "guide") return t("roles.guide");
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
        const pointName = pointRows.find((r) => r.pointId === pid)?.pointName ?? t("pointFallbackName");
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
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
      </header>

      <section className="card mb-4 space-y-3">
        <h2 className="text-base font-semibold">{t("assignSection.title")}</h2>
        <p className="text-xs text-[var(--muted)]">{t("assignSection.hint")}</p>
        <SalesPointAssignmentPanel
          salesStaff={salesStaff}
          managerDaysOffById={assignmentSnapshot.managerDaysOff}
          pointBusyDays={assignmentSnapshot.pointBusyDays}
          managerAssignmentsByDay={assignmentSnapshot.managerAssignmentsByDay}
        />
      </section>

      <section className="card mb-4">
        <h2 className="text-base font-semibold">{t("logSection.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("logSection.hint")}</p>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {workLog.efficiency.length === 0 ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2 lg:col-span-4">{t("logSection.empty")}</p>
          ) : (
            workLog.efficiency.map((e) => (
              <div
                key={`eff-${e.managerId}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"
              >
                <div className="text-sm font-semibold text-[var(--text)]">{e.managerName}</div>
                <div className="text-[11px] text-[var(--muted)]">{roleLabel(e.managerRole)}</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {t("stats.workDays")} <span className="font-semibold text-[var(--text)]">{e.assignedDays}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {t("stats.bookingsOnAssignedDays")}{" "}
                  <span className="font-semibold text-[var(--text)]">{e.bookingsOnAssignedDays}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {t("stats.paymentsMoney")}{" "}
                  <span className="font-semibold text-[var(--text)]">{formatVnd(e.paymentsNetOnAssignedDaysVnd)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 space-y-2">
          {workLog.rows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{t("logSection.logEmpty")}</p>
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
                  {t("logRow.workDate")} <span className="font-semibold">{row.openedOn}</span>
                </div>
                {row.workMode === "point" ? (
                  <div className="text-xs text-[var(--text)]">
                    {t("logRow.point")} <span className="font-semibold">{row.pointName ?? "—"}</span>
                  </div>
                ) : null}
                {row.workMode === "promo" ? (
                  <div className="text-xs text-[var(--text)]">
                    {t("logRow.promoLocation")} <span className="font-semibold">{row.promoPlace || "—"}</span>
                  </div>
                ) : null}
                {row.workMode === "online" ? (
                  <div className="text-xs text-[var(--text)]">
                    {t("logRow.channel")} <span className="font-semibold">{row.onlineChannel || "—"}</span>
                    {" · "}{t("logRow.traffic")}{" "}
                    <span className="font-semibold">{row.onlineTrafficSource === "office" ? t("logRow.trafficOffice") : t("logRow.trafficOwn")}</span>
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-[var(--muted)]">
                  {t("logRow.assignedAt")}{" "}
                  {row.confirmedAt ? formatDateTimeShort(row.confirmedAt, locale) : t("logRow.noTime")}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card mb-4">
        <h2 className="text-base font-semibold">{t("coverageSection.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("coverageSection.hint")}</p>

        <div className="mt-3 space-y-2">
          {uncoveredByDay.map((d) => (
            <div key={`gap-${d.day}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
              <div className="text-sm font-semibold text-[var(--text)]">{formatYmdWithWeekday(d.day, locale)}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {t("coverageSection.emptyPoints")}{" "}
                <span className="font-semibold text-[var(--text)]">
                  {d.missingPoints.length > 0 ? d.missingPoints.join(", ") : t("coverageSection.noEmpty")}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {t("coverageSection.unassignedEmployees")}{" "}
                <span className="font-semibold text-[var(--text)]">
                  {d.unassignedManagers.length > 0 ? d.unassignedManagers.join(", ") : t("coverageSection.allAssigned")}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[920px] w-full border-collapse text-xs">
            <thead className="bg-[var(--surface-soft)] text-[var(--muted2)]">
              <tr>
                <th className="px-2 py-2 text-left">{t("table.employee")}</th>
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
                            {t("dayOff")}
                          </span>
                        </td>
                      );
                    }
                    if (!status) {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-rose-300/60 bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200">
                            {t("badges.notAssigned")}
                          </span>
                        </td>
                      );
                    }
                    if (status.workMode === "point") {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-sky-300/60 bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-200">
                            {t("badges.pointLabel", { name: status.pointName ?? "—" })}
                          </span>
                        </td>
                      );
                    }
                    if (status.workMode === "promo") {
                      return (
                        <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                          <span className="inline-flex rounded-md border border-fuchsia-300/60 bg-fuchsia-50 px-2 py-1 text-[11px] text-fuchsia-800 dark:border-fuchsia-400/40 dark:bg-fuchsia-900/30 dark:text-fuchsia-200">
                            {t("badges.promoLabel", { place: status.promoPlace || t("badges.promoLocationMissing") })}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={`${m.id}-${d}`} className="px-2 py-2 align-top">
                        <span className="inline-flex rounded-md border border-emerald-300/60 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200">
                          {t("badges.onlineLabel", { channel: status.onlineChannel || t("badges.onlineChannelMissing") })}
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

      <h2 className="mb-3 text-base font-semibold text-[var(--text)]">{t("pointsList.title")}</h2>
      <div className="space-y-3">
        {pointRows.length === 0 ? (
          <section className="card text-sm text-[var(--muted)]">{t("pointsList.empty")}</section>
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
                    ? t("pointsList.managersAssigned", { n: row.managers.length })
                    : t("pointsList.noManagersAssigned")}
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--accent)]">{t("pointsList.openReport")}</p>
              </Link>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
