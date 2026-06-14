"use client";

import { NumericRollSelect } from "@/components/numeric-roll-select";
import { useEffect, useState } from "react";

export function ManagerSalaryPayoutDayCard() {
  const [day, setDay] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/company/payroll-calendar");
        const j = (await res.json().catch(() => ({}))) as { managerSalaryPayoutDay?: number };
        if (!cancelled && res.ok && typeof j.managerSalaryPayoutDay === "number") {
          setDay(j.managerSalaryPayoutDay);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/company/payroll-calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerSalaryPayoutDay: day }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="card mb-3">
      <h2 className="mb-1 text-base font-semibold">Выплата % менеджерам</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Число месяца, когда сотрудники получают процент с броней (после того как наличные сданы в кассу). Сбор с менеджеров
        ведётся отдельно по факту.
      </p>
      {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">День месяца (1-30)</span>
          <NumericRollSelect
            aria-label="День выплаты процентов"
            className="field-surface min-w-[5.5rem] rounded-xl px-3 py-2 text-sm tabular-nums"
            min={1}
            max={30}
            value={day}
            onChange={setDay}
            disabled={busy}
          />
        </label>
        <button type="button" className="btn-primary disabled:opacity-50" disabled={busy} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
    </section>
  );
}
