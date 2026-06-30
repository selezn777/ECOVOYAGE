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

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
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
