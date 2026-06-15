import { getLocale, getTranslations } from "next-intl/server";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { salesDayKind, salesStatusCellClass, type SalesDayAssignment } from "@/lib/sales-point-status-ui";
import type { RosterUser } from "@/lib/types";

export async function SalesPointsWeekGrid({
  salesStaff,
  next7Days,
  managerAssignmentsByDay,
  managerDaysOff,
}: {
  salesStaff: RosterUser[];
  next7Days: string[];
  managerAssignmentsByDay: Record<string, Record<string, SalesDayAssignment>>;
  managerDaysOff: Record<string, string[]>;
}) {
  const t = await getTranslations("salesPointsPage");
  const locale = await getLocale();

  const shortLabel = (assignment: SalesDayAssignment | undefined, kind: ReturnType<typeof salesDayKind>) => {
    switch (kind) {
      case "point":
        return assignment?.pointName || t("pointFallbackName");
      case "promo":
        return t("weekGrid.shortPromo");
      case "online":
        return t("weekGrid.shortOnline");
      case "off":
        return t("weekGrid.shortOff");
      default:
        return t("weekGrid.shortFree");
    }
  };

  return (
    <section className="card mb-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("weekGrid.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("weekGrid.hint")}</p>
      </div>
      {salesStaff.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("staffBoard.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="text-left text-[11px] font-medium text-[var(--muted2)]">{t("weekGrid.employee")}</th>
                {next7Days.map((d) => (
                  <th key={d} className="min-w-[88px] text-center text-[11px] font-medium text-[var(--muted2)]">
                    {formatYmdWithWeekday(d, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesStaff.map((m) => {
                const offDays = new Set(managerDaysOff[m.id] ?? []);
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap pr-2 text-sm font-medium text-[var(--text)]">{m.fullName}</td>
                    {next7Days.map((d) => {
                      const assignment = managerAssignmentsByDay[m.id]?.[d];
                      const kind = salesDayKind(assignment, offDays.has(d));
                      return (
                        <td key={d}>
                          <span
                            className={`${salesStatusCellClass(kind)} truncate`}
                            title={kind === "point" ? assignment?.pointName ?? undefined : undefined}
                          >
                            {shortLabel(assignment, kind)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
