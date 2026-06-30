"use client";

import { useState } from "react";
import Image from "next/image";
import { PhoneCallLink, WhatsAppBookingLink } from "@/components/tour-actions";
import { UserRosterPrivacyInline } from "@/components/user-roster-privacy-inline";
import Link from "next/link";
import { ManagerSalesCommissionInline } from "@/components/manager-sales-commission-inline";
import { UserAvatar } from "@/components/user-avatar";
import { useTranslations } from "next-intl";
import { roleLabel } from "@/lib/role-labels";
import type { RosterUser } from "@/lib/types";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { formatDisplayPhone } from "@/lib/phone-e164";
import { canEditUserRosterPrivacyForTarget, canViewEmployeeFinanceCardForTarget } from "@/lib/role-policy";
import type { Role } from "@/lib/types";

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function summarizeUpcomingDaysOff(days: string[], backToWorkLabel: string): string {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return "";
  const out: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i];
    if (cur === addDaysYmd(end, 1)) {
      end = cur;
      continue;
    }
    if (start === end) {
      out.push(formatYmdWithWeekday(start));
    } else {
      out.push(`${backToWorkLabel} ${formatYmdWithWeekday(addDaysYmd(end, 1))}`);
    }
    start = cur;
    end = cur;
  }
  if (start === end) {
    out.push(formatYmdWithWeekday(start));
  } else {
    out.push(`${backToWorkLabel} ${formatYmdWithWeekday(addDaysYmd(end, 1))}`);
  }
  return out.join(" · ");
}

function RosterPerformanceLine({ r, offToday, tripsLabel, salesLabel }: { r: RosterUser; offToday: boolean; tripsLabel: string; salesLabel: string }) {
  const tMain = offToday ? "text-stone-900 dark:text-amber-50" : "text-[var(--text)]";
  const tAccent = offToday ? "text-teal-800 dark:text-teal-300" : "text-[var(--accent)]";

  if (r.role === "guide" || r.role === "chief_guide") {
    const trips = r.guideTripsCount ?? 0;
    return (
      <div className={`flex min-h-[1.25rem] flex-wrap items-center gap-x-1.5 text-[11px] font-medium leading-none ${tMain}`}>
        <span>{tripsLabel}:</span>
        <span className={`text-sm font-semibold tabular-nums leading-none ${tAccent}`}>{trips}</span>
      </div>
    );
  }
  if (r.role === "manager" || r.role === "chief_manager") {
    const sales = r.salesCount ?? 0;
    return (
      <div className={`flex min-h-[1.25rem] flex-wrap items-center gap-x-1.5 text-[11px] font-medium leading-none ${tMain}`}>
        <span>{salesLabel}:</span>
        <span className={`text-sm font-semibold tabular-nums leading-none ${tAccent}`}>{sales}</span>
      </div>
    );
  }
  return null;
}

export type TeamRosterGroup = { title: string; rows: RosterUser[] };

function groupTone(key: string): { wrap: string; head: string; sub: string } {
  if (key === "leadership") {
    return {
      wrap: "rounded-2xl border border-indigo-200/80 bg-indigo-50/55 px-2.5 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/25",
      head: "text-indigo-700 dark:text-indigo-300",
      sub: "text-indigo-500/80 dark:text-indigo-300/75",
    };
  }
  if (key === "managers") {
    return {
      wrap: "rounded-2xl border border-cyan-200/70 bg-cyan-50/45 px-2.5 py-2.5 dark:border-cyan-900/55 dark:bg-cyan-950/20",
      head: "text-cyan-700 dark:text-cyan-300",
      sub: "text-cyan-500/80 dark:text-cyan-300/75",
    };
  }
  if (key === "guides") {
    return {
      wrap: "rounded-2xl border border-emerald-200/70 bg-emerald-50/45 px-2.5 py-2.5 dark:border-emerald-900/55 dark:bg-emerald-950/20",
      head: "text-emerald-700 dark:text-emerald-300",
      sub: "text-emerald-500/80 dark:text-emerald-300/75",
    };
  }
  return {
    wrap: "rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)]/55 px-2.5 py-2.5",
    head: "text-[var(--muted2)]",
    sub: "text-[var(--muted)]",
  };
}

