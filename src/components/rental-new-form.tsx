"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function RentalNewForm() {
  const router = useRouter();
  const t = useTranslations("rental");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rental-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : t("errorStatus", { status: res.status }));
        return;
      }
      if (j.id) router.push(`/rentals/${j.id}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card mb-3 flex flex-wrap items-end gap-2">
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
        <span className="text-[var(--muted2)]">{t("newPointNameLabel")}</span>
        <input
          className="field-surface rounded-xl px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          placeholder={t("newPointNamePlaceholder")}
        />
      </label>
      {err ? <p className="w-full text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <button type="submit" className="btn-primary disabled:opacity-50" disabled={busy || !name.trim()}>
        {t("createBtn")}
      </button>
    </form>
  );
}
