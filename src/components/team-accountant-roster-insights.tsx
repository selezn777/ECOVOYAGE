"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { RosterUser } from "@/lib/types";

function isManager(r: RosterUser): boolean {
  return r.role === "manager" || r.role === "chief_manager";
}

function isGuide(r: RosterUser): boolean {
  return r.role === "guide" || r.role === "chief_guide";
}

export function TeamAccountantRosterInsights({
  rows,
  salesPointsTotal = 0,
}: {
  rows: RosterUser[];
  salesPointsTotal?: number;
}) {
  const t = useTranslations("team");
  const stats = useMemo(() => {
    let managers = 0;
    let guides = 0;
    let managersOff = 0;
    let guidesOff = 0;
    const rentalPointIds = new Set<string>();
    let salesPointsInWorkByAssignments = 0;

    for (const r of rows) {
      if (isManager(r)) {
        managers += 1;
        if (r.offToday) managersOff += 1;
      }
      if (isGuide(r)) {
        guides += 1;
        if (r.offToday) guidesOff += 1;
      }
      if (r.rentalPointId) rentalPointIds.add(r.rentalPointId);
      if (r.rentalPointId && isManager(r) && !r.offToday) salesPointsInWorkByAssignments += 1;
    }

    return {
      total: rows.length,
      managers,
      guides,
      managersOff,
      guidesOff,
      salesPointsAssigned: rentalPointIds.size,
      salesPointsInWorkByAssignments,
    };
  }, [rows]);

  const salesPointsShownTotal = Math.max(salesPointsTotal, stats.salesPointsAssigned);
  const managersInWork = Math.max(0, stats.managers - stats.managersOff);
  const guidesInWork = Math.max(0, stats.guides - stats.guidesOff);
  // В рабочей операционной модели точка считается "в работе" каждый день;
  // если явных назначений на сегодня нет, показываем все активные точки.
  const salesPointsInWork =
    salesPointsShownTotal > 0 ? Math.max(stats.salesPointsInWorkByAssignments, salesPointsShownTotal) : 0;
  const compactRows = [
    { label: t("summaryEmployees"), value: t("summaryEmployeesValue", { total: stats.total }) },
    {
      label: t("summaryManagers"),
      value: t("summaryInWorkOffTotal", { inWork: managersInWork, off: stats.managersOff, total: stats.managers }),
    },
    {
      label: t("summaryGuides"),
      value: t("summaryInWorkOffTotal", { inWork: guidesInWork, off: stats.guidesOff, total: stats.guides }),
    },
    {
      label: t("summarySalesPoints"),
      value: t("summarySalesPointsValue", { inWork: salesPointsInWork, total: salesPointsShownTotal }),
    },
  ];

  return (
    <details className="card mb-3">
      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[var(--text)] sm:px-4 sm:py-3.5 [&::-webkit-details-marker]:hidden">
        {t("summaryToggle")}
      </summary>
      <div className="border-t border-[var(--border)] px-3 py-3 sm:px-4">
        <ul className="space-y-2">
          {compactRows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-[var(--muted)]">{r.label}</span>
              <span className="font-semibold tabular-nums text-[var(--text)]">{r.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
