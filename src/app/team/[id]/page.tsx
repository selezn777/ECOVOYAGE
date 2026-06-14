import { notFound } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { EmployeeFinanceCard } from "@/components/employee-finance-card";
import { ManagerAnalyticsPanel } from "@/components/manager-analytics-panel";
import { TeamCredentialsPanel } from "@/components/team-credentials-panel";
import { TeamManagerSettleButton } from "@/components/team-manager-settle-button";
import { TeamGuideSettleButton } from "@/components/team-guide-settle-button";
import { TeamDispatcherExpenseReviewButton } from "@/components/team-dispatcher-expense-review-button";
import { requireRoles, isDemoUser } from "@/lib/auth-session";
import {
  canManageEmployeePayrollTaxes,
  canPayEmployeeBonusFromCash,
  canManageTeamCredentials,
  canSetManagerSalesCommission,
  canViewEmployeeFinanceCardForTarget,
  canConfirmExpenseAccountantReview,
  EMPLOYEE_FINANCE_CARD_ACCESS_ROLES,
  ACCOUNTING_PANEL_ROLES,
} from "@/lib/role-policy";
import { getEmployeeFinanceCardData, parseGuideShopPeriodPreset, parseManagerCashPeriodPreset, getManagerBookingAnalytics } from "@/lib/data";

export default async function TeamEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cash_period?: string; shop_period?: string }>;
}) {
  const user = await requireRoles([...EMPLOYEE_FINANCE_CARD_ACCESS_ROLES]);
  if (isDemoUser(user)) return <main className="app-wrap"><div className="card mt-4 text-center text-[var(--muted)] py-12">Раздел недоступен в демо-режиме</div></main>;
  const { id } = await params;
  const sp = await searchParams;
  const managerCashPreset = parseManagerCashPeriodPreset(sp.cash_period);
  const guideShopPreset = parseGuideShopPeriodPreset(sp.shop_period);

  const employee = await getEmployeeFinanceCardData(id, { managerCashPreset, guideShopPreset });
  if (!employee) notFound();
  if (!canViewEmployeeFinanceCardForTarget(user.role, employee.employeeRole)) notFound();

  const isManagerRole = employee.employeeRole === "manager" || employee.employeeRole === "chief_manager";
  const bookingAnalytics = isManagerRole ? await getManagerBookingAnalytics(id) : null;

  const canSettle = ACCOUNTING_PANEL_ROLES.includes(user.role) || user.role === "director";
  const employeeIsManager =
    employee.employeeRole === "manager" || employee.employeeRole === "chief_manager";
  const employeeIsGuide = employee.employeeRole === "guide" || employee.employeeRole === "chief_guide";
  const employeeIsDispatcher =
    employee.employeeRole === "dispatcher" || employee.employeeRole === "booking_dispatcher";

  return (
    <main className="app-wrap app-wrap--wide">
      <TopNav user={user} />
      {canManageTeamCredentials(user.role, user.baseRole) ? (
        <TeamCredentialsPanel employeeId={id} employeeName={employee.employeeName} />
      ) : null}
      {canSettle && employeeIsManager ? (
        <div className="mb-3 flex justify-end">
          <TeamManagerSettleButton managerId={id} managerName={employee.employeeName} />
        </div>
      ) : null}
      {canSettle && employeeIsGuide ? (
        <div className="mb-3 flex justify-end">
          <TeamGuideSettleButton guideId={id} guideName={employee.employeeName} />
        </div>
      ) : null}
      {canConfirmExpenseAccountantReview(user.role) && employeeIsDispatcher ? (
        <div className="mb-3 flex justify-end">
          <TeamDispatcherExpenseReviewButton dispatcherId={id} dispatcherName={employee.employeeName} />
        </div>
      ) : null}
      {bookingAnalytics && bookingAnalytics.totalBookings > 0 ? (
        <ManagerAnalyticsPanel analytics={bookingAnalytics} />
      ) : null}
      <EmployeeFinanceCard
        employee={employee}
        viewerCanPayBonusFromCash={canPayEmployeeBonusFromCash(user.role)}
        viewerCanEditManagerCommission={canSetManagerSalesCommission(user.role)}
        viewerCanManagePayrollTaxes={canManageEmployeePayrollTaxes(user.role)}
        viewerRole={user.role}
      />
    </main>
  );
}

