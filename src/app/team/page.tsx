import { getTranslations } from "next-intl/server";
import { TopNav } from "@/components/top-nav";
import { ManagerOffAdminForm } from "@/components/manager-off-admin-form";
import { TeamRosterClient } from "@/components/team-roster-client";
import { TeamUserCreateForm } from "@/components/team-user-create-form";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import { TEAM_PAGE_ROLES } from "@/lib/role-policy";
import { listRentalPoints, listTeamRoster } from "@/lib/data";
import {
  canAccessEmployeeFinanceCard,
  canCreateTeamAccount,
  canSetManagerSalesCommission,
  MANAGER_OFF_ADMIN_ROLES,
} from "@/lib/role-policy";
import { minManagerDayOffDateForChiefAction } from "@/lib/scheduling";

export default async function TeamPage() {
  const tC = await getTranslations("common");
  const tT = await getTranslations("team");
  const user = await requireRoles([...TEAM_PAGE_ROLES]);
  if (isDemoUser(user)) return <main className="app-wrap"><TopNav user={user} /><div className="card mt-4 text-center text-[var(--muted)] py-12">{tC("noData")}</div></main>;
  const canAdminManagerOff = MANAGER_OFF_ADMIN_ROLES.includes(user.role);
  const canCreateUsers = canCreateTeamAccount(user.role, user.baseRole);
  const canEditManagerCommission = canSetManagerSalesCommission(user.role);
  const showEmployeeFinanceCardLink = canAccessEmployeeFinanceCard(user.role);

  const teamRows = await listTeamRoster(user.role);
  const rentalPoints = await listRentalPoints();

  const hasContent = teamRows.length > 0;
  const isAccountantView = user.role === "accountant";
  const canAdminGuideOff = user.role === "director" || user.role === "chief_guide";
  const managersForVacation = teamRows.filter((r) => r.role === "manager");
  const guidesForVacation = teamRows.filter((r) => r.role === "guide");
  const managersTotal = teamRows.filter((r) => r.role === "manager" || r.role === "chief_manager").length;
  const guidesTotal = teamRows.filter((r) => r.role === "guide" || r.role === "chief_guide").length;
  const inWork = teamRows.filter((r) => !r.offToday).length;
  const offToday = teamRows.length - inWork;
  const salesPointsInUse = new Set(teamRows.map((r) => r.rentalPointId).filter(Boolean)).size;

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      <section className="relative mb-4 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface)_56%,var(--accent-soft)_100%)] p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)] ring-1 ring-white/50 dark:ring-white/[0.04] sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent),#14b8a6,#38bdf8)]" />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-dark)]">
              EcoVoyage
            </div>
            <h1 className="mt-2 text-[28px] font-extrabold leading-none tracking-normal text-[var(--text)] sm:text-4xl">
              {tT("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-snug text-[var(--muted)]">
              {tT("summaryInWorkOffTotal", { inWork, off: offToday, total: teamRows.length })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[360px] sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/82 px-3 py-3 shadow-[var(--shadow-sm)]">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted2)]">{tT("summaryEmployees")}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{teamRows.length}</div>
            </div>
            <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50/70 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-cyan-900/45 dark:bg-cyan-950/25">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-cyan-700/80 dark:text-cyan-300">{tT("summaryManagers")}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-cyan-800 dark:text-cyan-100">{managersTotal}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200/75 bg-emerald-50/75 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-emerald-900/45 dark:bg-emerald-950/25">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300">{tT("summaryGuides")}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-800 dark:text-emerald-100">{guidesTotal}</div>
            </div>
            <div className="rounded-2xl border border-indigo-200/75 bg-indigo-50/75 px-3 py-3 shadow-[var(--shadow-sm)] dark:border-indigo-900/45 dark:bg-indigo-950/25">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-700/80 dark:text-indigo-300">{tT("summarySalesPoints")}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-indigo-800 dark:text-indigo-100">{salesPointsInUse}/{rentalPoints.length}</div>
            </div>
          </div>
        </div>
      </section>
      {canCreateUsers ? <TeamUserCreateForm sessionRole={user.role} baseRole={user.baseRole} /> : null}
      {(canAdminManagerOff || canAdminGuideOff) && (managersForVacation.length > 0 || guidesForVacation.length > 0) ? (
        <ManagerOffAdminForm
          managers={managersForVacation}
          guides={guidesForVacation}
          viewerRole={user.role}
          minDateForOthers={minManagerDayOffDateForChiefAction()}
        />
      ) : null}

      {hasContent ? (
        <TeamRosterClient
          rows={teamRows}
          salesPointsTotal={rentalPoints.length}
          currentUserId={user.id}
          viewerRole={user.role}
          enableManagerCommissionEdit={canEditManagerCommission && !isAccountantView}
          showEmployeeFinanceCardLink={showEmployeeFinanceCardLink}
          privacyListMode={isAccountantView}
        />
      ) : (
        <section className="card mb-3 text-sm text-[var(--muted)]">{tC("noData")}</section>
      )}
    </main>
  );
}
