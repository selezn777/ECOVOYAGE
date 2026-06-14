"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TourHandoverPersonEntry } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { ManagerTourCashModal } from "@/components/manager-tour-cash-modal";

type Props = {
  tourId: string;
  tourName: string;
  managers: TourHandoverPersonEntry[];
  outstandingVnd: number;
  handedVnd: number;
  /** true = сегодняшняя вкладка (показывать "сдал" / "принято сегодня") */
  isToday?: boolean;
};

const RoleBadgeAmber = () => {
  const t = useTranslations("cashHandover");
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      {t("roleManager")}
    </span>
  );
};

export function AccountingPendingManagers({ tourId, tourName, managers, outstandingVnd, handedVnd, isToday }: Props) {
  const router = useRouter();
  const t = useTranslations("cashHandover");
  const [modalOpen, setModalOpen] = useState(false);

  if (!managers.length) return null;

  const hasPending = outstandingVnd > 0;
  const done = handedVnd > 0 && !hasPending;
  const partial = handedVnd > 0 && hasPending;

  const primary = managers[0]!;
  const others = managers.slice(1);

  return (
    <>
      <li className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RoleBadgeAmber />
            <span className="text-[13px] font-medium text-[var(--text)]">{primary.managerName}</span>
            {others.length > 0 ? (
              <span className="text-[11px] text-[var(--muted)]">
                {others.map((m) => m.managerName).join(", ")}
              </span>
            ) : null}
            {done ? (
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                {t("handed")}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 pl-0.5 text-[11px] tabular-nums text-[var(--muted)]">
            {hasPending ? (
              <span className="text-amber-800 dark:text-amber-200">
                {t("pending")} {formatVnd(outstandingVnd)}
                {partial ? (
                  <span className="ml-1 text-emerald-700 dark:text-emerald-300">
                    · {t("accepted")}{isToday ? ` ${t("today")} ` : " "}{formatVnd(handedVnd)}
                  </span>
                ) : null}
              </span>
            ) : done ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                {t("accepted")}{isToday ? ` ${t("today")} ` : " "}{formatVnd(handedVnd)}
              </span>
            ) : (
              <span>{t("noDebt")}</span>
            )}
          </div>
        </div>
        {hasPending ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 rounded-xl bg-amber-600/12 px-3 py-2 text-[12px] font-semibold text-amber-900 ring-1 ring-amber-300/60 hover:bg-amber-600/22 dark:text-amber-200 dark:ring-amber-700/50"
          >
            {t("accept")}
          </button>
        ) : done ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
          >
            {t("open")}
          </button>
        ) : null}
      </li>

      {modalOpen ? (
        <ManagerTourCashModal
          open
          tourId={tourId}
          tourName={tourName}
          suggestedManagerId={primary.managerId}
          suggestedManagerName={primary.managerName}
          onClose={() => setModalOpen(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
