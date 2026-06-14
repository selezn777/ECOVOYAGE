"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { managerWorkModeToggleClass } from "@/lib/manager-work-mode-ui";

export function ManagerWorkModeInline({
  managerId,
  initialMode = "point",
  canUsePointMode,
}: {
  managerId: string;
  initialMode?: "point" | "promo" | "online";
  canUsePointMode: boolean;
}) {
  const t = useTranslations("manager");
  const [mode, setMode] = useState<"point" | "promo" | "online">(initialMode);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const MODE_LABEL: Record<"point" | "promo" | "online", string> = {
    point: t("modePoint"),
    promo: t("modePromo"),
    online: t("modeOnline"),
  };

  async function save(next: "point" | "promo" | "online") {
    if (busy) return;
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/managers/work-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ managerId, mode: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || t("couldNotSave"));
      setMode(next);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {(["point", "promo", "online"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy || (m === "point" && !canUsePointMode)}
            onClick={() => void save(m)}
            className={`${managerWorkModeToggleClass(mode === m)} disabled:opacity-50`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {errorText ? <p className="mt-1.5 text-[11px] text-red-600">{errorText}</p> : null}
    </div>
  );
}
