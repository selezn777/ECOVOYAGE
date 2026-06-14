"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { RosterUser } from "@/lib/types";

export function UserRosterPrivacyInline({ r }: { r: RosterUser }) {
  const router = useRouter();
  const t = useTranslations("manager");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const on = Boolean(r.hiddenFromRoster);

  const patch = useCallback(
    async (body: { hiddenFromRoster?: boolean }) => {
      setErr(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(r.id)}/roster-privacy`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
          return;
        }
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [r.id, router],
  );

  return (
    <div className="border-t border-[var(--border)] pt-2">
      {err ? <p className="mb-1.5 text-[11px] text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]">{t("hideFromRoster")}</span>{" "}
          <span className="text-[var(--muted2)]">{t("hideFromRosterHint")}</span>
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={busy}
          onClick={() => void patch({ hiddenFromRoster: !on })}
          className={
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-black/5 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 " +
            (on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600")
          }
        >
          <span
            className={
              "pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out " +
              (on ? "translate-x-4" : "translate-x-0")
            }
          />
        </button>
      </div>
    </div>
  );
}
