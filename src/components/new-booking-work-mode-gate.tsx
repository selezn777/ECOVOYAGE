"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type WorkMode = "point" | "promo" | "online";

export function NewBookingWorkModeGate({
  managerId,
  pointName,
  hasPoint,
}: {
  managerId: string;
  pointName: string | null;
  hasPoint: boolean;
}) {
  const t = useTranslations("manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LABELS: Record<WorkMode, string> = {
    point: t("modeOnPoint"),
    promo: t("modePromo"),
    online: t("modeOnline"),
  };

  const modes: WorkMode[] = ["point", "promo", "online"];

  async function choose(mode: WorkMode) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/managers/work-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ managerId, mode }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof j.error === "string" ? j.error : t("couldNotSave"));
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none select-none">👋</span>
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text)]">{t("whereToday")}</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {t("setWorkMode")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={busy}
            onClick={() => void choose(mode)}
            className="btn-secondary min-h-[44px] flex-1 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            {mode === "point" && pointName ? pointName : LABELS[mode]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {!hasPoint ? (
        <p className="mt-3 text-[11px] text-[var(--muted2)]">
          {t("noPointAssigned")}
        </p>
      ) : null}
    </section>
  );
}
