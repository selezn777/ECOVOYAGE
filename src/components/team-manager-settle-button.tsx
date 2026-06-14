"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ManagerTourCashModal } from "@/components/manager-tour-cash-modal";
import { formatVnd } from "@/lib/format";
import type { ManagerCashHandoverAllToursPayload, ManagerCashHandoverTourRow } from "@/lib/data";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";

export function TeamManagerSettleButton({
  managerId,
  managerName,
}: {
  managerId: string;
  managerName: string;
}) {
  const router = useRouter();
  const t = useTranslations("team");
  const tC = useTranslations("common");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<ManagerCashHandoverAllToursPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState<ManagerCashHandoverTourRow | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/managers/${managerId}/cash-handover-tours`);
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || tC("error"));
      setData(j as ManagerCashHandoverAllToursPayload);
      setPickerOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tC("error"));
    } finally {
      setLoading(false);
    }
  }

  const toursWithDebt = (data?.tours || []).filter((t) => t.outstandingOnTourVnd > 0);
  const total = data?.totalOutstandingVnd ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="btn-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? tC("loading") : t("settleWithManager")}
      </button>

      {err ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      {pickerOpen && data && !selectedTour ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">
                {t("managerDebtsTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                {tC("close")}
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">{managerName}</p>

            {toursWithDebt.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("noManagerDebts")}</p>
            ) : (
              <>
                <p className="mb-2 text-xs font-medium text-[var(--muted2)]">
                  {t("totalToHandover")} {formatVnd(total)}
                </p>
                <ul className="space-y-2">
                  {toursWithDebt.map((tourRow) => (
                    <li key={tourRow.tourId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTour(tourRow);
                          setPickerOpen(false);
                        }}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-left hover:bg-[var(--surface-elevated)] transition-colors"
                      >
                        <div className="text-sm font-semibold text-[var(--text)]">{tourRow.tourName}</div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          {formatYmdWithWeekdayRu(tourRow.tourDate)}
                        </div>
                        <div className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                          {t("toHandover")} {formatVnd(tourRow.outstandingOnTourVnd)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}

      {selectedTour ? (
        <ManagerTourCashModal
          open
          tourId={selectedTour.tourId}
          tourName={selectedTour.tourName}
          suggestedManagerId={managerId}
          suggestedManagerName={managerName}
          onClose={() => setSelectedTour(null)}
          onSaved={() => {
            setSelectedTour(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
