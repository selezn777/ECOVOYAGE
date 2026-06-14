"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatVnd } from "@/lib/format";
import type { GuideCashHandoverAllToursPayload } from "@/lib/data";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";

export function TeamGuideSettleButton({
  guideId,
  guideName,
}: {
  guideId: string;
  guideName: string;
}) {
  const t = useTranslations("team");
  const tC = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GuideCashHandoverAllToursPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/guides/${guideId}/cash-handover-tours`);
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || tC("error"));
      setData(j as GuideCashHandoverAllToursPayload);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tC("error"));
    } finally {
      setLoading(false);
    }
  }

  const toursWithDebt = (data?.tours || []).filter((t) => t.guideOwesVnd > 0 || t.officeOwesVnd > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="btn-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? tC("loading") : t("settleWithGuide")}
      </button>

      {err ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

      {open && data ? (
        <div
          className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--text)]">{t("guideSettleTitle")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
              >
                {tC("close")}
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">{guideName}</p>

            {toursWithDebt.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("noGuideDebts")}</p>
            ) : (
              <ul className="space-y-2">
                {toursWithDebt.map((tour) => (
                  <li key={tour.tourId}>
                    <a
                      href={`/tours/${tour.tourId}/accounting?handover=guide`}
                      className="block rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-left no-underline hover:bg-[var(--surface-elevated)] transition-colors"
                    >
                      <div className="text-sm font-semibold text-[var(--text)]">{tour.tourName}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">{formatYmdWithWeekdayRu(tour.tourDate)}</div>
                      <div className="mt-1 text-sm font-medium tabular-nums">
                        {tour.guideOwesVnd > 0 ? (
                          <span className="text-amber-700 dark:text-amber-300">{t("guideOwes")} {formatVnd(tour.guideOwesVnd)}</span>
                        ) : (
                          <span className="text-sky-700 dark:text-sky-300">{t("officeOwes")} {formatVnd(tour.officeOwesVnd)}</span>
                        )}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
