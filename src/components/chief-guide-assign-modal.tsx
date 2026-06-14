"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { formatYmdWithWeekdayRu } from "@/lib/scheduling";
import type { GuideCandidate, TourGuideSlot } from "@/lib/types";
import { buildTemplateDescription, parseTemplateDescription } from "@/lib/tour-description-share";
import { showAlert } from "@/lib/ui-dialog";

type AssignState = {
  tourDate: string;
  assigned: TourGuideSlot[];
  candidates: GuideCandidate[];
};

function normalizeGuideName(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lowered = s.toLowerCase();
  if (lowered === "unassigned" || lowered === "не назначен" || lowered === "not assigned") return "";
  return s;
}

export function ChiefGuideAssignModal({
  tourId,
  tourName,
  tourDate,
  pickupWindow,
  templateId,
  primaryGuideName,
}: {
  tourId: string;
  tourName: string;
  tourDate: string;
  pickupWindow?: string;
  templateId?: string | null;
  primaryGuideName?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("guide");
  const tG = useTranslations("guides");
  const tC = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<AssignState | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editLocations, setEditLocations] = useState<
    Array<{ name: string; description: string; mapUrl: string; recommendedTime: string; plusVnd: string }>
  >([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [selectedMainGuideId, setSelectedMainGuideId] = useState("");
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [mounted, setMounted] = useState(false);
  const [blockOpenUntilTs, setBlockOpenUntilTs] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const assignedMainGuide = useMemo(
    () => (state?.assigned || []).find((a) => !a.isInspection) || null,
    [state?.assigned],
  );
  const assignedInspection = useMemo(
    () => (state?.assigned || []).find((a) => a.isInspection) || null,
    [state?.assigned],
  );

  const roleLabel = (role: GuideCandidate["role"]): string => {
    if (role === "guide" || role === "chief_guide") return tG("roleGuide");
    if (role === "manager" || role === "chief_manager") return tG("roleManager");
    if (role === "dispatcher" || role === "booking_dispatcher") return tG("roleDispatcher");
    if (role === "accountant") return tG("roleAccountant");
    if (role === "director") return tG("roleDirector");
    return role;
  };

  const availableMainGuides = useMemo(
    () =>
      (state?.candidates || []).filter(
        (c) => c.status === "available" && (c.role === "guide" || c.role === "chief_guide" || c.role === "director"),
      ),
    [state?.candidates],
  );
  const availableInspectionCandidates = useMemo(
    () => (state?.candidates || []).filter((c) => c.status === "available"),
    [state?.candidates],
  );
  const selectedMainGuide = availableMainGuides.find((c) => c.guideId === selectedMainGuideId) || null;
  const selectedInspection = availableInspectionCandidates.find((c) => c.guideId === selectedInspectionId) || null;
  const normalizedPrimaryGuideName = normalizeGuideName(primaryGuideName);
  const hasPrimaryGuide = normalizedPrimaryGuideName.length > 0;

  function closeModal() {
    setBlockOpenUntilTs(Date.now() + 350);
    setOpen(false);
    setSelectedMainGuideId("");
    setSelectedInspectionId("");
  }

  function handleCloseClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  }

  function handleScrimClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    closeModal();
  }

  async function load() {
    setBusy(true);
    try {
      const [guidesRes, descRes] = await Promise.all([
        fetch(`/api/tours/${tourId}/guides`, { cache: "no-store" }),
        templateId ? fetch(`/api/tour-templates/${encodeURIComponent(templateId)}/description`, { cache: "no-store" }) : null,
      ]);
      const guidesJson = await guidesRes.json();
      if (!guidesRes.ok) throw new Error(typeof guidesJson.error === "string" ? guidesJson.error : tG("loadError"));
      setState(guidesJson as AssignState);
      if (descRes) {
        const descJson = await descRes.json();
        if (descRes.ok && typeof descJson.description === "string") {
          const raw = descJson.description;
          const parsed = parseTemplateDescription(raw);
          setEditDescription(parsed.description);
          setEditLocations(
            parsed.locations.map((l) => ({
              name: l.name,
              description: l.description,
              mapUrl: l.mapUrl,
              recommendedTime: l.recommendedTime || "",
              plusVnd: l.plusVnd ? String(l.plusVnd) : "",
            })),
          );
        }
      }
      setLoaded(true);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function assignGuide(opts: { guideId: string; isInspection: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId: opts.guideId, makePrimary: !opts.isInspection, isInspection: opts.isInspection }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : tG("assignError"));
      closeModal();
      router.refresh();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplateDetails() {
    if (!templateId) return;
    setSavingTemplate(true);
    try {
      const merged = buildTemplateDescription(
        editDescription,
        editLocations
          .map((l) => ({
            name: l.name.trim(),
            description: l.description.trim(),
            mapUrl: l.mapUrl.trim(),
            recommendedTime: l.recommendedTime.trim(),
            plusVnd: Math.max(0, Math.round(Number(String(l.plusVnd || "").replace(/[^\d]/g, "")))),
          }))
          .filter((l) => l.name && l.mapUrl),
      );
      const res = await fetch(`/api/tour-templates/${encodeURIComponent(templateId)}/description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: merged }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : tC("couldNotSave"));
      showAlert(t("descriptionSaved"));
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`mt-2 flex w-full flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 text-center ring-1 ${
          hasPrimaryGuide
            ? "border-sky-200/85 bg-gradient-to-b from-sky-50 via-cyan-50/65 to-sky-100/30 text-sky-950 ring-sky-100/70 dark:border-sky-500/28 dark:from-sky-950/45 dark:via-cyan-950/28 dark:to-sky-950/18 dark:text-sky-50 dark:ring-sky-400/12"
            : "border-rose-200/90 bg-gradient-to-b from-rose-50 via-red-50/70 to-rose-100/35 text-rose-950 ring-rose-100/70 dark:border-rose-500/35 dark:from-rose-950/45 dark:via-red-950/30 dark:to-rose-950/20 dark:text-rose-50 dark:ring-rose-400/12"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (Date.now() < blockOpenUntilTs) return;
          setOpen(true);
          if (!loaded) void load();
        }}
      >
        <span className={`text-[10px] font-bold uppercase leading-tight tracking-[0.12em] ${hasPrimaryGuide ? "text-sky-900 dark:text-sky-100" : "text-rose-900 dark:text-rose-100"}`}>
          {hasPrimaryGuide ? t("assigned") : t("notAssigned")}
        </span>
        <span className={`text-[11px] font-semibold leading-snug ${hasPrimaryGuide ? "text-sky-950 dark:text-sky-50" : "text-rose-950 dark:text-rose-50"}`}>
          {hasPrimaryGuide ? normalizedPrimaryGuideName : t("clickToAssign")}
        </span>
      </button>

      {open && mounted
        ? createPortal(
        <div
          className="ui-scrim fixed inset-0 z-[260] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[1px]"
          onClick={handleScrimClick}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl max-h-[85vh] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[var(--text)]">{tourName}</div>
                <div className="text-xs text-[var(--muted)]">
                  {formatYmdWithWeekdayRu(tourDate)}{pickupWindow ? ` · ${pickupWindow}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary !min-h-[34px] !rounded-lg !px-2.5"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={handleCloseClick}
              >
                {t("closedBtn")}
              </button>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("descriptionSection")}</div>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="field-surface mt-2 w-full rounded-xl px-3 py-2 text-sm"
                  rows={3}
                  placeholder={t("descriptionPlaceholder")}
                  disabled={!templateId || savingTemplate}
                />
                <div className="mt-2 space-y-2">
                  {editLocations.map((loc, idx) => (
                    <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("locationLabel", { n: idx + 1 })}</div>
                        <button
                          type="button"
                          className="btn-secondary !min-h-[28px] !rounded-lg !px-2 !py-1 text-[11px]"
                          onClick={() => setEditLocations((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={savingTemplate}
                        >
                          {t("deleteLocation")}
                        </button>
                      </div>
                      <input
                        value={loc.name}
                        onChange={(e) => setEditLocations((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                        className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                        placeholder={t("locationNamePlaceholder")}
                        disabled={savingTemplate}
                      />
                      <textarea
                        value={loc.description}
                        onChange={(e) =>
                          setEditLocations((prev) => prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                        }
                        className="field-surface mt-2 w-full rounded-xl px-3 py-2 text-sm"
                        placeholder={t("locationDescPlaceholder")}
                        rows={2}
                        disabled={savingTemplate}
                      />
                      <input
                        value={loc.mapUrl}
                        onChange={(e) => setEditLocations((prev) => prev.map((x, i) => (i === idx ? { ...x, mapUrl: e.target.value } : x)))}
                        className="field-surface mt-2 w-full rounded-xl px-3 py-2 text-sm"
                        placeholder={t("locationMapPlaceholder")}
                        disabled={savingTemplate}
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          value={loc.recommendedTime}
                          onChange={(e) =>
                            setEditLocations((prev) => prev.map((x, i) => (i === idx ? { ...x, recommendedTime: e.target.value } : x)))
                          }
                          type="time"
                          className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                          placeholder="Реком. время"
                          disabled={savingTemplate}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="action-row mt-2">
                  <button
                    type="button"
                    className="btn-secondary rounded-xl px-3 py-2 text-xs"
                    onClick={() =>
                      setEditLocations((prev) => [
                        ...prev,
                        { name: "", description: "", mapUrl: "", recommendedTime: "", plusVnd: "" },
                      ])
                    }
                    disabled={savingTemplate}
                  >
                    {t("addLocation")}
                  </button>
                  <button
                    type="button"
                    className="btn-primary rounded-xl px-3 py-2 text-xs"
                    onClick={() => void saveTemplateDetails()}
                    disabled={!templateId || savingTemplate}
                  >
                    {savingTemplate ? tC("saving") : t("saveDescription")}
                  </button>
                </div>
              </div>

              {busy && !state ? <div className="text-sm text-[var(--muted)]">{tC("loading")}</div> : null}

              {state ? (
                <>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("statusSection")}</div>
                    <div className="mt-1 text-sm text-[var(--text)]">
                      {assignedMainGuide ? `${t("assignedMain")} ${assignedMainGuide.fullName}` : t("notAssignedMain")}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text)]">
                      {assignedInspection ? `${t("assignedInspection")} ${assignedInspection.fullName}` : t("notAssignedInspection")}
                    </div>
                  </div>

                  {!assignedMainGuide ? (
                    <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2.5 text-sm ring-1 ring-amber-200/85 dark:border-amber-600/60 dark:bg-amber-950/45 dark:ring-amber-700/50">
                      <div className="font-semibold text-amber-950 dark:text-amber-100">{t("needMainGuide")}</div>
                      <div className="mt-0.5 text-amber-900/90 dark:text-amber-200/90">
                        {t("needMainGuideHint")}
                      </div>
                    </div>
                  ) : null}

                  {!assignedMainGuide ? (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("assignTitle")}</div>
                      {availableMainGuides.length > 0 ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <select
                            className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                            value={selectedMainGuideId}
                            onChange={(e) => setSelectedMainGuideId(e.target.value)}
                            disabled={busy}
                          >
                            <option value="">{t("selectGuide")}</option>
                            {availableMainGuides.map((c) => (
                              <option key={c.guideId} value={c.guideId}>
                                {c.fullName} · {roleLabel(c.role)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => (selectedMainGuide ? void assignGuide({ guideId: selectedMainGuide.guideId, isInspection: false }) : null)}
                            disabled={busy || !selectedMainGuide}
                            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                          >
                            {t("assignBtn")}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-sm text-[var(--muted)]">{t("noFreeGuides")}</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("assignInspection")}</div>
                      {availableInspectionCandidates.length > 0 ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          className="field-surface w-full rounded-xl px-3 py-2 text-sm"
                          value={selectedInspectionId}
                          onChange={(e) => setSelectedInspectionId(e.target.value)}
                          disabled={busy || Boolean(assignedInspection)}
                        >
                          <option value="">{t("selectEmployee")}</option>
                          {availableInspectionCandidates.map((c) => (
                            <option key={c.guideId} value={c.guideId}>
                              {c.fullName} · {roleLabel(c.role)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => (selectedInspection ? void assignGuide({ guideId: selectedInspection.guideId, isInspection: true }) : null)}
                          disabled={busy || !selectedInspection || Boolean(assignedInspection)}
                          className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                        >
                          {t("assignInspectionBtn")}
                        </button>
                      </div>
                      ) : (
                        <p className="mt-1.5 text-sm text-[var(--muted)]">{t("noFreeEmployees")}</p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
        , document.body)
        : null}
    </>
  );
}
