"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVnd } from "@/lib/format";

export function TourAccountingGuideTopupActions({
  pendingTopups,
}: {
  pendingTopups: Array<{ id: string; amountVnd: number; createdAt: string }>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!pendingTopups.length) {
    return <span className="text-[var(--muted2)]">-</span>;
  }

  async function confirm(paymentId: string) {
    setBusyId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}/confirm-remittance`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось подтвердить");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {pendingTopups.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-1">
          <span className="font-semibold tabular-nums text-amber-900 dark:text-amber-200">{formatVnd(p.amountVnd)}</span>
          {p.createdAt ? (
            <span className="text-[10px] text-[var(--muted2)]">
              {new Date(p.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
            </span>
          ) : null}
          <button
            type="button"
            disabled={busyId === p.id}
            onClick={() => void confirm(p.id)}
            className="rounded border border-green-700/40 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
          >
            {busyId === p.id ? "…" : "Принято в кассу"}
          </button>
        </div>
      ))}
    </div>
  );
}
