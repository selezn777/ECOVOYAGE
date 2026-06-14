"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { showConfirm } from "@/lib/ui-dialog";

const CONFIRM_TEXT = "RESET ALL DATA";

export function SystemResetPanel() {
  const t = useTranslations("system");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runReset() {
    if (confirmText.trim() !== CONFIRM_TEXT) {
      setMessage(`${t("resetConfirmPrompt")}: ${CONFIRM_TEXT}`);
      return;
    }
    const ok = await showConfirm(t("resetConfirmBody"));
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setMessage(json.error || t("resetFailed"));
        return;
      }
      setMessage(json.message || t("resetDone"));
      setConfirmText("");
    } catch {
      setMessage(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3 border-red-300/70 bg-red-50/70">
      <h2 className="text-base font-semibold text-red-900">{t("resetTitle")}</h2>
      <p className="mt-1 text-xs text-red-800/90">
        {t("resetHint")}
      </p>
      <label className="mt-3 grid max-w-md gap-0.5">
        <span className="text-xs text-red-800/90">{t("resetConfirmLabel")}</span>
        <input
          className="field-surface rounded-xl px-3 py-2"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_TEXT}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        onClick={() => void runReset()}
        disabled={busy}
        className="mt-3 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? t("resetRunning") : t("resetBtn")}
      </button>
      {message ? <p className="mt-2 text-xs text-red-900">{message}</p> : null}
    </section>
  );
}
