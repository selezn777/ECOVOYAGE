"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RosterUser } from "@/lib/types";

export function ManagerSalesCommissionInline({
  r,
  onSaved,
}: {
  r: RosterUser;
  /** После успешного сохранения (например router.refresh в карточке сотрудника). */
  onSaved?: () => void;
}) {
  const initial =
    r.managerSalesCommissionPercent != null && Number.isFinite(r.managerSalesCommissionPercent)
      ? String(r.managerSalesCommissionPercent)
      : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const t = useTranslations("team");
  const tc = useTranslations("common");

  async function save() {
    setErr(null);
    const trimmed = value.trim();
    const percent: number | null = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (trimmed !== "" && (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100)) {
      setErr(t("commissionPercentError"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(r.id)}/manager-sales-commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : tc("couldNotSave"));
        return;
      }
      if (data.percent == null) {
        setValue("");
      } else {
        setValue(String(data.percent));
      }
      router.refresh();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="text-xs sm:text-sm">
      <div className="text-[var(--muted)] mb-1.5 text-[11px] font-medium leading-snug sm:text-xs">{t("commissionPercentLabel")}</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        <input
          type="text"
          inputMode="decimal"
          className="field-surface min-h-10 w-full max-w-[6.5rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] tabular-nums touch-manipulation"
          placeholder="12"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t("commissionPercentAria")}
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="inline-flex h-10 min-h-10 min-w-[7.5rem] shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-white shadow-sm ring-1 ring-black/15 transition-[transform,filter] hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? "…" : tc("save")}
        </button>
      </div>
      {err ? <p className="mt-2 text-[11px] text-red-600">{err}</p> : null}
      <p className="mt-2 text-[10px] leading-snug text-[var(--muted2)] sm:text-[11px]">
        {t("commissionPercentHint")}
      </p>
    </div>
  );
}
