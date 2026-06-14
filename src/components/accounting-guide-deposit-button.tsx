"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";

export function AccountingGuideDepositButton({
  tourId,
  tourName,
  currentVnd,
  buttonLabel,
}: {
  tourId: string;
  tourName: string;
  currentVnd: number | null;
  /** Короткая подпись на кнопке в таблицах */
  buttonLabel?: string;
}) {
  const router = useRouter();
  const t = useTranslations("accounting");
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState(currentVnd ? String(currentVnd) : "");
  const [busy, setBusy] = useState(false);

  const label = buttonLabel ?? t("guideDepositLabel");

  async function save() {
    const vnd = parseVndInput(amountStr);
    if (vnd < 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/guide-cash-deposit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountVnd: Math.round(vnd) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Ошибка ${res.status}`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      alert("Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAmountStr(currentVnd ? formatVndInput(currentVnd) : "");
          setOpen(true);
        }}
        title={t("guideDepositTitle")}
        className="rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--surface-soft)]"
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div
            role="dialog"
            aria-modal
            aria-labelledby="deposit-title"
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
          >
            <h3 id="deposit-title" className="text-base font-semibold text-[var(--text)]">
              {t("guideDepositTitle")}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{tourName}</p>
            <p className="mt-2 text-xs text-[var(--muted2)]">
              {t("guideDepositHint")}
            </p>
            <label className="mt-3 block text-xs font-medium text-[var(--muted2)]">{t("guideDepositAmountLabel")}</label>
            <input
              className="field-surface mt-1 w-full rounded-xl px-3 py-2 text-sm"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatVndInput(parseVndInput(e.target.value)))}
              placeholder="0"
              disabled={busy}
            />
            {currentVnd ? (
              <p className="mt-2 text-xs text-[var(--muted)]">{t("guideDepositCurrent")} {formatVnd(currentVnd)}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void save()}>
                {busy ? t("saving") : t("saveBtn")}
              </button>
              <button
                type="button"
                className="btn-ghost rounded-xl px-4 py-2 text-sm"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t("cancelBtn")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
