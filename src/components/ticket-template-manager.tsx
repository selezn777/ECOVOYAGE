"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Template = {
  id: string;
  name: string;
  ticket_type: string;
  sale_price_vnd: number;
  office_profit_mode: string;
  office_profit_value: number;
  manager_profit_mode: string;
  manager_profit_value: number;
  active: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  vinwonders: "VinWonders",
  teatro_do: "Teatro Do",
};

function formatVndPlain(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

function parsePriceInput(raw: string): number {
  return Number(raw.replace(/\D/g, "")) || 0;
}

const EMPTY_FORM = {
  ticketType: "vinwonders" as "vinwonders" | "teatro_do",
  name: "",
  salePriceVnd: "",
  officeProfitMode: "percent" as "fixed" | "percent",
  officeProfitValue: "",
  managerProfitMode: "percent" as "fixed" | "percent",
  managerProfitValue: "",
};

export function TicketTemplateManager() {
  const t = useTranslations("tickets");
  const tCommon = useTranslations("common");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ticket-templates?all=true");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("templates.errLoadFailed"));
      setTemplates((json.templates as Template[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setLoading(false);
    }
  }, [t, tCommon]);

  useEffect(() => { void load(); }, [load]);

  async function toggleActive(tpl: Template) {
    setToggling(tpl.id);
    try {
      const res = await fetch(`/api/ticket-templates/${tpl.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tpl.active }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || tCommon("error"));
      }
      setTemplates((prev) =>
        prev.map((t) => (t.id === tpl.id ? { ...t, active: !tpl.active } : t)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setToggling(null);
    }
  }

  async function onSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const salePriceVnd = parsePriceInput(form.salePriceVnd);
    const officeProfitValue = parseFloat(form.officeProfitValue.replace(",", ".")) || 0;
    const managerProfitValue = parseFloat(form.managerProfitValue.replace(",", ".")) || 0;
    if (!form.name.trim()) { setFormError(t("templates.errEnterName")); return; }
    if (salePriceVnd <= 0) { setFormError(t("templates.errEnterPrice")); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/ticket-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketType: form.ticketType,
          name: form.name.trim(),
          salePriceVnd,
          officeProfitMode: form.officeProfitMode,
          officeProfitValue,
          managerProfitMode: form.managerProfitMode,
          managerProfitValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : tCommon("error"));
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tCommon("error"));
    } finally {
      setSaving(false);
    }
  }

  const byType = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const g = acc[t.ticket_type] ?? [];
    g.push(t);
    acc[t.ticket_type] = g;
    return acc;
  }, {});

  return (
    <section className="card mb-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("templates.title")}</h2>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setFormError(null); }}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {showForm ? tCommon("cancel") : t("templates.newButton")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmitNew} className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="text-sm font-medium">{t("templates.newHeading")}</div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">{t("templates.typeLabel")}</span>
            <select
              value={form.ticketType}
              onChange={(e) => setForm((f) => ({ ...f, ticketType: e.target.value as "vinwonders" | "teatro_do" }))}
              className="field-surface rounded-xl px-3 py-2 text-base"
            >
              <option value="vinwonders">VinWonders</option>
              <option value="teatro_do">Teatro Do</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">{t("templates.nameLabel")}</span>
            <input
              type="text"
              placeholder={t("templates.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="field-surface rounded-xl px-3 py-2 text-base"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">{t("templates.salePriceLabel")}</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={t("templates.salePricePlaceholder")}
              value={form.salePriceVnd}
              onChange={(e) => setForm((f) => ({ ...f, salePriceVnd: e.target.value }))}
              className="field-surface rounded-xl px-3 py-2 text-base"
            />
          </label>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="text-sm text-[var(--muted)]">{t("templates.officeCommissionLabel")}</span>
            <span className="text-sm text-[var(--muted)]">{t("templates.managerCommissionLabel")}</span>
            <div className="flex gap-1">
              <select
                value={form.officeProfitMode}
                onChange={(e) => setForm((f) => ({ ...f, officeProfitMode: e.target.value as "fixed" | "percent" }))}
                className="field-surface rounded-xl px-2 py-2 text-sm"
              >
                <option value="percent">%</option>
                <option value="fixed">₫</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                placeholder={form.officeProfitMode === "percent" ? "10" : "50.000"}
                value={form.officeProfitValue}
                onChange={(e) => setForm((f) => ({ ...f, officeProfitValue: e.target.value }))}
                className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <select
                value={form.managerProfitMode}
                onChange={(e) => setForm((f) => ({ ...f, managerProfitMode: e.target.value as "fixed" | "percent" }))}
                className="field-surface rounded-xl px-2 py-2 text-sm"
              >
                <option value="percent">%</option>
                <option value="fixed">₫</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                placeholder={form.managerProfitMode === "percent" ? "5" : "25.000"}
                value={form.managerProfitValue}
                onChange={(e) => setForm((f) => ({ ...f, managerProfitValue: e.target.value }))}
                className="field-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
            {saving ? t("saving") : t("templates.createButton")}
          </button>
        </form>
      )}

      {loading && <p className="mt-2 text-sm text-[var(--muted)]">{t("loadingHistory")}</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="mt-3 space-y-4">
          {Object.entries(byType).map(([type, list]) => (
            <div key={type}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {TYPE_LABELS[type] ?? type}
              </div>
              <ul className="space-y-2">
                {list.map((tpl) => (
                  <li
                    key={tpl.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      tpl.active
                        ? "border-[var(--border)] bg-[var(--surface-soft)]"
                        : "border-dashed border-[var(--border)] bg-transparent opacity-60"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{tpl.name}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {t("templates.listLine", {
                          price: formatVndPlain(tpl.sale_price_vnd),
                          office:
                            tpl.office_profit_mode === "percent"
                              ? `${tpl.office_profit_value}%`
                              : formatVndPlain(tpl.office_profit_value),
                          manager:
                            tpl.manager_profit_mode === "percent"
                              ? `${tpl.manager_profit_value}%`
                              : formatVndPlain(tpl.manager_profit_value),
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={toggling === tpl.id}
                      onClick={() => toggleActive(tpl)}
                      className="btn-secondary shrink-0 px-3 py-1 text-xs disabled:opacity-50"
                    >
                      {toggling === tpl.id ? "…" : tpl.active ? t("templates.disable") : t("templates.enable")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-[var(--muted)]">{t("templates.noTemplatesYet")}</p>
          )}
        </div>
      )}
    </section>
  );
}
