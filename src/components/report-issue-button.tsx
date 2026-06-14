"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("reportIssue");
  const tC = useTranslations("common");

  function onOpenTelegram() {
    window.open("https://t.me/viktor_vietnam", "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary min-h-[44px] w-full justify-start rounded-xl px-3 text-sm font-medium"
        title={t("button")}
        aria-label={t("buttonAria")}
      >
        {t("button")}
      </button>

      {open ? (
        <div className="ui-scrim fixed inset-0 z-[210] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("dialogTitle")}
          >
            <h2 className="text-base font-semibold text-[var(--text)]">{t("dialogTitle")}</h2>
            <div className="mt-3 space-y-2 text-sm text-[var(--text)]">
              <p>{t("intro")}</p>
              <p>{t("hint1")}</p>
              <p>{t("hint2")}</p>
              <p className="text-[var(--muted)]">{t("note")}</p>
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
              <button type="button" onClick={onOpenTelegram} className="btn-primary min-h-[44px] rounded-xl px-4 py-2">
                {t("openTelegram")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary min-h-[44px] rounded-xl px-4 py-2 sm:px-5"
              >
                {tC("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
