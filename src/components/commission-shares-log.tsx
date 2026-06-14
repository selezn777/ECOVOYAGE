"use client";

import { useEffect, useState } from "react";

type GivenShare = {
  id: string;
  bookingId: string;
  customerName: string;
  onlineCode: string | null;
  tourName: string | null;
  tourDate: string | null;
  percent: number;
  bookingTotalVnd?: number;
  giverCommissionVnd?: number;
  giverCommissionPct?: number;
  shareAmountVnd?: number;
  createdAt: string;
  beneficiaryName: string | null;
};

type ReceivedShare = {
  id: string;
  bookingId: string;
  customerName: string;
  onlineCode: string | null;
  tourName: string | null;
  tourDate: string | null;
  percent: number;
  bookingTotalVnd?: number;
  giverCommissionVnd?: number;
  giverCommissionPct?: number;
  shareAmountVnd?: number;
  createdAt: string;
  giverName: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch { return iso.slice(0, 10); }
}

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function ShareCard({ item, mode }: { item: GivenShare | ReceivedShare; mode: "given" | "received" }) {
  const isGiven = mode === "given";
  const g = item as GivenShare;
  const r = item as ReceivedShare;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-1.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{item.customerName}</p>
          {item.tourName ? (
            <p className="text-xs text-[var(--muted)] truncate">{item.tourName}{item.tourDate ? ` · ${fmtDate(item.tourDate)}` : ""}</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${
          isGiven
            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
        }`}>
          {isGiven ? `−${item.percent}% → ${g.beneficiaryName ?? "—"}` : `+${item.percent}% от ${r.giverName ?? "—"}`}
        </span>
      </div>
      {item.shareAmountVnd != null && item.shareAmountVnd > 0 ? (
        <div className={`rounded-lg px-2.5 py-2 space-y-1 ${
          isGiven ? "bg-amber-50 dark:bg-amber-900/20" : "bg-emerald-50 dark:bg-emerald-900/20"
        }`}>
          {item.giverCommissionVnd != null && item.giverCommissionPct != null ? (
            <p className="text-[11px] text-[var(--muted)]">
              {item.percent}% от комиссии {item.giverCommissionPct}% = {fmtVnd(item.giverCommissionVnd)}
            </p>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-[var(--muted)]">{isGiven ? "Отдал" : "Получил"}</span>
            <span className={`text-sm font-bold tabular-nums ${
              isGiven ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}>
              {fmtVnd(item.shareAmountVnd)}
            </span>
          </div>
        </div>
      ) : null}
      {item.onlineCode ? <p className="text-[11px] text-[var(--muted2)]">{item.onlineCode}</p> : null}
    </div>
  );
}

export function CommissionSharesLog({ alwaysOpen }: { alwaysOpen?: boolean }) {
  const [open, setOpen] = useState(alwaysOpen ?? false);
  const [loading, setLoading] = useState(false);
  const [given, setGiven] = useState<GivenShare[]>([]);
  const [received, setReceived] = useState<ReceivedShare[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr("");
    fetch("/api/managers/commission-shares", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { given?: GivenShare[]; received?: ReceivedShare[]; error?: string }) => {
        if (j.error) { setErr(j.error); return; }
        setGiven(j.given ?? []);
        setReceived(j.received ?? []);
      })
      .catch(() => setErr("Нет соединения"))
      .finally(() => setLoading(false));
  }, [open]);

  const totalGiven = given.reduce((s, x) => s + (x.shareAmountVnd ?? 0), 0);
  const totalReceived = received.reduce((s, x) => s + (x.shareAmountVnd ?? 0), 0);

  if (alwaysOpen) {
    return (
      <div className="space-y-4">
        {loading && <p className="text-sm text-[var(--muted)]">Загрузка…</p>}
        {err && <p className="text-sm text-red-500">{err}</p>}
        {!loading && !err && (
          <>
            {/* Итоги */}
            {(totalGiven > 0 || totalReceived > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {totalGiven > 0 && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Отдал % всего</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-amber-800 dark:text-amber-200">{fmtVnd(totalGiven)}</p>
                  </div>
                )}
                {totalReceived > 0 && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Получил % всего</p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{fmtVnd(totalReceived)}</p>
                  </div>
                )}
              </div>
            )}

            {given.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Я отдал % ({given.length})</p>
                <div className="space-y-2">
                  {given.map((s) => <ShareCard key={s.id} item={s} mode="given" />)}
                </div>
              </div>
            )}
            {received.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">Мне передали % ({received.length})</p>
                <div className="space-y-2">
                  {received.map((s) => <ShareCard key={s.id} item={s} mode="received" />)}
                </div>
              </div>
            )}
            {given.length === 0 && received.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Нет записей о делении комиссии</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors"
      >
        % комиссии
        {(given.length > 0 || received.length > 0) && !loading ? (
          <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {given.length + received.length}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading ? <p className="text-xs text-[var(--muted)]">Загрузка…</p>
          : err ? <p className="text-xs text-red-500">{err}</p>
          : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Я отдал % ({given.length})</p>
                {given.length === 0 ? <p className="text-xs text-[var(--muted)]">Нет записей</p> : (
                  <div className="space-y-2">{given.map((s) => <ShareCard key={s.id} item={s} mode="given" />)}</div>
                )}
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Мне передали % ({received.length})</p>
                {received.length === 0 ? <p className="text-xs text-[var(--muted)]">Нет записей</p> : (
                  <div className="space-y-2">{received.map((s) => <ShareCard key={s.id} item={s} mode="received" />)}</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
