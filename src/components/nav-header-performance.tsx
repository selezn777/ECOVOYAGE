"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";

type Snap = {
  salesCount: number | null;
  guideRatingAvg: number | null;
  guideReviewsCount: number | null;
  guideTripsCount: number | null;
  managerRatingAvg: number | null;
  managerReviewsCount: number | null;
};

const ROLES_WITH_BADGE: Role[] = ["guide", "chief_guide", "manager", "chief_manager"];

export function NavHeaderPerformance({ role }: { role: Role }) {
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    if (!ROLES_WITH_BADGE.includes(role)) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/me/performance", { credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as Snap;
      if (!cancelled && res.ok) setSnap(j);
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  if (!ROLES_WITH_BADGE.includes(role) || !snap) return null;

  if (role === "guide" || role === "chief_guide") {
    const trips = snap.guideTripsCount ?? 0;
    return (
      <p className="mt-1 text-[11px] font-semibold leading-snug text-[var(--text)]">
        Выездов: <span className="text-[var(--accent)]">{trips}</span>
      </p>
    );
  }

  const sales = snap.salesCount ?? 0;
  const ratingLine =
    snap.managerReviewsCount && snap.managerReviewsCount > 0 ? (
      <span className="text-[var(--accent)]">
        {" "}
        · ★ {snap.managerRatingAvg} ({snap.managerReviewsCount})
      </span>
    ) : null;

  return (
    <p className="mt-1 text-[11px] font-semibold leading-snug text-[var(--text)]">
      Продажи: <span className="text-[var(--accent)]">{sales}</span>
      {ratingLine}
    </p>
  );
}
