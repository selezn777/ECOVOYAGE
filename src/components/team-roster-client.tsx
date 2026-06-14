"use client";

import { useMemo, useState } from "react";
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
          <h1 className="text-lg font-semibold leading-tight text-[var(--text)] sm:text-xl">Сотрудники и выплаты</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Список без сумм и процентов - чужой экран не увидит выплат. Вся финансовая работа, % менеджера и авансы - в
            карточке сотрудника. Сводку с метриками раскрывайте только если рядом нет посторонних.
          </p>
        </header>
      ) : null}

      {isAccountant ? <TeamAccountantRosterInsights rows={rows} salesPointsTotal={salesPointsTotal} /> : null}

      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--muted2)]">
        Поиск по сотруднику
      </label>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Имя…"
        autoComplete="off"
        className="field-surface mb-3 w-full max-w-full rounded-xl px-3 py-2.5 text-sm sm:max-w-md"
      />
      {filtered.length === 0 ? (
        <section className="card text-sm text-[var(--muted)]">Никого не найдено.</section>
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
