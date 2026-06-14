import Link from "next/link";
import type { FinancePeriod } from "@/lib/types";
import { getFinancePeriodNavMeta, monthKey } from "@/lib/finance-period";

const pill =
  "rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]";
const pillAccent = "rounded-full bg-[var(--accent)] px-3 py-1.5 text-white";
const pillMuted = `${pill} hover:bg-[var(--surface-elevated)]`;

type BasePath = "/finance" | "/accounting";

function withExtraQuery(basePath: string, search: URLSearchParams): string {
  const s = search.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function FinancePeriodNav({
  period,
  basePath,
  extraQuery,
}: {
  period: FinancePeriod;
  basePath: BasePath;
  /** Доп. параметры (напр. вкладка списка туров у бухгалтера), сохраняются при смене месяца */
  extraQuery?: Record<string, string>;
}) {
  const { periodLabel, prev, next } = getFinancePeriodNavMeta(period);

  function qs(month: string | undefined): string {
    const p = new URLSearchParams();
    if (month !== undefined) p.set("month", month);
    if (extraQuery) {
      for (const [k, v] of Object.entries(extraQuery)) {
        if (v) p.set(k, v);
      }
    }
    return withExtraQuery(basePath, p);
  }

  return (
    <div className="action-row text-sm">
      {period.kind === "month" ? (
        <>
          <Link href={qs(monthKey(prev.year, prev.month))} className={pill}>
            Предыдущий месяц
          </Link>
          <span className="font-medium">{periodLabel}</span>
          <Link href={qs(monthKey(next.year, next.month))} className={pill}>
            Следующий месяц
          </Link>
        </>
      ) : (
        <span className="font-medium">Всё время</span>
      )}
      <Link href={qs(undefined)} className={period.kind === "month" ? pillMuted : pillAccent}>
        Текущий месяц
      </Link>
      <Link href={qs("all")} className={period.kind === "all" ? pillAccent : pillMuted}>
        Всё время
      </Link>
    </div>
  );
}
