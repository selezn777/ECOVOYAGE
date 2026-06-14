import { getTranslations } from "next-intl/server";
import type { AccountingTourRow } from "@/lib/data";
import { listTodayTourHandoverCards } from "@/lib/data";
import { formatVnd } from "@/lib/format";
import { AccountingPendingManagers } from "@/components/accounting-pending-managers";

type Tab = "today" | "past" | "upcoming";

async function RoleBadge({ role }: { role: "guide" | "manager" | "dispatcher" }) {
  const t = await getTranslations("cashHandover");
  if (role === "guide")
    return (
      <span className="inline-flex shrink-0 items-center rounded-md bg-sky-100/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
        {t("roleTourguide")}
      </span>
    );
  if (role === "manager")
    return (
      <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        {t("roleManager")}
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-violet-100/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
      {t("roleDispatcher")}
    </span>
  );
}

export async function AccountingPendingHandovers({
  tourRows,
  todayYmd,
  tab,
}: {
  tourRows: AccountingTourRow[];
  todayYmd: string;
  tab: Tab;
}) {
  const t = await getTranslations("cashHandover");
  const tCommon = await getTranslations("common");

  const refYmd = tab === "today" ? todayYmd : null;
  const allCards = await listTodayTourHandoverCards(tourRows, refYmd);

  const cards = allCards.filter((c) => {
    if (tab === "upcoming") {
      return c.guide !== null || c.managers.length > 0 || c.dispatchers.length > 0;
    }
    if (tab === "past") {
      return (
        (c.guide && (c.guide.guideOwesVnd > 0 || c.guide.officeOwesVnd > 0)) ||
        c.managerOutstandingVnd > 0
      );
    }
    const guideHasAction = c.guide !== null && (c.guide.guideOwesVnd > 0 || c.guide.officeOwesVnd > 0 || c.guide.handedOverVnd > 0);
    const mgrHasAction = c.managerOutstandingVnd > 0 || c.managerHandedVnd > 0;
    return guideHasAction || mgrHasAction || c.guide !== null || c.managers.length > 0 || c.dispatchers.length > 0;
  });

  if (!cards.length) return null;

  const title =
    tab === "past" ? t("titlePast") : tab === "upcoming" ? t("titleUpcoming") : t("title");

  let totalPending = 0;
  if (tab === "today" || tab === "past") {
    for (const c of cards) {
      if (c.guide && c.guide.handedOverVnd === 0 && (c.guide.guideOwesVnd > 0 || c.guide.officeOwesVnd > 0)) totalPending++;
      if (c.managerOutstandingVnd > 0) totalPending++;
    }
  }

  const doneCards =
    tab === "today"
      ? cards.filter((c) => (c.guide?.handedOverVnd ?? 0) > 0 || c.managerHandedVnd > 0)
      : [];

  return (
    <section className="card mb-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--text)]">
          {title}
          {totalPending > 0 ? (
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
              {totalPending}
            </span>
          ) : null}
        </h2>
        {tab === "today" && totalPending === 0 && doneCards.length > 0 ? (
          <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">{t("allDone")}</span>
        ) : null}
        {tab === "upcoming" ? (
          <span className="text-[12px] text-[var(--muted)]">{tCommon("tourCount", { n: cards.length })}</span>
        ) : null}
      </div>

      <div className="space-y-3">
        {cards.map((card) => (
          <div key={card.tourId} className="overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
            {/* Tour header */}
            <a
              href={`/tours/${card.tourId}/accounting`}
              className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 hover:bg-[var(--surface-elevated)]"
            >
              <span className="text-[13px] font-semibold text-[var(--text)]">{card.tourName}</span>
              <span className="shrink-0 text-[11px] text-[var(--muted)]">{card.pax} {tCommon("pax")} ›</span>
            </a>

            <ul className="divide-y divide-[var(--border)]">
              {/* ─── Тургид ─── */}
              {card.guide !== null ? (
                <li className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <RoleBadge role="guide" />
                      <span className="truncate text-[13px] font-medium text-[var(--text)]">{card.guide.guideName}</span>
                      {tab !== "upcoming" && card.guide.handedOverVnd > 0 ? (
                        <span className="ml-auto shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {t("handed")}
                        </span>
                      ) : null}
                    </div>
                    {tab !== "upcoming" ? (
                      <div className="mt-0.5 pl-0.5 text-[11px] tabular-nums text-[var(--muted)]">
                        {card.guide.handedOverVnd > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {t("accepted")} {formatVnd(card.guide.handedOverVnd)}
                            {card.guide.guideOwesVnd > 0 ? (
                              <span className="ml-1 text-amber-700 dark:text-amber-300">
                                · {t("remainder")} {formatVnd(card.guide.guideOwesVnd)}
                              </span>
                            ) : null}
                          </span>
                        ) : card.guide.guideOwesVnd > 0 ? (
                          <span className="text-amber-800 dark:text-amber-200">
                            {tab === "today" ? t("pending") : t("debt")} {formatVnd(card.guide.guideOwesVnd)}
                          </span>
                        ) : card.guide.officeOwesVnd > 0 ? (
                          <span className="text-sky-700 dark:text-sky-300">{t("officeOwes")} {formatVnd(card.guide.officeOwesVnd)}</span>
                        ) : (
                          <span>{t("noMoneyMovement")}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {tab !== "upcoming" ? (
                    card.guide.handedOverVnd === 0 && (card.guide.guideOwesVnd > 0 || card.guide.officeOwesVnd > 0) ? (
                      <a
                        href={`/tours/${card.tourId}/accounting?handover=guide`}
                        className="shrink-0 rounded-xl bg-sky-700/12 px-3 py-2 text-[12px] font-semibold text-sky-800 ring-1 ring-sky-300/60 hover:bg-sky-700/20 dark:text-sky-200 dark:ring-sky-700/50"
                      >
                        {t("accept")}
                      </a>
                    ) : card.guide.handedOverVnd > 0 ? (
                      <a
                        href={`/tours/${card.tourId}/accounting?handover=guide`}
                        className="shrink-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
                      >
                        {t("open")}
                      </a>
                    ) : null
                  ) : null}
                </li>
              ) : null}

              {/* ─── Менеджеры ─── */}
              {card.managers.length > 0 ? (
                tab !== "upcoming" ? (
                  <AccountingPendingManagers
                    tourId={card.tourId}
                    tourName={card.tourName}
                    managers={card.managers}
                    outstandingVnd={card.managerOutstandingVnd}
                    handedVnd={card.managerHandedVnd}
                    isToday={tab === "today"}
                  />
                ) : (
                  <li className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <RoleBadge role="manager" />
                        <span className="text-[13px] font-medium text-[var(--text)]">{card.managers[0]!.managerName}</span>
                        {card.managers.length > 1 ? (
                          <span className="text-[11px] text-[var(--muted)]">
                            {card.managers.slice(1).map((m) => m.managerName).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              ) : null}

              {/* ─── Диспетчер ─── */}
              {card.dispatchers.length > 0
                ? card.dispatchers.map((d) => (
                    <li key={d.dispatcherId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <RoleBadge role="dispatcher" />
                          <span className="truncate text-[13px] font-medium text-[var(--text)]">{d.dispatcherName}</span>
                        </div>
                        {tab !== "upcoming" ? (
                          <div className="mt-0.5 pl-0.5 text-[11px] text-[var(--muted)]">{t("expensesOnTour")}</div>
                        ) : null}
                      </div>
                    </li>
                  ))
                : null}
            </ul>
          </div>
        ))}
      </div>

      {tab === "today" && doneCards.length > 0 && totalPending === 0 ? (
        <p className="mt-3 text-[12px] text-emerald-700 dark:text-emerald-400">
          {t("acceptedCount", { n: doneCards.length })}
        </p>
      ) : null}
    </section>
  );
}
