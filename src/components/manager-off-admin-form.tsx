"use client";

import { useMemo, useState } from "react";
import type { Role, RosterUser } from "@/lib/types";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { useTranslations } from "next-intl";

type TabKey = "manager" | "guide";

export function ManagerOffAdminForm({
  managers,
  guides,
  viewerRole,
  minDateForOthers,
}: {
  managers: RosterUser[];
  guides: RosterUser[];
  viewerRole: Role;
  minDateForOthers: string;
}) {
  const t = useTranslations("daysOff");
  const canManageManagers = viewerRole === "director" || viewerRole === "chief_manager";
  const canManageGuides = viewerRole === "director" || viewerRole === "chief_guide";
  const [collapsed, setCollapsed] = useState(true);
  const [tab, setTab] = useState<TabKey>(canManageManagers ? "manager" : "guide");
  const activeRoster = tab === "manager" ? managers : guides;
  const [employeeId, setEmployeeId] = useState(activeRoster[0]?.id ?? "");
  const [dayFrom, setDayFrom] = useState(minDateForOthers);
  const [dayTo, setDayTo] = useState(minDateForOthers);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const rangeDays = useMemo(() => {
    if (!dayFrom || !dayTo) return 0;
    const a = dayFrom <= dayTo ? dayFrom : dayTo;
    const b = dayFrom <= dayTo ? dayTo : dayFrom;
    const start = new Date(`${a}T00:00:00`);
    const end = new Date(`${b}T00:00:00`);
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [dayFrom, dayTo]);

  const fromNorm = dayFrom <= dayTo ? dayFrom : dayTo;
  const toNorm = dayFrom <= dayTo ? dayTo : dayFrom;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return;
    if (rangeDays < 1) {
      setErrorText(t("rangeError"));
      return;
    }
    setErrorText(null);
    setBusy(true);
    try {
      const body = tab === "manager" ? { managerId: employeeId, dayFrom: fromNorm, dayTo: toNorm } : { guideId: employeeId, dayFrom: fromNorm, dayTo: toNorm };
      const endpoint = tab === "manager" ? "/api/managers/days-off" : "/api/guides/days-off";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || t("saveError"));
      window.location.reload();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  if ((!canManageManagers || managers.length === 0) && (!canManageGuides || guides.length === 0)) return null;

  return (
    <section className="card mb-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <span className="text-xs text-[var(--muted2)]">{collapsed ? t("open") : t("collapse")}</span>
      </button>
      {!collapsed ? (
        <>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t.rich("hint", {
              date: () => <strong>{formatYmdWithWeekday(minDateForOthers)}</strong>,
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canManageManagers ? (
              <button type="button" onClick={() => { setTab("manager"); setEmployeeId(managers[0]?.id ?? ""); }} className={`btn-secondary !min-h-[34px] !px-3 ${tab === "manager" ? "ring-2 ring-[var(--accent)]" : ""}`}>
                {t("managers")}
              </button>
            ) : null}
            {canManageGuides ? (
              <button type="button" onClick={() => { setTab("guide"); setEmployeeId(guides[0]?.id ?? ""); }} className={`btn-secondary !min-h-[34px] !px-3 ${tab === "guide" ? "ring-2 ring-[var(--accent)]" : ""}`}>
                {t("guides")}
              </button>
            ) : null}
          </div>
          <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)] sm:col-span-2">
              {t("employee")}
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
              >
                {activeRoster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              {t("from")}
              <input
                type="date"
                value={dayFrom}
                min={minDateForOthers}
                onChange={(e) => setDayFrom(e.target.value)}
                className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              {t("to")}
              <input
                type="date"
                value={dayTo}
                min={minDateForOthers}
                onChange={(e) => setDayTo(e.target.value)}
                className="field-surface min-h-[42px] rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-[var(--muted)] sm:col-span-3">
              {t("period", { from: formatYmdWithWeekday(fromNorm), to: formatYmdWithWeekday(toNorm), n: rangeDays })}
            </p>
            <button
              type="submit"
              disabled={busy || !employeeId}
              className="btn-primary min-h-[42px] rounded-xl px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? t("saving") : t("assign")}
            </button>
          </form>
          {errorText ? <p className="mt-2 text-xs text-red-600">{errorText}</p> : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-[var(--muted)]">{t("collapsedHint")}</p>
      )}
    </section>
  );
}
