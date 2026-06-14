"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";

export type SalaryCell = { v: string; colspan?: number };

function defaultGrid(cols: number, rows: number): SalaryCell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ v: "" })));
}

function parseGrid(json: string | null): SalaryCell[][] {
  if (!json?.trim()) return defaultGrid(4, 4);
  try {
    const o = JSON.parse(json) as { rows?: unknown };
    if (o && Array.isArray(o.rows) && o.rows.length) {
      return o.rows.map((row) =>
        Array.isArray(row)
          ? row.map((c) => {
              if (c && typeof c === "object" && "v" in c) {
                const cell = c as { v?: string; colspan?: number };
                const cs = cell.colspan;
                return {
                  v: String(cell.v ?? ""),
                  colspan: typeof cs === "number" && cs > 1 ? Math.floor(cs) : undefined,
                };
              }
              return { v: String(c ?? "") };
            })
          : [],
      );
    }
  } catch {
    /* ignore */
  }
  return defaultGrid(4, 4);
}

function gridToJson(rows: SalaryCell[][]): string {
  return JSON.stringify({ rows });
}

function mergeRight(rows: SalaryCell[][], r: number, c: number): SalaryCell[][] {
  const next = rows.map((row) => row.map((cell) => ({ ...cell })));
  const row = next[r];
  if (!row || c >= row.length - 1) return next;
  const a = row[c];
  const b = row[c + 1];
  const ac = a.colspan && a.colspan > 1 ? a.colspan : 1;
  const bc = b.colspan && b.colspan > 1 ? b.colspan : 1;
  const v = [a.v, b.v].filter((x) => x.trim()).join(" ");
  row[c] = { v, colspan: ac + bc };
  row.splice(c + 1, 1);
  return next;
}

function splitCell(rows: SalaryCell[][], r: number, c: number): SalaryCell[][] {
  const next = rows.map((row) => row.map((cell) => ({ ...cell })));
  const row = next[r];
  if (!row || !row[c]) return next;
  const cell = row[c];
  const span = cell.colspan && cell.colspan > 1 ? Math.floor(cell.colspan) : 1;
  if (span <= 1) return next;
  row[c] = { v: cell.v };
  for (let i = 1; i < span; i++) {
    row.splice(c + i, 0, { v: "" });
  }
  return next;
}

