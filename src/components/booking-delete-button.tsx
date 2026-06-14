"use client";

import { DELETED_PAGE_ROLES } from "@/lib/role-policy";
import { showConfirm } from "@/lib/ui-dialog";
import type { Role } from "@/lib/types";

type Props = {
  bookingId: string;
  viewerRole: Role;
  customerName?: string;
  tourDateYmd?: string;
};

export function BookingDeleteButton({ bookingId, viewerRole, customerName, tourDateYmd }: Props) {
  async function onDelete() {
    const officeCanRestore = DELETED_PAGE_ROLES.includes(viewerRole);

    const who = customerName ? `«${customerName}»` : "эту бронь";
    const when = tourDateYmd ? ` (тур ${tourDateYmd})` : "";
    const restoreNote = officeCanRestore
      ? "\n\nВ течение часа можно восстановить в разделе «Удалённые»."
      : "\n\nВосстановить сможет офис (директор, главный менеджер, бухгалтерия).";

    const confirmed = await showConfirm(`Удалить туриста ${who}${when}?${restoreNote}`);
    if (!confirmed) return;

    const res = await fetch(`/api/bookings/${bookingId}/delete`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      const msg = (json as { error?: string }).error || "Не удалось удалить";
      if (res.status === 404) {
        // Уже удалено — просто обновляем страницу
        window.location.reload();
        return;
      }
      alert(msg);
      return;
    }
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      className="inline-flex min-h-10 w-full items-center justify-center rounded-[10px] border border-red-300/80 bg-red-50 px-3 text-[13px] font-medium text-red-800 transition-[transform,filter] hover:brightness-[1.03] active:scale-[0.99] dark:border-red-400/40 dark:bg-red-900/30 dark:text-red-200"
    >
      Удалить
    </button>
  );
}
