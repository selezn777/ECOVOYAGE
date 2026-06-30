"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  buildTemplateDescription,
  buildWhatsappText,
  canSeeLocationLinks,
  parseTemplateDescription,
  sanitizeDescriptionForDisplay,
} from "@/lib/tour-description-share";
import type { Role } from "@/lib/types";

function canEditTourDescription(role?: Role): boolean {
  return role === "chief_guide" || role === "director" || role === "dispatcher" || role === "chief_manager";
}

/** Общий блок: текст, локации, копирование в WhatsApp (без оверлея). */
export function TourDescriptionPanelContent({
  tourName,
  tourDate,
  pickupWindow,
  descriptionText,
  loading = false,
  errorMessage = null,
  viewerRole,
}: {
  tourName: string;
  tourDate: string;
  pickupWindow?: string;
  descriptionText: string;
  loading?: boolean;
  errorMessage?: string | null;
  viewerRole?: Role;
}) {
  const t = useTranslations("tour");
  const tC = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  const parsed = useMemo(() => parseTemplateDescription(descriptionText), [descriptionText]);
  const urls = useMemo(
    () => parsed.locations.map((l) => ({ url: l.mapUrl, name: l.name })),
    [parsed.locations],
  );
  const displayText = useMemo(() => sanitizeDescriptionForDisplay(parsed.description), [parsed.description]);
  const allowLinks = canSeeLocationLinks(viewerRole);

  async function onCopyWhatsapp() {
    try {
      setBusy(true);
      const text = buildWhatsappText({
        tourName,
        tourDate,
        pickupWindow,
        description: descriptionText,
        urls,
        includeUrls: allowLinks,
      });
      await navigator.clipboard.writeText(text);
      alert(t("copiedForWhatsApp"));
    } catch (e) {
      alert(e instanceof Error ? e.message : tC("error"));
    } finally {
      setBusy(false);
    }
  }

  async function onCopyLocations() {
    if (!allowLinks || parsed.locations.length === 0) return;
    try {
      setLocBusy(true);
      const text = parsed.locations
        .map((l, i) =>
          [
            `${i + 1}. ${l.name}`,
            l.description || "",
            l.recommendedTime ? `Рекомендуемое время: ${l.recommendedTime}` : "",
            l.plusVnd && l.plusVnd > 0 ? `Плюсик: ${l.plusVnd.toLocaleString("ru-RU")} ₫` : "",
            l.mapUrl,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n");
      await navigator.clipboard.writeText(text);
      alert(t("locationsCopied"));
    } catch (e) {
      alert(e instanceof Error ? e.message : tC("error"));
    } finally {
      setLocBusy(false);
    }
  }

  return (
    <>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">{tC("loading")}</p>
      ) : errorMessage ? (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      ) : displayText.trim() ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 dark:bg-[var(--surface-soft)]">
          <div className="whitespace-pre-wrap text-sm leading-snug text-[var(--text)]">{displayText}</div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{t("descriptionNotSet")}</p>
      )}

      {!loading && !errorMessage && parsed.locations.length > 0 ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("locations")}</div>
          <ul className="space-y-2">
            {parsed.locations.map((l, i) => (
              <li
                key={`${l.name}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 dark:bg-[var(--surface-soft)]"
              >
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text)]">{i + 1}. {l.name}</div>
                  {l.description ? <div className="text-xs text-[var(--muted)]">{l.description}</div> : null}
                  {l.recommendedTime ? (
                    <div className="text-xs text-[var(--muted)]">{t("recommendedTime")} {l.recommendedTime}</div>
                  ) : null}
                  {l.plusVnd && l.plusVnd > 0 ? (
                    <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {t("plusVnd")} {l.plusVnd.toLocaleString("ru-RU")} ₫
                    </div>
                  ) : null}
                </div>
                {allowLinks ? <span className="text-xs text-[var(--muted2)]">{t("locationLink")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onCopyWhatsapp()}
          disabled={busy || loading || Boolean(errorMessage) || !descriptionText.trim()}
          className="btn-primary rounded-xl px-4 py-2 disabled:opacity-50"
        >
          {busy ? "..." : t("copyForWhatsApp")}
        </button>
        {allowLinks && parsed.locations.length > 0 ? (
          <button
            type="button"
            onClick={() => void onCopyLocations()}
            disabled={locBusy || loading || Boolean(errorMessage)}
            className="btn-secondary rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {locBusy ? "..." : t("locations")}
          </button>
        ) : null}
      </div>
    </>
  );
}

function EditingPanel({
  draft,
  setDraft,
  saving,
  saveError,
  onSave,
  tD,
  tDC,
}: {
  draft: string;
  setDraft: (v: string) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  tD: ReturnType<typeof useTranslations>;
  tDC: ReturnType<typeof useTranslations>;
}) {
  const parsed = useMemo(() => parseTemplateDescription(draft), [draft]);
  const [newLocName, setNewLocName] = useState("");

  function updateLocations(updated: typeof parsed.locations) {
    setDraft(buildTemplateDescription(parsed.description, updated));
  }

  function setLocationName(idx: number, name: string) {
    updateLocations(parsed.locations.map((l, i) => i === idx ? { ...l, name } : l));
  }

  function setLocationPaidBy(idx: number, paidBy: "guide" | "office" | "") {
    updateLocations(parsed.locations.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l };
      if (paidBy === "") { delete next.paidBy; } else { next.paidBy = paidBy; }
      return next;
    }));
  }

  function deleteLocation(idx: number) {
    updateLocations(parsed.locations.filter((_, i) => i !== idx));
  }

  function addLocation() {
    const name = newLocName.trim();
    if (!name) return;
    updateLocations([...parsed.locations, { name, description: "", mapUrl: "" }]);
    setNewLocName("");
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="min-h-[160px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 dark:bg-[var(--surface-elevated)]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        autoFocus
      />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Локации тура</p>
        {parsed.locations.length > 0 ? (
          <ul className="mb-2 space-y-1.5">
            {parsed.locations.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
                <input
                  value={l.name}
                  onChange={(e) => setLocationName(i, e.target.value)}
                  disabled={saving}
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                  placeholder="Название"
                />
                <div className="flex items-center gap-1">
                  {(["", "guide", "office"] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      disabled={saving}
                      onClick={() => setLocationPaidBy(i, val)}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 transition-colors ${
                        (l.paidBy ?? "") === val
                          ? "bg-[var(--accent)] text-white ring-[var(--accent)]"
                          : "bg-[var(--surface-soft)] text-[var(--muted)] ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
                      }`}
                    >
                      {val === "" ? "Все" : val === "guide" ? "Гид" : "Офис"}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => deleteLocation(i)}
                    className="ml-1 rounded-md px-1.5 py-0.5 text-xs text-red-500 ring-1 ring-red-200/60 hover:bg-red-50 dark:ring-red-800/40 dark:hover:bg-red-950/20"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-xs text-[var(--muted)]">Нет локаций — добавьте ниже</p>
        )}
        <div className="flex gap-1.5">
          <input
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
            disabled={saving}
            placeholder="Название новой локации"
            className="field-surface min-w-0 flex-1 rounded-xl px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={saving || !newLocName.trim()}
            onClick={addLocation}
            className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            + Добавить
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="self-end rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? tD("saving") : tDC("save")}
      </button>
    </div>
  );
}