export function TourAccountantSalaryBlock({
  tourId,
  initialSalaryVnd,
  initialSheetJson,
}: {
  tourId: string;
  initialSalaryVnd: number | null;
  initialSheetJson: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("accountantSalary");
  const tNav = useTranslations("nav");
  const tAccounting = useTranslations("accounting");
  const tCommon = useTranslations("common");
  const [salaryInput, setSalaryInput] = useState(
    initialSalaryVnd != null && initialSalaryVnd > 0 ? formatVndInput(initialSalaryVnd) : "",
  );
  /** После сохранения сумма в режиме просмотра; «Редактировать» - снова поле ввода. */
  const [salaryUiMode, setSalaryUiMode] = useState<"view" | "edit">(() =>
    initialSalaryVnd != null && initialSalaryVnd > 0 ? "view" : "edit",
  );
  const [salaryBusy, setSalaryBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<SalaryCell[][]>(() => parseGrid(initialSheetJson));
  const [undoStack, setUndoStack] = useState<SalaryCell[][][]>([]);
  const [redoStack, setRedoStack] = useState<SalaryCell[][][]>([]);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  useEffect(() => {
    setSalaryInput(initialSalaryVnd != null && initialSalaryVnd > 0 ? formatVndInput(initialSalaryVnd) : "");
    if (initialSalaryVnd != null && initialSalaryVnd > 0) {
      setSalaryUiMode("view");
    } else {
      setSalaryUiMode("edit");
    }
  }, [initialSalaryVnd]);

  /** После router.refresh() пропы приходят асинхронно - подтягиваем таблицу с сервера, пока модалка закрыта. */
  useEffect(() => {
    if (!open) {
      setGrid(parseGrid(initialSheetJson));
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [initialSheetJson, open]);

  const maxCols = useMemo(() => Math.max(1, ...grid.map((r) => r.length)), [grid]);

  const saveSalary = useCallback(async () => {
    const raw = salaryInput.trim();
    let payload: number | null = null;
    if (raw !== "") {
      const digits = raw.replace(/\D/g, "");
      if (!digits) {
        alert(t("enterAmountDigitsAlert"));
        return;
      }
      const parsed = parseVndInput(salaryInput);
      if (!Number.isFinite(parsed) || parsed < 0) {
        alert(t("invalidAmountAlert"));
        return;
      }
      const rounded = Math.min(9_000_000_000_000, Math.max(0, Math.round(parsed)));
      payload = rounded === 0 ? null : rounded;
    }
    setSalaryBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/accounting-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountantGuideSalaryVnd: payload }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        ok?: boolean;
        accountantGuideSalaryVnd?: number | null;
      };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : j.error && typeof j.error === "object"
              ? JSON.stringify(j.error)
              : tCommon("couldNotSave");
        alert(msg);
        return;
      }
      if (typeof j.accountantGuideSalaryVnd === "number" && j.accountantGuideSalaryVnd > 0) {
        setSalaryInput(formatVndInput(j.accountantGuideSalaryVnd));
        setSalaryUiMode("view");
      } else if (j.accountantGuideSalaryVnd === null) {
        setSalaryInput("");
        setSalaryUiMode("edit");
      }
      router.refresh();
    } finally {
      setSalaryBusy(false);
    }
  }, [salaryInput, tourId, router, t, tCommon]);

  const saveSheet = useCallback(async () => {
    setSheetBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/accounting-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountantSalarySheetJson: gridToJson(grid) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === "string" ? j.error : tCommon("couldNotSave"));
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSheetBusy(false);
    }
  }, [grid, tourId, router, tCommon]);

  function cloneGrid(src: SalaryCell[][]): SalaryCell[][] {
    return src.map((row) => row.map((cell) => ({ ...cell })));
  }

  function commitGridChange(mutator: (current: SalaryCell[][]) => SalaryCell[][]) {
    setGrid((current) => {
      const before = cloneGrid(current);
      const after = mutator(cloneGrid(current));
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        setUndoStack((s) => [...s, before]);
        setRedoStack([]);
      }
      return after;
    });
  }

  function undoGrid() {
    setUndoStack((s) => {
      const prev = s[s.length - 1];
      if (!prev) return s;
      setRedoStack((r) => [...r, cloneGrid(grid)]);
      setGrid(cloneGrid(prev));
      return s.slice(0, -1);
    });
  }

  function redoGrid() {
    setRedoStack((s) => {
      const next = s[s.length - 1];
      if (!next) return s;
      setUndoStack((u) => [...u, cloneGrid(grid)]);
      setGrid(cloneGrid(next));
      return s.slice(0, -1);
    });
  }

  function addRow() {
    commitGridChange((g) => [...g, Array.from({ length: maxCols }, () => ({ v: "" }))]);
  }

  function addCol() {
    commitGridChange((g) => g.map((row) => [...row, { v: "" }]));
  }

  function removeRow() {
    if (!sel) return;
    commitGridChange((g) => {
      if (g.length <= 1 || sel.r < 0 || sel.r >= g.length) return g;
      const next = g.slice(0, sel.r).concat(g.slice(sel.r + 1));
      setSel((cur) => (cur ? { r: Math.max(0, Math.min(next.length - 1, cur.r - (cur.r > sel.r ? 1 : 0))), c: cur.c } : cur));
      return next;
    });
  }

  function removeCol() {
    if (!sel) return;
    commitGridChange((g) => {
      const width = Math.max(1, ...g.map((r) => r.length));
      if (width <= 1) return g;
      return g.map((row) => {
        if (sel.c < 0 || sel.c >= row.length) return row;
        const nextRow = row.map((cell) => ({ ...cell }));
        nextRow.splice(sel.c, 1);
        return nextRow.length ? nextRow : [{ v: "" }];
      });
    });
  }

  function setCell(r: number, c: number, v: string) {
    setGrid((g) => {
      const next = g.map((row) => row.map((cell) => ({ ...cell })));
      if (next[r]?.[c]) next[r][c] = { ...next[r][c], v };
      return next;
    });
  }

  function doMerge() {
    if (!sel) return;
    commitGridChange((g) => mergeRight(g, sel.r, sel.c));
  }

  function doSplit() {
    if (!sel) return;
    commitGridChange((g) => splitCell(g, sel.r, sel.c));
  }

  return (
    <section className="card mb-3">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)]/80 pb-4">
        <div className="min-w-0">
          <p className="section-label mb-1.5">{tNav("accounting")}</p>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text)] sm:text-[1.05rem]">{tAccounting("guideSalaryLabel")}</h2>
          <p className="page-sub mt-1.5 max-w-xl text-[13px]">
            {t("guideSalaryDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGrid(parseGrid(initialSheetJson));
            setUndoStack([]);
            setRedoStack([]);
            setSel(null);
            setOpen(true);
          }}
          className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-2 text-[13px] font-medium text-[var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]/60 transition-colors hover:bg-[var(--surface-elevated)] hover:ring-[var(--accent)]/25"
        >
          {t("calcTableBtn")}
        </button>
      </header>

      <div className="pt-4">
        {salaryUiMode === "view" && initialSalaryVnd != null && initialSalaryVnd > 0 ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 rounded-xl bg-[var(--accent-soft)] px-4 py-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--accent)]/12 sm:px-5 sm:py-5 dark:ring-[var(--accent)]/22">
              <div className="action-row gap-y-1">
                <span className="section-label">{t("totalInSystem")}</span>
                <span className="inline-flex items-center rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--success)] ring-1 ring-[var(--success)]/25">
                  {t("savedBadge")}
                </span>
              </div>
              <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-[var(--text)] sm:text-[1.85rem]">
                {formatVnd(initialSalaryVnd)}
              </p>
              <p className="mt-3 max-w-md text-[12px] leading-relaxed text-[var(--muted)]">
                {t("guideSalaryShownHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSalaryInput(formatVndInput(initialSalaryVnd));
                setSalaryUiMode("edit");
              }}
              className="h-10 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--text)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--surface-soft)] sm:h-11 sm:self-center"
            >
              {t("changeAmount")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:max-w-md">
            <label className="flex flex-col gap-1.5">
              <span className="section-label">{t("amountVndLabel")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={salaryInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseVndInput(raw);
                  if (raw.trim() === "") setSalaryInput("");
                  else setSalaryInput(formatVndInput(n));
                }}
                className="input-app tabular-nums"
                placeholder={t("amountPlaceholder")}
              />
            </label>
            <div className="action-row">
              <button
                type="button"
                disabled={salaryBusy}
                onClick={() => void saveSalary()}
                className="h-10 min-w-[7.5rem] rounded-xl bg-[var(--accent)] px-4 text-[13px] font-semibold text-white shadow-[var(--shadow-sm)] transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {salaryBusy ? tCommon("saving") : tCommon("save")}
              </button>
              {initialSalaryVnd != null && initialSalaryVnd > 0 ? (
                <button
                  type="button"
                  disabled={salaryBusy}
                  onClick={() => {
                    setSalaryInput(formatVndInput(initialSalaryVnd));
                    setSalaryUiMode("view");
                  }}
                  className="h-10 rounded-xl border border-[var(--border)] bg-transparent px-4 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text)]"
                >
                  {tCommon("cancel")}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          style={{ background: "var(--scrim)" }}
          role="dialog"
          aria-modal
          aria-labelledby="salary-sheet-title"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[var(--radius)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-soft)]/90 px-4 py-3.5 sm:px-5 dark:bg-[var(--surface-soft)]/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="section-label mb-1">{t("draftLabel")}</p>
                  <h3 id="salary-sheet-title" className="text-[15px] font-semibold text-[var(--text)]">
                    {t("calcTableBtn")}
                  </h3>
                  <p className="mt-1 max-w-lg text-[12px] leading-snug text-[var(--muted)]">
                    {t("calcTableModalDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  {tCommon("close")}
                </button>
              </div>
            </div>
            <div className="max-h-[min(70vh,560px)] overflow-auto p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addRow}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)]"
                >
                  {t("addRow")}
                </button>
                <button
                  type="button"
                  onClick={addCol}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)]"
                >
                  {t("addCol")}
                </button>
                <button
                  type="button"
                  onClick={doMerge}
                  disabled={!sel || (sel && (grid[sel.r]?.length ?? 0) <= sel.c + 1)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("mergeWithNextTitle")}
                >
                  {t("mergeWithNext")}
                </button>
                <button
                  type="button"
                  onClick={doSplit}
                  disabled={!sel || !(grid[sel.r]?.[sel.c]?.colspan && (grid[sel.r]?.[sel.c]?.colspan ?? 1) > 1)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("splitCellTitle")}
                >
                  {t("splitCell")}
                </button>
                <button
                  type="button"
                  onClick={removeRow}
                  disabled={!sel || grid.length <= 1}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("removeRowTitle")}
                >
                  {t("removeRow")}
                </button>
                <button
                  type="button"
                  onClick={removeCol}
                  disabled={!sel || maxCols <= 1}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("removeColTitle")}
                >
                  {t("removeCol")}
                </button>
                <button
                  type="button"
                  onClick={undoGrid}
                  disabled={undoStack.length === 0}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("undoTitle")}
                >
                  {t("undo")}
                </button>
                <button
                  type="button"
                  onClick={redoGrid}
                  disabled={redoStack.length === 0}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-sm)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  title={t("redoTitle")}
                >
                  {t("redo")}
                </button>
              </div>
              <div className="max-w-full overflow-auto rounded-xl ring-1 ring-[var(--border)]">
                <table className="w-full min-w-0 border-collapse text-xs">
                  <tbody>
                    {grid.map((row, r) => (
                      <tr key={r} className="border-b border-[var(--border)] last:border-0">
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            colSpan={cell.colspan && cell.colspan > 1 ? cell.colspan : undefined}
                            className={`min-w-0 border-r border-[var(--border)] bg-[var(--surface)] p-0 last:border-r-0 ${
                              sel?.r === r && sel?.c === c ? "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]/35 ring-inset" : ""
                            }`}
                          >
                            <input
                              value={cell.v}
                              onChange={(e) => setCell(r, c, e.target.value)}
                              onFocus={() => setSel({ r, c })}
                              className="w-full min-w-0 bg-transparent px-2 py-2 outline-none placeholder:text-[var(--muted2)]"
                              placeholder="…"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-soft)]/50 px-4 py-3 sm:px-5 dark:bg-[var(--surface)]/40">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-[13px] font-medium"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                disabled={sheetBusy}
                onClick={() => void saveSheet()}
                className="h-10 min-w-[10rem] rounded-xl bg-[var(--accent)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {sheetBusy ? tCommon("saving") : t("saveTable")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
