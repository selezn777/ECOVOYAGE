"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { GuideCandidate, TourGuideSlot } from "@/lib/types";
import { formatYmdWithWeekday } from "@/lib/scheduling";
import { showConfirm } from "@/lib/ui-dialog";
import Link from "next/link";

type State = {
  tourDate: string;
  assigned: TourGuideSlot[];
  candidates: GuideCandidate[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function GuideMiniAvatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const s = `${size}px`;
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        unoptimized
        style={{ width: s, height: s, minWidth: s }}
        className="shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
      />
    );
  }
  return (
    <div
      style={{ width: s, height: s, minWidth: s, fontSize: size < 36 ? "10px" : "12px" }}
      className="shrink-0 rounded-full bg-[var(--accent-soft)] ring-1 ring-[var(--border)] flex items-center justify-center font-bold text-[var(--accent)]"
    >
      {initials(name)}
    </div>
  );
}

export function TourGuidesPanel({ tourId, embedded = false }: { tourId: string; embedded?: boolean }) {
  const t = useTranslations("guides");
  const tC = useTranslations("common");
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedInspId, setSelectedInspId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/tours/${tourId}/guides`);
    const json = await res.json();
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : t("loadError"));
      return;
    }
    setState(json as State);
  }, [tourId, t]);

  useEffect(() => { void load(); }, [load]);

  async function addGuide(guideId: string, isInspection: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId, makePrimary: !isInspection, isInspection }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("assignError"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : tC("error"));
    } finally {
      setBusy(false);
    }
  }

  async function removeGuide(guideId: string) {
    const ok = await showConfirm(t("removeConfirm"));
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guides?guideId=${encodeURIComponent(guideId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("removeError"));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : tC("error"));
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
        {t("label")}: {err}
      </div>
    );
  }
  if (!state) {
    return <div className="mt-3 text-sm text-[var(--muted)]">{tC("loading")}</div>;
  }

  const roleLabel = (role: GuideCandidate["role"]): string => {
    if (role === "guide" || role === "chief_guide") return t("roleGuide");
    if (role === "manager" || role === "chief_manager") return t("roleManager");
    if (role === "dispatcher" || role === "booking_dispatcher") return t("roleDispatcher");
    if (role === "accountant") return t("roleAccountant");
    if (role === "director") return t("roleDirector");
    return role;
  };

  const assignedMain = state.assigned.find((x) => !x.isInspection) ?? null;
  const assignedInspections = state.assigned.filter((x) => x.isInspection);
  const hasMain = Boolean(assignedMain);

  const available = state.candidates.filter((c) => c.status === "available");
  const availableGuides = available.filter((c) => c.role === "guide" || c.role === "chief_guide" || c.role === "director");
  const availableNonGuides = available.filter((c) => c.role !== "guide" && c.role !== "chief_guide" && c.role !== "director");
  const unavailable = state.candidates.filter((c) => c.status !== "available");

  const wrap = embedded
    ? "rounded-2xl bg-[var(--surface-soft)] p-4 text-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
    : "mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]";

  return (
    <div className={wrap}>
      {/* Заголовок */}
      <div className="font-medium text-[var(--text)]">
        {embedded
          ? `${t("tourDate")}: ${formatYmdWithWeekday(state.tourDate)}`
          : `${t("label")} · ${formatYmdWithWeekday(state.tourDate)}`}
      </div>

      {/* ── Назначены ── */}
      {(assignedMain || assignedInspections.length > 0) ? (
        <div className="mt-3 space-y-1.5">
          {assignedMain ? (
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--border)]">
              <GuideMiniAvatar name={assignedMain.fullName} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-[13px] font-semibold text-[var(--text)]">{assignedMain.fullName}</span>
                <span className="ml-2 rounded-md bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">{t("primary")}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeGuide(assignedMain.guideId)}
                className="shrink-0 text-[11px] text-red-500 disabled:opacity-40 dark:text-red-400"
              >
                {t("remove")}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)]">
              {t("noMain")}
            </div>
          )}
          {assignedInspections.map((s) => (
            <div key={s.rowId} className="flex min-w-0 items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--border)]">
              <GuideMiniAvatar name={s.fullName} size={28} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-[12px] font-medium text-[var(--text)]">{s.fullName}</span>
                <span className="ml-2 text-[10px] text-[var(--muted2)]">{t("inspection")}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeGuide(s.guideId)}
                className="shrink-0 text-[11px] text-red-500 disabled:opacity-40 dark:text-red-400"
              >
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)]">
            {t("noMain")}
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)]">
            {t("noInspection")}
          </div>
        </div>
      )}

      {/* ── Кнопка открыть список + пикер ── */}
      {(availableGuides.length > 0 || availableNonGuides.length > 0 || unavailable.length > 0) ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-[var(--surface)] px-3 py-2 text-[12px] font-medium text-[var(--text)] ring-1 ring-[var(--border)] active:scale-[0.98]"
          >
            <span>Назначить гида</span>
            <span className="text-[var(--muted)]">{pickerOpen ? "▲" : "▼"}</span>
          </button>

          {pickerOpen ? (
            <div className="mt-2 space-y-2">
              {/* Свободные гиды */}
              {availableGuides.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("available")}</p>
                  {availableGuides.map((c) => (
                    <div
                      key={c.guideId}
                      className="flex min-w-0 items-center gap-2 rounded-xl bg-[var(--surface)] px-2.5 py-2 ring-1 ring-[var(--border)]"
                    >
                      <Link href={`/team/${c.guideId}`} className="shrink-0" tabIndex={-1}>
                        <GuideMiniAvatar name={c.fullName} avatarUrl={c.avatarUrl} size={36} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/team/${c.guideId}`} className="block truncate text-[13px] font-medium text-[var(--text)] underline-offset-2 hover:underline">
                          {c.fullName}
                        </Link>
                        {(c.tripCount ?? 0) > 0 ? (
                          <div className="text-[10px] text-[var(--muted2)]">{c.tripCount} {t("tripsCount")}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {!hasMain ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => { void addGuide(c.guideId, false); setPickerOpen(false); }}
                            className="min-h-[28px] rounded-lg bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                          >
                            {t("assignGuide")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { void addGuide(c.guideId, true); setPickerOpen(false); }}
                          className="min-h-[28px] rounded-lg bg-[var(--surface-elevated)] px-2.5 text-[11px] font-medium text-[var(--muted)] ring-1 ring-[var(--border)] disabled:opacity-50"
                        >
                          {t("inspection")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Инспекция из других сотрудников */}
              {availableNonGuides.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("inspectionOther")}</p>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={selectedInspId}
                      onChange={(e) => setSelectedInspId(e.target.value)}
                      className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
                      disabled={busy}
                    >
                      <option value="">{t("selectEmployee")}</option>
                      {availableNonGuides.map((c) => (
                        <option key={c.guideId} value={c.guideId}>
                          {c.fullName} · {roleLabel(c.role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !selectedInspId}
                      onClick={() => {
                        if (!selectedInspId) return;
                        const id = selectedInspId;
                        setSelectedInspId("");
                        void addGuide(id, true);
                        setPickerOpen(false);
                      }}
                      className="btn-primary shrink-0 rounded-xl px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Заняты / Выходной */}
              {unavailable.length > 0 ? (
                <div className="border-t border-[var(--border)] pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted2)]">{t("busy")}</p>
                  <div className="space-y-1">
                    {unavailable.map((c) => (
                      <div key={c.guideId} className="flex items-center gap-2 rounded-lg px-1 text-[11px] text-[var(--muted2)]">
                        <Link href={`/team/${c.guideId}`} className="shrink-0">
                          <GuideMiniAvatar name={c.fullName} avatarUrl={c.avatarUrl} size={26} />
                        </Link>
                        <span className="font-medium">{c.fullName}</span>
                        <span>—</span>
                        <span>{c.status === "day_off" ? t("dayOff") : c.otherTourName ? c.otherTourName : t("busy")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
