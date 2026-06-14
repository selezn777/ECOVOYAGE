"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DeletedBookingItem } from "@/lib/types";

export function DeletedRestoreList({ items }: { items: DeletedBookingItem[] }) {
  const t = useTranslations("common");
  const tD = useTranslations("deleted");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function restore(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/deleted/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || tD("restoreError"));
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : tD("restoreErrorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  if (!items.length) {
    return (
      <section className="card text-sm text-[var(--muted)]">{t("noDeletedBookings")}</section>
    );
  }

  return (
    <section className="space-y-2">
      {items.map((item) => (
        <article className="card" key={item.id}>
          <div className="text-sm font-medium">{item.customerName}</div>
          <div className="text-xs text-[var(--muted2)]">{tD("bookingLabel")}: {item.entityId} · {tD("tourLabel")}: {item.tourId}</div>
          <div className="text-xs text-[var(--muted2)]">{tD("restoreUntil")}: {new Date(item.restoreUntil).toLocaleString("ru-RU")}</div>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => restore(item.id)}
            className="mt-2 rounded-lg bg-[var(--surface-soft)] px-3 py-1 text-sm text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            {busyId === item.id ? t("restoring") : t("restore")}
          </button>
        </article>
      ))}
    </section>
  );
}
