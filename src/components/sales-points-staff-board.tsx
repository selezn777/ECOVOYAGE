import { getTranslations } from "next-intl/server";
import { formatVnd } from "@/lib/format";
import { salesDayKind, salesStatusBadgeClass, type SalesDayAssignment } from "@/lib/sales-point-status-ui";
import type { SalesPointWorkLogEfficiency } from "@/lib/data";
import type { Role, RosterUser } from "@/lib/types";

export async function SalesPointsStaffBoard({
  salesStaff,
  todayYmd,
  next14Days,
  managerAssignmentsByDay,
  managerDaysOff,
  efficiency,
}: {
  salesStaff: RosterUser[];
  todayYmd: string;
  next14Days: string[];
  managerAssignmentsByDay: Record<string, Record<string, SalesDayAssignment>>;
  managerDaysOff: Record<string, string[]>;
  efficiency: SalesPointWorkLogEfficiency[];
}) {
  const t = await getTranslations("salesPointsPage");
  const effByManager = new Map(efficiency.map((e) => [e.managerId, e]));

  const roleLabel = (role: Role) => {
    if (role === "manager") return t("roles.manager");
    if (role === "chief_manager") return t("roles.chiefManager");
    if (role === "chief_guide") return t("roles.chiefGuide");
    if (role === "guide") return t("roles.guide");
    if (role === "director") return t("roles.director");
    return role;
  };

  return (
    <section className="card mb-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("staffBoard.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("staffBoard.hint")}</p>
      </div>
      {salesStaff.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("staffBoard.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {salesStaff.map((m) => {
            const todayAssignment = managerAssignmentsByDay[m.id]?.[todayYmd];
            const offDays = new Set(managerDaysOff[m.id] ?? []);
            const kind = salesDayKind(todayAssignment, offDays.has(todayYmd));
            const eff = effByManager.get(m.id);
            const upcomingOffCount = next14Days.filter((d) => offDays.has(d)).length;

            let statusLabel: string;
            if (kind === "point") {
              statusLabel = t("staffBoard.statusPoint", { name: todayAssignment?.pointName || t("pointFallbackName") });
            } else if (kind === "promo") {
              statusLabel = t("staffBoard.statusPromo", {
                place: todayAssignment?.promoPlace || t("staffBoard.placeMissing"),
              });
            } else if (kind === "online") {
              statusLabel = t("staffBoard.statusOnline", {
                channel: todayAssignment?.onlineChannel || t("staffBoard.channelMissing"),
              });
            } else if (kind === "off") {
              statusLabel = t("staffBoard.statusOff");
            } else {
              statusLabel = t("staffBoard.statusNone");
            }

            return (
              <div key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text)]">{m.fullName}</div>
                  <span className="text-[11px] text-[var(--muted2)]">{roleLabel(m.role)}</span>
                </div>
                <span className={`mt-2 ${salesStatusBadgeClass(kind)}`}>{statusLabel}</span>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {t("staffBoard.periodStats", {
                    days: eff?.assignedDays ?? 0,
                    bookings: eff?.bookingsOnAssignedDays ?? 0,
                    amount: formatVnd(eff?.paymentsNetOnAssignedDaysVnd ?? 0),
                  })}
                </div>
                <div className="mt-1 text-[11px] text-[var(--muted2)]">
                  {t("staffBoard.upcomingOff", { n: upcomingOffCount })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
