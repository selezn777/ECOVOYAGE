"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Preset = "day" | "month" | "all";

export function SalesPointPeriodControls({
  pointId,
  initialPreset,
  initialDay,
  initialMonth,
}: {
  pointId: string;
  initialPreset: Preset;
  initialDay: string;
  initialMonth: string;
}) {
  const t = useTranslations("salesPointsPage");
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const [day, setDay] = useState(initialDay);
  const [month, setMonth] = useState(initialMonth);

  const href = useMemo(() => {
    const q = new URLSearchParams();
    q.set("preset", preset);
    if (preset === "day" && day) q.set("day", day);
    if (preset === "month" && month) q.set("month", month);
    return `/sales-points/${encodeURIComponent(pointId)}?${q.toString()}`;
  }, [pointId, preset, day, month]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(["day", "month", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`btn-secondary px-3 py-1.5 text-xs ${preset === p ? "ring-2 ring-[var(--accent)]" : ""}`}
          >
            {p === "day" ? t("period.day") : p === "month" ? t("period.month") : t("period.allTime")}
          </button>
        ))}
      </div>
      {preset === "day" ? (
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="field-surface min-h-[40px] rounded-xl px-3 py-2 text-xs"
        />
      ) : null}
      {preset === "month" ? (
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="field-surface min-h-[40px] rounded-xl px-3 py-2 text-xs"
        />
      ) : null}
      <button type="button" onClick={() => router.push(href)} className="btn-primary px-3 py-1.5 text-xs">
        {t("period.apply")}
      </button>
    </div>
  );
}
