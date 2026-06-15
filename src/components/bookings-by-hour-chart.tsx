import { getTranslations } from "next-intl/server";
import type { BookingsByHourRow } from "@/lib/data";

const WORK_HOURS = Array.from({ length: 16 }, (_, i) => i + 8);
const CHART_H = 110;
const CHART_W = 640;
const PAD_L = 28;
const PAD_R = 8;
const PAD_TOP = 22;
const PAD_BOT = 28;

function barX(i: number, n: number) {
  const w = (CHART_W - PAD_L - PAD_R) / n;
  return PAD_L + i * w + w * 0.1;
}
function barW(n: number) {
  return ((CHART_W - PAD_L - PAD_R) / n) * 0.8;
}
function barY(count: number, max: number) {
  if (max === 0) return PAD_TOP + CHART_H;
  return PAD_TOP + CHART_H - (count / max) * CHART_H;
}

// Топ-2 часа по категории
function topHours(rows: BookingsByHourRow[], key: keyof BookingsByHourRow, noDataLabel: string): string {
  const sorted = rows
    .filter(r => (r[key] as number ?? 0) > 0)
    .sort((a, b) => ((b[key] as number) ?? 0) - ((a[key] as number) ?? 0))
    .slice(0, 3);
  if (sorted.length === 0) return noDataLabel;
  return sorted.map(r => `${r.hour}:00`).join(", ");
}

function totalByKey(rows: BookingsByHourRow[], key: keyof BookingsByHourRow): number {
  return rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
}

export async function BookingsByHourChart({ rows }: { rows: BookingsByHourRow[] }) {
  const t = await getTranslations("salesAnalytics");
  const workRows = WORK_HOURS.map(h => rows.find(r => r.hour === h) ?? { hour: h, count: 0 });
  const max = Math.max(...workRows.map(r => r.count), 1);
  const total = workRows.reduce((s, r) => s + r.count, 0);
  const peakRow = workRows.reduce((a, b) => b.count > a.count ? b : a);
  const top3 = [...workRows].sort((a, b) => b.count - a.count).slice(0, 3).filter(r => r.count > 0);
  const n = workRows.length;
  const bw = barW(n);
  const gridVal = Math.round(max / 2);

  const noDataShort = t("noDataShort");
  const soloTotal  = totalByKey(workRows, "solo");
  const pairTotal  = totalByKey(workRows, "pair");
  const familyTotal = totalByKey(workRows, "family");
  const groupTotal = totalByKey(workRows, "group");

  return (
    <div>
      {/* Бар-чарт */}
      <svg viewBox={`0 0 ${CHART_W} ${PAD_TOP + CHART_H + PAD_BOT}`} className="w-full overflow-visible">
        {[gridVal, max].filter(v => v > 0).map(v => {
          const y = barY(v, max);
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="3,5" />
              <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--muted2)">{v}</text>
            </g>
          );
        })}
        <line x1={PAD_L} y1={PAD_TOP + CHART_H} x2={CHART_W - PAD_R} y2={PAD_TOP + CHART_H}
          stroke="var(--border)" strokeWidth="1" />
        {workRows.map((r, i) => {
          const x = barX(i, n);
          const y = barY(r.count, max);
          const h = PAD_TOP + CHART_H - y;
          const isPeak = r.hour === peakRow.hour;
          const isTop3 = top3.some(t => t.hour === r.hour);
          const color = isPeak
            ? "var(--accent)"
            : isTop3
            ? "color-mix(in srgb, var(--accent) 45%, var(--surface-elevated))"
            : "var(--surface-elevated)";
          return (
            <g key={r.hour}>
              <rect x={x} y={y} width={bw} height={Math.max(h, r.count > 0 ? 3 : 1)}
                rx="4" fill={color} opacity={r.count === 0 ? 0.3 : 1} />
              {isTop3 && r.count > 0 ? (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle"
                  fontSize={isPeak ? "11" : "10"} fontWeight="700"
                  fill={isPeak ? "var(--accent)" : "var(--muted)"}>
                  {r.count}{isPeak ? " ★" : ""}
                </text>
              ) : null}
              {r.hour % 2 === 0 ? (
                <text x={x + bw / 2} y={PAD_TOP + CHART_H + 17} textAnchor="middle"
                  fontSize="10" fill={isPeak ? "var(--accent)" : "var(--muted2)"}
                  fontWeight={isPeak ? "700" : "400"}>
                  {r.hour}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* Общая сводка */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("peakHour")}</div>
          <div className="mt-0.5 text-xl font-bold" style={{ color: "var(--accent)" }}>{peakRow.hour}:00</div>
          <div className="text-[11px] text-[var(--muted)]">{peakRow.count} {t("records")}</div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("top3Hours")}</div>
          <div className="mt-0.5 text-[12px] font-bold text-[var(--text)]">
            {top3.map(r => `${r.hour}:00`).join(" · ")}
          </div>
          <div className="text-[11px] text-[var(--muted)]">{top3.map(r => r.count).join(" / ")}</div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 ring-1 ring-[var(--border)]">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("total")}</div>
          <div className="mt-0.5 text-xl font-bold text-[var(--text)]">{total}</div>
          <div className="text-[11px] text-[var(--muted)]">{t("records")}</div>
        </div>
      </div>

      {/* 4 отдельных категории — каждая со своими часами */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text)]">{t("categories.solo.title")}</div>
          <div className="mt-1 text-[12px] font-bold text-[var(--text)]">{topHours(workRows, "solo", noDataShort)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t("categories.solo.hint", { count: soloTotal })}</div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text)]">{t("categories.pair.title")}</div>
          <div className="mt-1 text-[12px] font-bold text-[var(--text)]">{topHours(workRows, "pair", noDataShort)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t("categories.pair.hint", { count: pairTotal })}</div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text)]">{t("categories.family.title")}</div>
          <div className="mt-1 text-[12px] font-bold text-[var(--text)]">{topHours(workRows, "family", noDataShort)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t("categories.family.hint", { count: familyTotal })}</div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 ring-1 ring-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text)]">{t("categories.group.title")}</div>
          <div className="mt-1 text-[12px] font-bold text-[var(--text)]">{topHours(workRows, "group", noDataShort)}</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t("categories.group.hint", { count: groupTotal })}</div>
        </div>
      </div>
    </div>
  );
}
