import { getTranslations } from "next-intl/server";
import { formatVnd } from "@/lib/format";
import { salesStatusBadgeClass, type SalesDayAssignment } from "@/lib/sales-point-status-ui";
import type { SalesPointRatingRow } from "@/lib/data";

export async function SalesPointsOnlineBoard({
  rows,
  todayYmd,
  managerAssignmentsByDay,
}: {
  rows: SalesPointRatingRow[];
  todayYmd: string;
  managerAssignmentsByDay: Record<string, Record<string, SalesDayAssignment>>;
}) {
  const t = await getTranslations("salesPointsPage");
  const managers = rows
    .flatMap((row) => row.managers)
    .map((m) => ({
      id: m.id,
      fullName: m.fullName,
      today: managerAssignmentsByDay[m.id]?.[todayYmd] ?? null,
      stats: m.modeStats.online,
    }))
    .filter((m) => m.stats.bookings > 0 || m.stats.paymentsNetVnd !== 0 || m.today?.mode === "online")
    .sort((a, b) => b.stats.paymentsNetVnd - a.stats.paymentsNetVnd || a.fullName.localeCompare(b.fullName, "ru"));

  const totalBookings = managers.reduce((sum, m) => sum + m.stats.bookings, 0);
  const totalRevenue = managers.reduce((sum, m) => sum + m.stats.paymentsNetVnd, 0);

  return (
    <section className="card mb-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("onlineBoard.title")}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("onlineBoard.hint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.revenue")}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{formatVnd(totalRevenue)}</div>
          </div>
          <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.bookings")}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{totalBookings}</div>
          </div>
        </div>
      </div>
      {managers.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("onlineBoard.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {managers.map((m) => {
            const todayOnline = m.today?.mode === "online";
            const channel = todayOnline ? m.today?.onlineChannel?.trim() || t("staffBoard.channelMissing") : null;
            const traffic =
              todayOnline && m.today?.onlineTrafficSource
                ? m.today.onlineTrafficSource === "office"
                  ? t("onlineBoard.officeTraffic")
                  : t("onlineBoard.ownTraffic")
                : null;
            return (
              <div key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{m.fullName}</div>
                  {todayOnline ? (
                    <span className={salesStatusBadgeClass("online")}>{t("onlineBoard.today")}</span>
                  ) : (
                    <span className={salesStatusBadgeClass("none")}>{t("staffBoard.statusNone")}</span>
                  )}
                </div>
                {channel ? (
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    {channel}
                    {traffic ? ` · ${traffic}` : ""}
                  </div>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.bookings")}</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-[var(--text)]">{m.stats.bookings}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.revenue")}</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-[var(--text)]">{formatVnd(m.stats.paymentsNetVnd)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
