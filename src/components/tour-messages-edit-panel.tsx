"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@/lib/types";

type MessageField = "touristSendCopy" | "guideTouristMessage" | "reviewMessage";

function canEditField(role: Role, field: MessageField): boolean {
  if (field === "touristSendCopy") return role === "chief_manager" || role === "director";
  return role === "chief_guide" || role === "director";
}

export function TourMessagesEditPanel({
  templateId,
  initialTouristSendCopy,
  initialGuideTouristMessage,
  initialReviewMessage,
  viewerRole,
}: {
  templateId: string;
  initialTouristSendCopy?: string | null;
  initialGuideTouristMessage?: string | null;
  initialReviewMessage?: string | null;
  viewerRole: Role;
}) {
  const t = useTranslations("messages");
  const [values, setValues] = useState<Record<MessageField, string>>({
    touristSendCopy: initialTouristSendCopy ?? "",
    guideTouristMessage: initialGuideTouristMessage ?? "",
    reviewMessage: initialReviewMessage ?? "",
  });
  const [editingField, setEditingField] = useState<MessageField | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function fieldLabel(f: MessageField): string {
    if (f === "touristSendCopy") return t("managerToTourist");
    if (f === "guideTouristMessage") return t("guideToTourist");
    return t("reviewRequest");
  }

  const visibleFields: MessageField[] = (["touristSendCopy", "guideTouristMessage", "reviewMessage"] as MessageField[])
    .filter((f) => canEditField(viewerRole, f));

  if (visibleFields.length === 0) return null;

  function startEdit(field: MessageField) {
    setDraft(values[field]);
    setErr(null);
    setEditingField(field);
  }

  async function save(field: MessageField) {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, string> = {};
      body[field] = draft;
      const res = await fetch(`/api/tour-templates/${templateId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j as { error?: string }).error || t("errorSave"));
      setValues((v) => ({ ...v, [field]: draft }));
      setEditingField(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {visibleFields.map((field) => (
        <div
          key={field}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">
              {fieldLabel(field)}
            </span>
            {editingField !== field ? (
              <button
                type="button"
                onClick={() => startEdit(field)}
                className="rounded px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-elevated)]"
              >
                {values[field] ? t("change") : t("set")}
              </button>
            ) : null}
          </div>

          {editingField === field ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
              {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save(field)}
                  disabled={saving}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? "…" : t("save")}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingField(null); setErr(null); }}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">
              {values[field] || t("notSet")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
