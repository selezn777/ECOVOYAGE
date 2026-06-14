"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Role, TourBusAssignment, TourDispatcherBookingEntry } from "@/lib/types";
import { TourBusDriverBlock } from "@/components/tour-bus-driver-block";
import { TourDispatcherBookingPanel } from "@/components/tour-dispatcher-booking-panel";

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

/** Объединённый блок «Транспорт и букинг» для гида на туре - один компактный сворачиваемый блок. */
export function TourGuideTransportPanel({
  buses,
  tourId,
  viewerRole,
  canCopyBookingAddresses,
  showBooking,
  dispatcherBookingEntry,
  canEditDispatcherBooking,
  templateDispatcherNote,
}: {
  buses: TourBusAssignment[];
  tourId: string;
  viewerRole: Role;
  canCopyBookingAddresses: boolean;
  showBooking: boolean;
  dispatcherBookingEntry: TourDispatcherBookingEntry | null;
  canEditDispatcherBooking: boolean;
  templateDispatcherNote?: string | null;
}) {
  const t = useTranslations("tour");
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("transportAndBookingTitle")}</p>
      </div>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("busAndDriverTitle")}</p>
            <div className="mt-2">
              <TourBusDriverBlock
                buses={buses}
                tourId={tourId}
                viewerRole={viewerRole}
                canCopyBookingAddresses={canCopyBookingAddresses}
                embedInGroup
              />
            </div>
          </div>
          {showBooking ? (
            <div className="border-t border-[var(--border)] pt-3">
              <TourDispatcherBookingPanel
                tourId={tourId}
                entry={dispatcherBookingEntry}
                canEdit={canEditDispatcherBooking}
                noteTemplate={templateDispatcherNote ?? undefined}
                embedInGroup
                noOwnCollapse
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
