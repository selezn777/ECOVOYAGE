import { getTranslations } from "next-intl/server";
import type { ManagerBookingAnalytics } from "@/lib/types";

function SegmentBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-1">
        <span className="text-[12px] text-[var(--text)]">{label}</span>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">{count} · {pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export async function ManagerAnalyticsPanel({ analytics }: { analytics: ManagerBookingAnalytics }) {
  const { segments, peakHours, totalBookings } = analytics;
  const maxHour = peakHours[0]?.count ?? 1;
  const t = await getTranslations("salesAnalytics");

  return (
    <section className="card mb-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
        {t("title", { count: totalBookings })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Сегменты */}
        <div>
          <div className="mb-2 text-[11px] font-medium text-[var(--muted2)]">{t("segmentsTitle")}</div>
          <div className="space-y-2">
            <SegmentBar label={t("segments.single")} count={segments.single} total={totalBookings} color="bg-sky-400 dark:bg-sky-500" />
            <SegmentBar label={t("segments.couple")} count={segments.couple} total={totalBookings} color="bg-violet-400 dark:bg-violet-500" />
            <SegmentBar label={t("segments.family")} count={segments.family} total={totalBookings} color="bg-[var(--accent)]" />
            <SegmentBar label={t("segments.group")} count={segments.group} total={totalBookings} color="bg-emerald-500" />
          </div>
        </div>

        {/* Пиковые часы */}
        <div>
          <div className="mb-2 text-[11px] font-medium text-[var(--muted2)]">{t("peakHoursTitle")}</div>
          {peakHours.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">{t("noData")}</p>
          ) : (
            <div className="space-y-1.5">
              {peakHours.map(({ hour, count }) => (
                <div key={hour} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[12px] tabular-nums text-[var(--muted2)]">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                  <div className="flex-1 overflow-hidden rounded-full bg-[var(--surface-elevated)]" style={{ height: 8 }}>
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.round((count / maxHour) * 100)}%`, opacity: 0.7 + 0.3 * (count / maxHour) }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-[var(--muted)]">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
