"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import type { TourAdvanceRecord, TourExpense } from "@/lib/types";

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

export function TourAdvancePanel({
  tourId,
  employees,
  advances,
  expenses,
  canManage,
}: {
  tourId: string;
  employees: { id: string; fullName: string }[];
  advances: TourAdvanceRecord[];
  expenses: TourExpense[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [kind, setKind] = useState<"issue" | "return">("issue");
  const [currency, setCurrency] = useState<"VND" | "USD">("VND");
  const [amountStr, setAmountStr] = useState("");
  const [fxRateStr, setFxRateStr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const amount = useMemo(() => parseVndInput(amountStr), [amountStr]);
  const fxRateToVnd = useMemo(() => {
    const x = Number((fxRateStr || "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  }, [fxRateStr]);
  const byEmployee = useMemo(() => {
    const m = new Map<string, { issued: number; returned: number; spent: number; name: string | null }>();
    for (const a of advances) {
      const cur = m.get(a.employeeId) || { issued: 0, returned: 0, spent: 0, name: a.employeeName };
      if (a.status === "rejected") continue;
      if (a.kind === "issue") cur.issued += a.amountVnd;
      else cur.returned += a.amountVnd;
      m.set(a.employeeId, cur);
    }
    for (const e of expenses) {
      if (!e.createdById) continue;
      const cur = m.get(e.createdById) || { issued: 0, returned: 0, spent: 0, name: null };
      if (e.accountantReviewedAt) cur.spent += e.amountVnd;
      m.set(e.createdById, cur);
    }
    return [...m.entries()].map(([id, v]) => ({
      employeeId: id,
      employeeName: v.name ?? employees.find((x) => x.id === id)?.fullName ?? "-",
      issuedVnd: v.issued,
      returnedVnd: v.returned,
      spentVnd: v.spent,
      balanceVnd: v.issued - v.returned - v.spent,
    }));
  }, [advances, expenses, employees]);

  const advanceRows = useMemo(
    () =>
      advances.map((a) => {
        const source = a.currency === "USD"
          ? `${(a.amountVnd / Math.max(1, a.fxRateToVnd)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
          : `${formatVnd(a.amountVnd)} VND`;
        return { ...a, source };
      }),
    [advances],
  );

  async function submit() {
    if (!canManage || !employeeId || amount < 1 || busy) return;
    if (currency === "USD" && fxRateToVnd <= 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          kind,
          currency,
          amount,
          ...(currency === "USD" ? { fxRateToVnd } : {}),
          amountVnd: currency === "VND" ? amount : Math.round(amount * fxRateToVnd),
          note: note.trim() || undefined,
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      let j: { error?: string } = {};
      if (ct.includes("application/json")) j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Ошибка ${res.status}`);
        return;
      }
      setAmountStr("");
      setFxRateStr("");
      setNote("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-4 border-t border-[var(--border)] pt-4"
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setCollapsed((s) => !s);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCollapsed((s) => !s);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Подотчёт</h2>
      </div>
      {!collapsed ? (
        <>
          {canManage ? (
            <div className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)]">
              <p className="text-sm font-medium">Новая операция</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-6">
                <select
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  disabled={busy}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
                <select className="field-surface rounded-xl px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "issue" | "return")} disabled={busy}>
                  <option value="issue">Выдача</option>
                  <option value="return">Возврат</option>
                </select>
                <input
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                  value={amountStr}
                  onChange={(e) => setAmountStr(formatVndInput(parseVndInput(e.target.value)))}
                  placeholder={currency === "VND" ? "500.000" : "100"}
                  inputMode="numeric"
                  disabled={busy}
                />
                <select className="field-surface rounded-xl px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value as "VND" | "USD")} disabled={busy}>
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                  value={fxRateStr}
                  onChange={(e) => setFxRateStr(e.target.value)}
                  placeholder="Курс USD→VND"
                  inputMode="decimal"
                  disabled={busy || currency === "VND"}
                />
                <button type="button" onClick={() => void submit()} disabled={busy || !employeeId || amount < 1 || (currency === "USD" && fxRateToVnd <= 0)} className="btn-primary disabled:opacity-50">
                  {busy ? "..." : "Сохранить"}
                </button>
              </div>
              <input
                className="field-surface mt-2 w-full rounded-xl px-3 py-2 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Комментарий"
                disabled={busy}
              />
            </div>
          ) : null}

          <div className="mt-3 min-w-0">
            {byEmployee.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Операций подотчёта пока нет.</p>
            ) : (
              <ul className="space-y-2">
                {byEmployee.map((r) => (
                  <li
                    key={r.employeeId}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-3 text-sm dark:bg-[var(--surface-elevated)]/25"
                  >
                    <p className="font-semibold text-[var(--text)]">{r.employeeName}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <div className="text-[var(--muted2)]">Выдано</div>
                        <div className="tabular-nums font-medium">{formatVnd(r.issuedVnd)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted2)]">Возврат</div>
                        <div className="tabular-nums">{formatVnd(r.returnedVnd)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted2)]">Потратил</div>
                        <div className="tabular-nums">{formatVnd(r.spentVnd)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted2)]">Остаток</div>
                        <div
                          className={`font-semibold tabular-nums ${r.balanceVnd > 0 ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-emerald-400"}`}
                        >
                          {formatVnd(r.balanceVnd)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">История подотчёта</p>
            {advanceRows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Пока нет.</p>
            ) : (
              <ul className="space-y-3">
                {advanceRows.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs text-[var(--muted)]">
                        {new Date(a.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      <span className="font-semibold tabular-nums">{formatVnd(a.amountVnd)}</span>
                    </div>
                    <p className="mt-2 font-medium">
                      {a.employeeName ?? "-"} · {a.kind === "issue" ? "Выдача" : "Возврат"}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[var(--muted2)]">Исходная сумма</div>
                        <div className="tabular-nums">{a.source}</div>
                      </div>
                      <div>
                        <div className="text-[var(--muted2)]">Курс</div>
                        <div className="tabular-nums">
                          {a.currency === "USD" ? a.fxRateToVnd.toLocaleString("ru-RU") : "1"}
                        </div>
                      </div>
                    </div>
                    {a.note ? <p className="mt-2 text-xs text-[var(--muted)]">{a.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

