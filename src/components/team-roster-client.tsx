"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TeamAccountantRosterInsights } from "@/components/team-accountant-roster-insights";
import { TeamRosterList } from "@/components/team-roster-list";
import { canEditUserRosterPrivacy } from "@/lib/role-policy";
import { compareRosterUsers, groupSortedRosterUsers } from "@/lib/team-roster-sort";
import type { RosterUser, Role } from "@/lib/types";

export function TeamRosterClient({
  rows,
  salesPointsTotal = 0,
  currentUserId,
  viewerRole,
  enableManagerCommissionEdit,
  showEmployeeFinanceCardLink = false,
  privacyListMode = false,
}: {
  rows: RosterUser[];
  salesPointsTotal?: number;
  currentUserId: string;
  /** Для бухгалтера - заголовок страницы и сводка (остальные роли без изменений) */
  viewerRole?: Role;
  enableManagerCommissionEdit?: boolean;
  showEmployeeFinanceCardLink?: boolean;
  /** Бухгалтер: не показывать в списке метрики и чувствительные поля (всё - в карточке). */
  privacyListMode?: boolean;
}) {
  const t = useTranslations("team");
  const enableRosterPrivacyEdit = viewerRole ? canEditUserRosterPrivacy(viewerRole) : false;
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.fullName.toLowerCase().includes(t));
  }, [rows, q]);

  const rosterGroups = useMemo(() => {
    const sorted = [...filtered].sort(compareRosterUsers);
    return groupSortedRosterUsers(sorted);
  }, [filtered]);

  const isAccountant = viewerRole === "accountant";

  return (
    <div className="mb-3 w-full">
      {isAccountant ? (
        <header className="mb-4 px-0.5">
          <h1 className="text-lg font-semibold leading-tight text-[var(--text)] sm:text-xl">{t("accountantTitle")}</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">{t("accountantDescription")}</p>
        </header>
      ) : null}

      {isAccountant ? <TeamAccountantRosterInsights rows={rows} salesPointsTotal={salesPointsTotal} /> : null}

      <section className="mb-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] ring-1 ring-white/45 dark:ring-white/[0.04]">
        <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-[var(--muted2)]">
          {t("searchByEmployee")}
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]"
            fill="none"
            aria-hidden
          >
            <path
              d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16ZM19 19l-4.35-4.35"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchNamePlaceholder")}
            autoComplete="off"
            className="field-surface min-h-[48px] w-full rounded-2xl pl-10 pr-3 text-sm font-semibold sm:max-w-md"
          />
        </div>
      </section>
      {filtered.length === 0 ? (
        <section className="card text-sm text-[var(--muted)]">{t("noEmployeesFound")}</section>
      ) : (
        <TeamRosterList
          groups={rosterGroups}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
          enableManagerCommissionEdit={enableManagerCommissionEdit}
          showEmployeeFinanceCardLink={showEmployeeFinanceCardLink}
          privacyListMode={privacyListMode}
          enableRosterPrivacyEdit={enableRosterPrivacyEdit}
        />
      )}
    </div>
  );
}
