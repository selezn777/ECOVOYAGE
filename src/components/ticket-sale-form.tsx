"use client";

import { NumericRollSelect } from "@/components/numeric-roll-select";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Template = { id: string; name: string; ticketType: string; salePriceVnd: number };

export function TicketSaleForm() {
  const t = useTranslations("tickets");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/ticket-templates");
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setLoadErr(typeof json.error === "string" ? json.error : t("loadError"));
        return;
      }
      const list = (json.templates as Template[]) || [];
      setTemplates(list);
      if (list[0]) setTemplateId(list[0].id);
    })();
    return () => { cancelled = true; };
  }, [t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ticket-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, qty }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("loadError"));
      setQty(1);
      alert(t("saleRecorded"));
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) return <p className="text-sm text-red-600 dark:text-red-400">{loadErr}</p>;
  if (templates.length === 0) return <p className="text-sm text-[var(--muted)]">{t("noTemplates")}</p>;

  const selected = templates.find((t) => t.id === templateId);
  const preview = selected ? selected.salePriceVnd * qty : 0;
  void preview;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">{t("template")}</span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="field-surface rounded-xl px-3 py-2 text-base"
        >
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name} · {formatVndPlain(tmpl.salePriceVnd)} / шт.
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--muted)]">{t("qty")}</span>
        <NumericRollSelect
          aria-label={t("qty")}
          className="field-surface rounded-xl px-3 py-2 text-base"
          min={1}
          max={300}
          value={qty}
          onChange={setQty}
        />
      </label>
      <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
        {busy ? t("saving") : t("recordSale")}
      </button>
    </form>
  );
}

function formatVndPlain(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}
