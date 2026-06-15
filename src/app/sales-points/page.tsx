import { getTranslations } from "next-intl/server";
import { SalesPointAssignmentPanel } from "@/components/sales-point-assignment-panel";
import { SalesPointsBranchesBoard } from "@/components/sales-points-branches-board";
import { SalesPointsStaffBoard } from "@/components/sales-points-staff-board";
import { SalesPointsWeekGrid } from "@/components/sales-points-week-grid";
import { TopNav } from "@/components/top-nav";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import {
  getSalesPointAssignmentSnapshot,
  getSalesPointRatingReport,
  getSalesPointWorkLog,
  listRentalPoints,
  listTeamRoster,
} from "@/lib/data";
import { parseFinancePeriodFromSearchParam } from "@/lib/finance-period";
import { SALES_POINT_LEADERSHIP_ROLES } from "@/lib/role-policy";
import { localDateString, nextDaysYmd, tourBusinessTodayYmd } from "@/lib/scheduling";

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

  const todayYmd = tourBusinessTodayYmd();
  const next7Days = nextDaysYmd(todayYmd, 7);
  const next14Days = nextDaysYmd(todayYmd, 14);

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

  const rentalPoints = await listRentalPoints();
  const addressByPointId: Record<string, string | null> = {};
  for (const p of rentalPoints) addressByPointId[p.id] = p.addressNote;

  const workingTodayByPointId: Record<string, string[]> = {};
  for (const m of salesStaff) {
    const todayAssignment = assignmentSnapshot.managerAssignmentsByDay[m.id]?.[todayYmd];
    if (todayAssignment?.mode === "point" && todayAssignment.pointId) {
      const list = workingTodayByPointId[todayAssignment.pointId] ?? [];
      list.push(m.fullName);
      workingTodayByPointId[todayAssignment.pointId] = list;
    }
  }

  const monthParam = `${period.year}-${String(period.month).padStart(2, "0")}`;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <header className="mb-4">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("subtitle")}</p>
      </header>

      <SalesPointsStaffBoard
        salesStaff={salesStaff}
        todayYmd={todayYmd}
        next14Days={next14Days}
        managerAssignmentsByDay={assignmentSnapshot.managerAssignmentsByDay}
        managerDaysOff={assignmentSnapshot.managerDaysOff}
        efficiency={workLog.efficiency}
      />

      <SalesPointsBranchesBoard
        pointRows={pointRows}
        addressByPointId={addressByPointId}
        workingTodayByPointId={workingTodayByPointId}
        monthParam={monthParam}
      />

      <SalesPointsWeekGrid
        salesStaff={salesStaff}
        next7Days={next7Days}
        managerAssignmentsByDay={assignmentSnapshot.managerAssignmentsByDay}
        managerDaysOff={assignmentSnapshot.managerDaysOff}
      />

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
    </main>
  );
}
