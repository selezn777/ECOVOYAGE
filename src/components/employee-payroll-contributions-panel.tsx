"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatVndInput, parseVndInput } from "@/lib/format";
import type { EmployeeFinanceCardData } from "@/lib/types";
import {
  VIETNAM_MROT_VND_BY_ZONE,
  VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT,
  VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT,
  formatVndPlain,
} from "@/lib/vietnam-payroll-hints";

function isoToYmdInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function EmployeePayrollContributionsPanel({ employee }: { employee: EmployeeFinanceCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [baseStr, setBaseStr] = useState(
    employee.payrollContributionBaseVnd != null ? formatVndInput(employee.payrollContributionBaseVnd) : "",
  );
  const [pitStr, setPitStr] = useState(
    employee.payrollPersonalIncomeTaxPercent != null ? String(employee.payrollPersonalIncomeTaxPercent) : "",
  );
  const [pensionStr, setPensionStr] = useState(
    employee.payrollPensionExtraPercent != null ? String(employee.payrollPensionExtraPercent) : "",
  );
  const [empPctStr, setEmpPctStr] = useState(
    employee.payrollSocialEmployeePercent != null
      ? String(employee.payrollSocialEmployeePercent)
      : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT),
  );
  const [emplPctStr, setEmplPctStr] = useState(
    employee.payrollSocialEmployerPercent != null
      ? String(employee.payrollSocialEmployerPercent)
      : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT),
  );
  const [mrotZone, setMrotZone] = useState<string>(employee.vietnamMrotZone ?? "");
  const [withheldYmd, setWithheldYmd] = useState(() => isoToYmdInput(employee.payrollIncomeTaxWithheldAt));
  const [declarationYmd, setDeclarationYmd] = useState(() => isoToYmdInput(employee.payrollTaxDeclarationFiledAt));

  useEffect(() => {
    setWithheldYmd(isoToYmdInput(employee.payrollIncomeTaxWithheldAt));
    setDeclarationYmd(isoToYmdInput(employee.payrollTaxDeclarationFiledAt));
  }, [employee.payrollIncomeTaxWithheldAt, employee.payrollTaxDeclarationFiledAt]);

  const baseVnd = useMemo(() => parseVndInput(baseStr), [baseStr]);
  const empPct = useMemo(() => {
    const x = Number(String(empPctStr).replace(",", "."));
    return Number.isFinite(x) ? x : VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT;
  }, [empPctStr]);
  const emplPct = useMemo(() => {
    const x = Number(String(emplPctStr).replace(",", "."));
    return Number.isFinite(x) ? x : VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT;
  }, [emplPctStr]);

  const mrotHint = mrotZone && mrotZone in VIETNAM_MROT_VND_BY_ZONE
    ? formatVndPlain(VIETNAM_MROT_VND_BY_ZONE[mrotZone as keyof typeof VIETNAM_MROT_VND_BY_ZONE])
    : null;

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const pitRaw = pitStr.trim() === "" ? null : Number(pitStr.replace(",", "."));
      const penRaw = pensionStr.trim() === "" ? null : Number(pensionStr.replace(",", "."));
      const empRaw = empPctStr.trim() === "" ? null : Number(empPctStr.replace(",", "."));
      const emplRaw = emplPctStr.trim() === "" ? null : Number(emplPctStr.replace(",", "."));
      const res = await fetch(`/api/users/${encodeURIComponent(employee.employeeId)}/payroll-contributions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollContributionBaseVnd: baseStr.trim() === "" ? null : baseVnd,
          payrollPersonalIncomeTaxPercent: pitStr.trim() === "" || pitRaw === null || !Number.isFinite(pitRaw) ? null : pitRaw,
          payrollPensionExtraPercent: pensionStr.trim() === "" || penRaw === null || !Number.isFinite(penRaw) ? null : penRaw,
          payrollSocialEmployeePercent: empRaw != null && Number.isFinite(empRaw) ? empRaw : null,
          payrollSocialEmployerPercent: emplRaw != null && Number.isFinite(emplRaw) ? emplRaw : null,
          vietnamMrotZone: mrotZone === "" ? null : mrotZone,
          payrollIncomeTaxWithheldOn: withheldYmd.trim() === "" ? null : withheldYmd.trim(),
          payrollTaxDeclarationFiledOn: declarationYmd.trim() === "" ? null : declarationYmd.trim(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const previewEmp = baseVnd > 0 ? Math.round((baseVnd * empPct) / 100) : null;
  const previewEmpl = baseVnd > 0 ? Math.round((baseVnd * emplPct) / 100) : null;

  return (
    <details className="card mb-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none">
        <h2 className="text-base font-semibold text-[var(--text)]">Налоги и взносы (база для расчётов)</h2>
      </summary>
      <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
      <p className="mb-3 text-xs text-[var(--muted)]">
        Укажите сумму, с которой считаются взносы (например 2 млн при фактической выплате 7 млн). Ставки BHXH/BHYT/BHTN
        (ориентир с 01.07.2025): сотрудник {VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT}%, работодатель{" "}
        {VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT}% от базы. МРОТ по зонам - подсказка; юридически база не должна быть ниже
        минимума для региона. Процент НДФЛ в карточке - не то же самое, что факт удержания или поданная декларация: даты ниже
        фиксируют этапы для отчёта «Отчёт» в CRM.
      </p>
      {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">База для взносов / налоговых подсказок, ₫</span>
          <input
            className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
            value={baseStr}
            onChange={(e) => setBaseStr(formatVndInput(parseVndInput(e.target.value)))}
            disabled={busy}
            placeholder="например 2 000 000"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Зона МРОТ (Вьетнам)</span>
          <select
            className="field-surface rounded-xl px-3 py-2 text-sm"
            value={mrotZone}
            onChange={(e) => setMrotZone(e.target.value)}
            disabled={busy}
          >
            <option value="">- не выбрано -</option>
            <option value="I">I</option>
            <option value="II">II (напр. Нячанг / Кханьхоа)</option>
            <option value="III">III</option>
            <option value="IV">IV</option>
          </select>
          {mrotHint ? <span className="text-[10px] text-[var(--muted)]">Ориентир МРОТ: {mrotHint}/мес.</span> : null}
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Налог на доход (НДФЛ), %</span>
          <input
            className="field-surface rounded-xl px-3 py-2 text-sm"
            value={pitStr}
            onChange={(e) => setPitStr(e.target.value)}
            disabled={busy}
            placeholder="пусто = не задано"
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Доп. пенсионный / страховой % (работодатель)</span>
          <input
            className="field-surface rounded-xl px-3 py-2 text-sm"
            value={pensionStr}
            onChange={(e) => setPensionStr(e.target.value)}
            disabled={busy}
            placeholder="опционально"
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Взносы сотрудника, %</span>
          <input
            className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
            value={empPctStr}
            onChange={(e) => setEmpPctStr(e.target.value)}
            disabled={busy}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted2)]">Взносы работодателя, %</span>
          <input
            className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
            value={emplPctStr}
            onChange={(e) => setEmplPctStr(e.target.value)}
            disabled={busy}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-[var(--muted2)]">Дата фиксации: НДФЛ удержан (учёт)</span>
          <input
            type="date"
            className="field-surface rounded-xl px-3 py-2 text-sm"
            value={withheldYmd}
            onChange={(e) => setWithheldYmd(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-[var(--muted2)]">Дата фиксации: налоговая декларация подана</span>
          <input
            type="date"
            className="field-surface rounded-xl px-3 py-2 text-sm"
            value={declarationYmd}
            onChange={(e) => setDeclarationYmd(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      {previewEmp != null && previewEmpl != null ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Предпросмотр от базы {formatVndPlain(baseVnd)}: удержание с сотрудника ≈ {formatVndPlain(previewEmp)} (
          {empPct}%), расход работодателя ≈ {formatVndPlain(previewEmpl)} ({emplPct}%).
        </p>
      ) : null}
      <button type="button" className="btn-primary mt-3 disabled:opacity-50" disabled={busy} onClick={() => void save()}>
        Сохранить
      </button>
      </div>
    </details>
  );
}