export function TourDescriptionDialog({
  open,
  onClose,
  tourName,
  tourDate,
  pickupWindow,
  descriptionText,
  loading = false,
  errorMessage = null,
  viewerRole,
  templateId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tourName: string;
  tourDate: string;
  pickupWindow?: string;
  descriptionText: string;
  loading?: boolean;
  errorMessage?: string | null;
  viewerRole?: Role;
  templateId?: string | null;
  onSaved?: (newText: string) => void;
}) {
  const router = useRouter();
  const tD = useTranslations("tour");
  const tDC = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const canEdit = canEditTourDescription(viewerRole) && Boolean(templateId);

  function startEdit() {
    setDraft(descriptionText);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!templateId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/tour-templates/${templateId}/description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || tDC("couldNotSave"));
      onSaved?.(draft);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : tDC("error"));
    } finally {
      setSaving(false);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="ui-scrim fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={() => { if (!editing) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {editing ? tD("editDescription") : tD("descriptionTitle")}
          </h2>
          <div className="flex items-center gap-2">
            {canEdit && !editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--surface-soft)]"
              >
                {tD("edit")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={editing ? cancelEdit : onClose}
              className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-soft)]"
            >
              {editing ? tD("cancelEdit") : tDC("close")}
            </button>
          </div>
        </div>

        {editing ? (
          <EditingPanel
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            saveError={saveError}
            onSave={() => void saveEdit()}
            tD={tD}
            tDC={tDC}
          />
        ) : (
          <TourDescriptionPanelContent
            tourName={tourName}
            tourDate={tourDate}
            pickupWindow={pickupWindow}
            descriptionText={descriptionText}
            loading={loading}
            errorMessage={errorMessage}
            viewerRole={viewerRole}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

export function TourDescriptionActions({
  tourName,
  tourDate,
  pickupWindow,
  description,
  className,
  viewerRole,
  templateId,
}: {
  tourId: string;
  tourName: string;
  tourDate: string;
  pickupWindow?: string;
  description: string | null;
  className?: string;
  viewerRole?: Role;
  templateId?: string | null;
}) {
  const tA = useTranslations("tour");
  const [open, setOpen] = useState(false);
  const [currentDescription, setCurrentDescription] = useState<string>(description || "");

  const descriptionText = currentDescription;
  const canEdit = canEditTourDescription(viewerRole) && Boolean(templateId);

  return (
    <>
      <button
        type="button"
        className={`rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-50 ${className ?? ""}`}
        onClick={() => setOpen(true)}
        disabled={!descriptionText.trim() && !canEdit}
      >
        {tA("descriptionTitle")}
      </button>

      <TourDescriptionDialog
        open={open}
        onClose={() => setOpen(false)}
        tourName={tourName}
        tourDate={tourDate}
        pickupWindow={pickupWindow}
        descriptionText={descriptionText}
        viewerRole={viewerRole}
        templateId={templateId}
        onSaved={(newText) => setCurrentDescription(newText)}
      />
    </>
  );
}
