"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GuideSalaryRecord } from "@/lib/types";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { parseShopExtraNote } from "@/lib/shop-salary-note-parse";
import { ExpenseAttachmentOpener } from "@/components/expense-attachment-opener";

export function TourAccountingOfficialShopBlock({
  tourId: _tourId,
  rows,
  guideNameById,
  variant = "card",
}: {
  tourId: string;
  rows: GuideSalaryRecord[];
  guideNameById: Record<string, string>;
  variant?: "card" | "embedded";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [splitGuideVndStr, setSplitGuideVndStr] = useState<Record<string, string>>({});
  const [splitGuidePctStr, setSplitGuidePctStr] = useState<Record<string, string>>({});
  void _tourId;

  async function togglePaid(recordId: string, paid: boolean) {
    setBusyId(recordId);
    try {
      const res = await fetch(`/api/guide-salary-records/${recordId}/pay`, {
        method: paid ? "POST" : "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось обновить");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function saveSplit(recordId: string) {
    const vndRaw = splitGuideVndStr[recordId]?.trim() ?? "";
    const pctRaw = splitGuidePctStr[recordId]?.trim() ?? "";
    const vnd = vndRaw ? parseVndInput(vndRaw) : 0;
    const pct = pctRaw ? Number(String(pctRaw).replace(",", ".")) : NaN;
    if (!vnd && !Number.isFinite(pct)) {
      alert("Укажите сумму гиду или %");
      return;
    }
    if (vnd && Number.isFinite(pct)) {
      alert("Только сумма или только %");
      return;
    }
    setBusyId(recordId);
    try {
      const body =
        vnd > 0
          ? { guideVnd: vnd }
          : { guidePercent: Math.max(0, Math.min(100, Math.round(pct))) };
      const res = await fetch(`/api/guide-salary-records/${recordId}/shop-accountant-split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof j.error === "string" ? j.error : "Не удалось сохранить");
        return;
      }
      setSplitGuideVndStr((m) => ({ ...m, [recordId]: "" }));
      setSplitGuidePctStr((m) => ({ ...m, [recordId]: "" }));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    if (variant === "embedded") return null;
    return (
      <section className="card mb-3">
        <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Официальный магазин</h2>
        <p className="text-xs text-[var(--muted)]">Нет записей по официальному магазину на этом туре.</p>
      </section>
    );
  }

  const inner = (
    <>
      {variant === "embedded" ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">Доходы гида · магазин</h3>
          <p className="mt-1 text-[11px] text-[var(--muted2)]">
            Чек вносит гид. Разбивка офис / гид - здесь; в кассе офисная часть появится после «Сохранить».
          </p>
        </div>
      ) : null}
      <ul className="space-y-3 text-xs">
        {rows.map((r) => {
          const p = parseShopExtraNote(r.note);
          const name = guideNameById[r.guideId] ?? r.guideId.slice(0, 8);
          const isPaid = r.status === "paid";
          const settlement = p.settlement ?? "guide_kept";
          const driverPaid =
            r.shopDriverPaidByGuideVnd != null && r.shopDriverPaidByGuideVnd >= 0
              ? r.shopDriverPaidByGuideVnd
              : p.driverVnd ?? 0;
          const confirmed = Boolean(r.shopAccountantConfirmedAt);
          return (
            <li key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text)]">{name}</div>
                  <div className="mt-1 grid gap-0.5 text-[11px] text-[var(--muted)] sm:grid-cols-2">
                    <span>Оборот: {p.profitVnd != null ? formatVnd(p.profitVnd) : "-"}</span>
                    <span>Доля офиса (черновик): {p.officeVnd != null ? formatVnd(p.officeVnd) : "-"}</span>
                    <span>Водителю от гида: {formatVnd(driverPaid)}</span>
                    <span>Начисление гиду (черновик): {p.guideVnd != null ? formatVnd(p.guideVnd) : formatVnd(r.amountVnd)}</span>
                  </div>
                  {confirmed ? (
                    <div className="mt-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                      Подтверждено: офис {formatVnd(r.shopAccountantOfficeVnd ?? 0)} · гид {formatVnd(r.shopAccountantGuideVnd ?? r.amountVnd)}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[10px] text-[var(--muted2)]">
                    {settlement === "guide_kept" ? "Деньги у гида" : "Деньги в офисе"} · {isPaid ? "выплата гиду отмечена" : "выплата не отмечена"}
                  </div>
                  {r.attachmentUrl ? <ExpenseAttachmentOpener url={r.attachmentUrl} variant="text" text="Чек" /> : (
                    <span className="text-[10px] text-[var(--muted2)]">Нет фото</span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={isPaid}
                      disabled={busyId === r.id}
                      onChange={(e) => void togglePaid(r.id, e.target.checked)}
                    />
                    {busyId === r.id ? "…" : "Выплата гиду"}
                  </label>
                </div>
              </div>
              {!confirmed ? (
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-[var(--border)]/70 pt-2">
                  <label className="min-w-[7rem] flex-1">
                    <span className="mb-0.5 block text-[10px] text-[var(--muted2)]">Гид, ₫</span>
                    <input
                      className="field-surface w-full rounded-lg px-2 py-1.5 text-xs"
                      value={splitGuideVndStr[r.id] ?? ""}
                      onChange={(e) =>
                        setSplitGuideVndStr((m) => ({
                          ...m,
                          [r.id]: formatVndInput(parseVndInput(e.target.value)),
                        }))
                      }
                      placeholder="0"
                      disabled={busyId === r.id}
                    />
                  </label>
                  <label className="w-16">
                    <span className="mb-0.5 block text-[10px] text-[var(--muted2)]">или %</span>
                    <input
                      className="field-surface w-full rounded-lg px-2 py-1.5 text-xs"
                      value={splitGuidePctStr[r.id] ?? ""}
                      onChange={(e) => setSplitGuidePctStr((m) => ({ ...m, [r.id]: e.target.value }))}
                      inputMode="decimal"
                      disabled={busyId === r.id}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={busyId === r.id}
                    onClick={() => void saveSplit(r.id)}
                  >
                    Сохранить
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (variant === "embedded") {
    return <div className="mt-4 border-t border-[var(--border)]/80 pt-4">{inner}</div>;
  }

  return (
    <section className="card mb-3">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Официальный магазин</h2>
      {inner}
    </section>
  );
}
