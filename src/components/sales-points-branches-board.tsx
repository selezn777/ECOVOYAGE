import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatVnd } from "@/lib/format";
import { salesStatusBadgeClass } from "@/lib/sales-point-status-ui";
import type { SalesPointRatingRow } from "@/lib/data";

export async function SalesPointsBranchesBoard({
  pointRows,
  addressByPointId,
  workingTodayByPointId,
  monthParam,
}: {
  pointRows: SalesPointRatingRow[];
  addressByPointId: Record<string, string | null>;
  workingTodayByPointId: Record<string, string[]>;
  monthParam: string;
}) {
  const t = await getTranslations("salesPointsPage");

  return (
    <section className="card mb-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("branchesBoard.title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("branchesBoard.hint")}</p>
      </div>
      {pointRows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("branchesBoard.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pointRows.map((row) => {
            const pointId = row.pointId as string;
            const address = addressByPointId[pointId];
            const workingNames = workingTodayByPointId[pointId] ?? [];
            return (
              <Link
                key={pointId}
                href={`/sales-points/${encodeURIComponent(pointId)}?month=${monthParam}`}
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 transition hover:bg-[var(--surface)]"
              >
                <div className="text-sm font-semibold text-[var(--text)]">{row.pointName}</div>
                {address ? <p className="mt-0.5 text-[11px] text-[var(--muted2)]">{address}</p> : null}
                {workingNames.length > 0 ? (
                  <span className={`mt-2 ${salesStatusBadgeClass("point")}`}>
                    {t("branchesBoard.workingToday", { names: workingNames.join(", ") })}
                  </span>
                ) : (
                  <span className={`mt-2 ${salesStatusBadgeClass("none")}`}>{t("branchesBoard.freeToday")}</span>
                )}
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.revenue")}</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-[var(--text)]">{formatVnd(row.paymentsNetVndInPeriod)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.bookings")}</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-[var(--text)]">{row.bookingsOnToursInPeriod}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted2)]">{t("branchesBoard.rating")}</div>
                    <div className="mt-0.5 tabular-nums text-[var(--muted)]">
                      {row.managerRatingAvg != null ? `${row.managerRatingAvg} (${row.managerReviewsCount})` : "—"}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-[var(--accent)]">{t("branchesBoard.open")}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
