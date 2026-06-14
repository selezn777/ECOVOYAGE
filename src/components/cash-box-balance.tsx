"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

function formatVndCompact(n: number, millionLabel: string): string {
  const abs = Math.abs(Math.round(n));
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${millionLabel} ₫`;
  return `${sign}${abs.toLocaleString("ru-RU")} ₫`;
}

function formatUsdCompact(n: number): string {
  const abs = Math.abs(Number(n.toFixed(2)));
  const sign = n < 0 ? "−" : "";
  return `${sign}$${abs.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function CashBoxBalance({
  cashVnd,
  bankVnd,
  cashUsd,
}: {
  cashVnd: number;
  bankVnd: number;
  cashUsd: number;
}) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("cash");

  const total = cashVnd + bankVnd + Math.round(cashUsd * 26000);

  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">{t("boxBalance")}</h2>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("hideAmounts") : t("showAmounts")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)] transition-colors ring-1 ring-[var(--border)]"
        >
          {visible ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              {t("hide")}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {t("show")}
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)] min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] mb-1 truncate">{t("cashOnHand")}</div>
          <div className={`text-sm font-bold tabular-nums transition-all truncate ${cashVnd < 0 ? "text-red-500" : "text-[var(--text)]"}`}>
            {visible ? formatVndCompact(cashVnd, t("million")) : "•••"}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)] min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] mb-1 truncate">{t("bank")}</div>
          <div className={`text-sm font-bold tabular-nums transition-all truncate ${bankVnd < 0 ? "text-red-500" : "text-[var(--text)]"}`}>
            {visible ? formatVndCompact(bankVnd, t("million")) : "•••"}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)] min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] mb-1 truncate">USD</div>
          <div className={`text-sm font-bold tabular-nums transition-all truncate ${cashUsd < 0 ? "text-red-500" : "text-[var(--text)]"}`}>
            {visible ? formatUsdCompact(cashUsd) : "•••"}
          </div>
        </div>
      </div>

      {visible && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">{t("totalApprox")}</span>
          <span className={`text-sm font-semibold tabular-nums ${total < 0 ? "text-red-500" : "text-[var(--text)]"}`}>
            {formatVndCompact(total, t("million"))}
          </span>
        </div>
      )}
    </div>
  );
}
