"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatVnd } from "@/lib/format";

type Sale = {
  id: string;
  soldAt: string;
  qty: number;
  saleTotalVnd: number;
  managerProfitVnd: number;
  templateName: string;
  ticketType: string;
};

const TYPE_LABELS: Record<string, string> = {
  vinwonders: "VinWonders",
  teatro_do: "Teatro Do",
};

export function TicketSalesHistory() {
  const t = useTranslations("tickets");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ticket-sales/mine");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || t("loadError"));
        setSales((json.sales as Sale[]) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  if (loading) return <p className="text-sm text-[var(--muted)]">{t("loadingHistory")}</p>;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (sales.length === 0) return <p className="text-sm text-[var(--muted)]">{t("noSales")}</p>;

  const totalProfit = sales.reduce((s, r) => s + r.managerProfitVnd, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-[var(--muted)]">{t("last50")}</span>
        <span className="text-sm font-medium">
          {t("myCommission")}: {formatVnd(totalProfit)}
        </span>
      </div>
      <ul className="space-y-2">
        {sales.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{row.templateName}</div>
                <div className="text-xs text-[var(--muted)]">
                  {TYPE_LABELS[row.ticketType] ?? row.ticketType} · {row.qty} шт. ·{" "}
                  {formatVnd(row.saleTotalVnd)}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {new Date(row.soldAt).toLocaleString("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  +{formatVnd(row.managerProfitVnd)}
                </div>
                <div className="text-xs text-[var(--muted)]">{t("commission")}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
