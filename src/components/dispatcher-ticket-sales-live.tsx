"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatVnd } from "@/lib/format";
import { waMeHref } from "@/lib/wa-me";

type SalesByManager = { managerId: string; managerName: string; soldQty: number };
type RecentSale = {
  id: string;
  soldAt: string;
  qty: number;
  saleTotalVnd: number;
  managerProfitVnd: number;
  templateName: string;
  ticketType: string;
  managerName: string;
  managerPhone: string | null;
};

type FeedResponse = {
  nowIso: string;
  soldLastHourByManager: SalesByManager[];
  soldTodayByManager: SalesByManager[];
  recentSales: RecentSale[];
};

function formatTicketType(ticketType: string): string {
  if (ticketType === "vinwonders") return "VinWonders";
  if (ticketType === "teatro_do") return "Teatro Do";
  return ticketType;
}

export function DispatcherTicketSalesLive() {
  const t = useTranslations("dispatcher_tickets");
  const [data, setData] = useState<FeedResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/ticket-sales", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as FeedResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || "Error");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const hourTop = useMemo(() => (data?.soldLastHourByManager ?? []).slice(0, 8), [data?.soldLastHourByManager]);
  const todayTop = useMemo(() => (data?.soldTodayByManager ?? []).slice(0, 8), [data?.soldTodayByManager]);

  return (
    <section className="card mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("ticketsTitle")}</h2>
        <button type="button" onClick={() => void load()} className="btn-secondary px-3 py-1.5 text-xs" disabled={busy}>
          {busy ? t("refreshing") : t("refresh")}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="text-xs text-[var(--muted)]">{t("lastHour")}</div>
          <ul className="mt-2 space-y-1 text-sm">
            {hourTop.length === 0 ? <li className="text-[var(--muted)]">{t("noSales")}</li> : null}
            {hourTop.map((r) => (
              <li key={`h-${r.managerId}`} className="flex items-center justify-between gap-2">
                <span>{r.managerName}</span>
                <span className="font-semibold tabular-nums">{r.soldQty} {t("pcs")}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="text-xs text-[var(--muted)]">{t("today")}</div>
          <ul className="mt-2 space-y-1 text-sm">
            {todayTop.length === 0 ? <li className="text-[var(--muted)]">{t("noSales")}</li> : null}
            {todayTop.map((r) => (
              <li key={`d-${r.managerId}`} className="flex items-center justify-between gap-2">
                <span>{r.managerName}</span>
                <span className="font-semibold tabular-nums">{r.soldQty} {t("pcs")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium">{t("recentSales")}</div>
        <ul className="mt-2 space-y-2">
          {(data?.recentSales ?? []).slice(0, 20).map((row) => {
            const message = `${row.templateName}\n${row.managerName}\n${formatTicketType(row.ticketType)}: ${row.qty} ${t("pcs")}\n${formatVnd(row.saleTotalVnd)}`;
            const waHref = row.managerPhone ? waMeHref(row.managerPhone, { text: message }) : null;
            return (
              <li key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{row.templateName}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {row.managerName} · {row.qty} {t("pcs")} · {formatVnd(row.saleTotalVnd)}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {new Date(row.soldAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                  {waHref ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:brightness-105 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200"
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">{t("noWhatsapp")}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