export function TeamRosterList({
  groups,
  currentUserId,
  viewerRole,
  enableManagerCommissionEdit = false,
  showEmployeeFinanceCardLink = false,
  privacyListMode = false,
  enableRosterPrivacyEdit = false,
}: {
  groups: TeamRosterGroup[];
  currentUserId: string;
  viewerRole?: Role;
  enableManagerCommissionEdit?: boolean;
  showEmployeeFinanceCardLink?: boolean;
  /** Режим бухгалтерии: без продаж/выездов/% в общем списке (всё в карточке). */
  privacyListMode?: boolean;
  /** Директор / главный менеджер / главный диспетчер: скрытие из ростера */
  enableRosterPrivacyEdit?: boolean;
}) {
  const tC = useTranslations("common");
  const tT = useTranslations("team");
  const [photoPreview, setPhotoPreview] = useState<{ url: string; fullName: string } | null>(null);
  const hasRows = groups.some((g) => g.rows.length > 0);
  if (!hasRows) {
    return <section className="card mb-3 text-sm text-[var(--muted)]">{tC("noData")}</section>;
  }

  const backToWorkLabel = tT("backToWork");
  const tripsLabel = tT("tripsLabel");
  const salesLabel = tT("salesLabel");

  return (
    <>
    <div className="mb-3">
      <div className="space-y-5">
        {groups.map((g) => {
          const tone = groupTone(g.title);
          const groupLabel = g.title === "leadership" ? tT("groupLeadership")
            : g.title === "managers" ? tT("groupManagers")
            : g.title === "guides" ? tT("groupGuides")
            : g.title === "office" ? tT("groupOffice")
            : g.title;
          return g.rows.length === 0 ? null : (
            <div key={g.title} className={tone.wrap}>
              <h3 className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone.head}`}>{groupLabel}</h3>
              <p className={`mb-2 text-[10px] ${tone.sub}`}>
                {g.title === "leadership" ? tT("leadershipDesc") : tT("operationalDesc")}
              </p>
              <ul className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((r) => {
          const isSelf = r.id === currentUserId;
          const cardNav = showEmployeeFinanceCardLink && !!viewerRole && canViewEmployeeFinanceCardForTarget(viewerRole, r.role);
          const interactiveOverlay = cardNav ? "pointer-events-auto relative z-10" : "";
          return (
            <li
              key={r.id}
              className={`flex min-h-0 flex-col gap-2 rounded-xl border px-3 py-3 sm:px-3.5 sm:py-3 ${
                cardNav ? "relative cursor-pointer " : ""
              }${
                r.offToday
                  ? "border-zinc-200/95 bg-zinc-100/95 text-zinc-500 ring-1 ring-zinc-200/95 saturate-0 dark:border-zinc-700/85 dark:bg-zinc-900/75 dark:text-zinc-400 dark:ring-zinc-700/75"
                  : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text)]"
              }`}
            >
              {cardNav ? (
                <Link
                  href={`/team/${r.id}`}
                  className="absolute inset-0 z-0 rounded-xl"
                  aria-label={tT("openEmployeeCard", { name: r.fullName })}
                />
              ) : null}
              <div className={cardNav ? "relative z-10 flex min-h-0 flex-col gap-2 pointer-events-none" : "flex min-h-0 flex-col gap-2"}>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const u = String(r.avatarUrl || "").trim();
                    if (!u) return;
                    setPhotoPreview({ url: u, fullName: r.fullName });
                  }}
                  disabled={!r.avatarUrl}
                  className={`${cardNav ? interactiveOverlay : ""} shrink-0 rounded-full ${r.avatarUrl ? "cursor-zoom-in" : "cursor-default"}`}
                  aria-label={r.avatarUrl ? tT("openPhotoAlt", { name: r.fullName }) : tT("photoUnavailable", { name: r.fullName })}
                  title={r.avatarUrl ? tT("openPhotoAlt", { name: r.fullName }) : tT("photoUnavailable", { name: r.fullName })}
                >
                  <UserAvatar fullName={r.fullName} url={r.avatarUrl} size={52} className="shrink-0" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                      <span
                        className={
                          r.offToday
                            ? "min-w-0 font-medium text-zinc-600 dark:text-zinc-300"
                            : "min-w-0 font-medium text-[var(--text)]"
                        }
                      >
                      {r.fullName}
                      {r.hiddenFromRoster ? (
                        <span className="ml-1.5 align-middle text-[10px] font-normal text-amber-800 dark:text-amber-300">
                          ({tT("hidden")})
                        </span>
                      ) : null}
                      <span
                        className={
                          r.offToday
                            ? "text-xs font-normal text-zinc-400 dark:text-zinc-500"
                            : "text-xs font-normal text-[var(--muted)]"
                        }
                      >
                        {" "}
                        · {roleLabel(r.role)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${
                        r.offToday
                          ? "bg-zinc-300 text-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-300"
                          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      }`}
                    >
                      {r.offToday ? tT("dayOff") : tT("working")}
                    </span>
                  </div>
                  <div className="mt-1">
                    {privacyListMode ? (
                      <p className="text-[11px] leading-snug text-[var(--muted2)]">
                        {tT("financeDetails")}
                      </p>
                    ) : (
                      <RosterPerformanceLine r={r} offToday={r.offToday} tripsLabel={tripsLabel} salesLabel={salesLabel} />
                    )}
                  </div>
                </div>
              </div>

              {r.upcomingDaysOff.length > 0 ? (
                <div
                  className={
                    r.offToday
                      ? "text-xs text-zinc-400 dark:text-zinc-500"
                      : "text-xs text-[var(--muted)]"
                  }
                >
                  {tT("scheduledDaysOff")}: {summarizeUpcomingDaysOff(r.upcomingDaysOff, backToWorkLabel)}
                </div>
              ) : (
                <div
                  className={
                    r.offToday ? "text-xs text-zinc-400/90 dark:text-zinc-500/90" : "text-xs text-[var(--muted2)]"
                  }
                >
                  {tT("noDaysOff")}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {!isSelf && r.whatsappPhone ? (
                  <p
                    className={
                      r.offToday
                        ? "text-sm font-semibold tabular-nums text-zinc-600 dark:text-zinc-300"
                        : "text-sm font-semibold tabular-nums text-[var(--text)]"
                    }
                  >
                    {formatDisplayPhone(r.whatsappPhone)}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                {!isSelf && r.whatsappPhone?.trim() ? (
                  <>
                    <WhatsAppBookingLink phone={r.whatsappPhone} className={interactiveOverlay} />
                    <PhoneCallLink phone={r.whatsappPhone} className={interactiveOverlay} />
                  </>
                ) : !isSelf && !r.whatsappPhone?.trim() ? (
                  <span
                    className={
                      r.offToday
                        ? "text-xs text-zinc-400 dark:text-zinc-500"
                        : "text-xs text-[var(--muted2)]"
                    }
                  >
                    {tT("noPhone")}
                  </span>
                ) : null}
                {isSelf && !r.whatsappPhone ? (
                  <span className="text-xs text-stone-800 dark:text-amber-100">
                    {tT("addWhatsApp")}
                  </span>
                ) : null}
                </div>
              </div>
              </div>

              {enableManagerCommissionEdit &&
              (viewerRole === "chief_manager" ? r.role === "manager" : r.role === "manager" || r.role === "chief_manager") ? (
                <div className={`border-t border-[var(--border)] pt-2 ${cardNav ? interactiveOverlay : ""}`}>
                  <ManagerSalesCommissionInline r={r} />
                </div>
              ) : null}

              {enableRosterPrivacyEdit && !!viewerRole && canEditUserRosterPrivacyForTarget(viewerRole, r.role) ? (
                <div className={cardNav ? interactiveOverlay : undefined}>
                  <UserRosterPrivacyInline r={r} />
                </div>
              ) : null}
            </li>
          );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
    {photoPreview ? (
      <div
        className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setPhotoPreview(null);
        }}
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-black/80 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium text-white">{photoPreview.fullName}</div>
            <button
              type="button"
              className="rounded-lg border border-white/30 px-2 py-1 text-xs font-medium text-white"
              onClick={() => setPhotoPreview(null)}
            >
              {tT("closePhoto")}
            </button>
          </div>
          {/* Read-only preview: photo editing is not available in this modal. */}
          <Image
            src={photoPreview.url}
            alt={tT("openPhotoAlt", { name: photoPreview.fullName })}
            width={640}
            height={640}
            unoptimized
            className="max-h-[75vh] w-full rounded-xl object-contain"
          />
        </div>
      </div>
    ) : null}
    </>
  );
}
