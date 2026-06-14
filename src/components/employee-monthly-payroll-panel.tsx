"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import type { EmployeeFinanceCardData, EmployeeMonthlyPayrollRecordRow } from "@/lib/types";
import { showConfirm } from "@/lib/ui-dialog";
import {
  VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT,
  VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT,
} from "@/lib/vietnam-payroll-hints";

function periodYmLabelRu(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("ru-RU", { month: "long", year: "numeric" });
}

function defaultPeriodYm(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function parsePercent(raw: string, fallback: number): number {
  const x = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(100, x));
}

function nextMonthSameDayYmd(fromYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromYmd);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return "";
  const lastDayNextMonth = new Date(y, mo + 1, 0).getDate();
  const safeDay = Math.min(d, lastDayNextMonth);
  const dt = new Date(y, mo, safeDay);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function EmployeeMonthlyPayrollPanel({
  employee,
  viewerCanEdit,
}: {
  employee: EmployeeFinanceCardData;
  viewerCanEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [periodYm, setPeriodYm] = useState(defaultPeriodYm);
  const [calculationDate, setCalculationDate] = useState("");
  const [grossStr, setGrossStr] = useState("");
  const [pitStr, setPitStr] = useState("");
  const [socEmpStr, setSocEmpStr] = useState("");
  const [socEmplStr, setSocEmplStr] = useState("");
  const [netStr, setNetStr] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [note, setNote] = useState("");
  const [pitPctStr, setPitPctStr] = useState(
    employee.payrollPersonalIncomeTaxPercent != null ? String(employee.payrollPersonalIncomeTaxPercent) : "0",
  );
  const [socEmpPctStr, setSocEmpPctStr] = useState(
    employee.payrollSocialEmployeePercent != null
      ? String(employee.payrollSocialEmployeePercent)
      : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT),
  );
  const [socEmplPctStr, setSocEmplPctStr] = useState(
    employee.payrollSocialEmployerPercent != null
      ? String(employee.payrollSocialEmployerPercent)
      : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT),
  );

  const resetForm = () => {
    setEditId(null);
    setPeriodYm(defaultPeriodYm());
    setCalculationDate("");
    setGrossStr("");
    setPitStr("");
    setSocEmpStr("");
    setSocEmplStr("");
    setNetStr("");
    setPaidDate("");
    setNote("");
    setPitPctStr(employee.payrollPersonalIncomeTaxPercent != null ? String(employee.payrollPersonalIncomeTaxPercent) : "0");
    setSocEmpPctStr(
      employee.payrollSocialEmployeePercent != null
        ? String(employee.payrollSocialEmployeePercent)
        : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT),
    );
    setSocEmplPctStr(
      employee.payrollSocialEmployerPercent != null
        ? String(employee.payrollSocialEmployerPercent)
        : String(VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT),
    );
  };

  const gross = useMemo(() => parseVndInput(grossStr), [grossStr]);
  const pit = useMemo(() => parseVndInput(pitStr), [pitStr]);
  const socE = useMemo(() => parseVndInput(socEmpStr), [socEmpStr]);
  const netHint = useMemo(() => {
    if (gross <= 0) return null;
    const n = gross - pit - socE;
    return n >= 0 ? n : null;
  }, [gross, pit, socE]);
  const pitPct = useMemo(() => parsePercent(pitPctStr, 0), [pitPctStr]);
  const socEmpPct = useMemo(
    () => parsePercent(socEmpPctStr, VIETNAM_SOCIAL_DEFAULT_EMPLOYEE_PCT),
    [socEmpPctStr],
  );
  const socEmplPct = useMemo(
    () => parsePercent(socEmplPctStr, VIETNAM_SOCIAL_DEFAULT_EMPLOYER_PCT),
    [socEmplPctStr],
  );
  const autoPitVnd = useMemo(() => Math.round((gross * pitPct) / 100), [gross, pitPct]);
  const autoSocEmpVnd = useMemo(() => Math.round((gross * socEmpPct) / 100), [gross, socEmpPct]);
  const autoSocEmplVnd = useMemo(() => Math.round((gross * socEmplPct) / 100), [gross, socEmplPct]);
  const autoNetVnd = useMemo(() => Math.max(0, gross - autoPitVnd - autoSocEmpVnd), [gross, autoPitVnd, autoSocEmpVnd]);

  function applyAutoPayrollMath() {
    setPitStr(formatVndInput(autoPitVnd));
    setSocEmpStr(formatVndInput(autoSocEmpVnd));
    setSocEmplStr(formatVndInput(autoSocEmplVnd));
    setNetStr(formatVndInput(autoNetVnd));
  }

  function fillFromRow(r: EmployeeMonthlyPayrollRecordRow) {
    setEditId(r.id);
    setPeriodYm(r.periodYm);
    setCalculationDate(r.calculationDate ?? "");
    setGrossStr(formatVndInput(r.grossSalaryVnd));
    setPitStr(formatVndInput(r.personalIncomeTaxVnd));
    setSocEmpStr(formatVndInput(r.socialInsuranceEmployeeVnd));
    setSocEmplStr(formatVndInput(r.socialInsuranceEmployerVnd));
    setNetStr(formatVndInput(r.netSalaryVnd));
    setPaidDate(r.paidDate ?? "");
    setNote(r.note ?? "");
  }

  async function toggleTracking(enabled: boolean) {
    if (!viewerCanEdit || trackingBusy) return;
    setTrackingBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(employee.employeeId)}/monthly-payroll-tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setTrackingBusy(false);
    }
  }

  async function save() {
    if (!viewerCanEdit || busy) return;
    const grossV = parseVndInput(grossStr);
    if (!/^\d{4}-\d{2}$/.test(periodYm)) {
      setErr("Укажите период (месяц).");
      return;
    }
    if (grossV <= 0) {
      setErr("Укажите начисленную сумму (валовая).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        periodYm,
        calculationDate: calculationDate.trim() || null,
        grossSalaryVnd: grossV,
        personalIncomeTaxVnd: parseVndInput(pitStr) || autoPitVnd,
        socialInsuranceEmployeeVnd: parseVndInput(socEmpStr) || autoSocEmpVnd,
        socialInsuranceEmployerVnd: parseVndInput(socEmplStr) || autoSocEmplVnd,
        netSalaryVnd: parseVndInput(netStr) || autoNetVnd,
        paidDate: paidDate.trim() || null,
        note: note.trim() || undefined,
      };

      if (editId) {
        const res = await fetch(`/api/team/${employee.employeeId}/monthly-payroll/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calculationDate: payload.calculationDate,
            grossSalaryVnd: payload.grossSalaryVnd,
            personalIncomeTaxVnd: payload.personalIncomeTaxVnd,
            socialInsuranceEmployeeVnd: payload.socialInsuranceEmployeeVnd,
            socialInsuranceEmployerVnd: payload.socialInsuranceEmployerVnd,
            netSalaryVnd: payload.netSalaryVnd,
            paidDate: payload.paidDate,
            note: payload.note ?? null,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
          return;
        }
      } else {
        const res = await fetch(`/api/team/${employee.employeeId}/monthly-payroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
          return;
        }
      }
      resetForm();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!viewerCanEdit || busy) return;
    const ok = await showConfirm("Удалить строку за этот месяц?");
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/team/${employee.employeeId}/monthly-payroll/${id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : `Ошибка ${res.status}`);
        return;
      }
      if (editId === id) resetForm();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!employee.monthlyPayrollTrackingEnabled) {
    return (
      <section className="card mb-3">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Ежемесячная зарплата</h2>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Регистр помесячных начислений, удержаний (НДФЛ, BHXH сотрудника) и взносов работодателя. Нужен для сотрудников с
          окладом и «грязной» зарплатой; связывайте с блоком «Налоги и взносы» выше.
        </p>
        {viewerCanEdit ? (
          <button
            type="button"
            className="btn-primary mt-3 px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={trackingBusy}
            onClick={() => void toggleTracking(true)}
          >
            {trackingBusy ? "…" : "Включить учёт в карточке"}
          </button>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">Включить учёт может директор, главный менеджер или бухгалтерия.</p>
        )}
      </section>
    );
  }

  return (
    <details className="card mb-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none">
        <h2 className="text-base font-semibold text-[var(--text)]">Ежемесячная зарплата</h2>
      </summary>
      <div className="mt-3 border-t border-[var(--border)]/60 pt-3">
        <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
          <strong className="font-medium text-[var(--text)]">Структура:</strong> период (месяц).{" "}
          <strong className="font-medium text-[var(--text)]">Начислено</strong> - валовая сумма до удержаний.{" "}
          <strong className="font-medium text-[var(--text)]">НДФЛ</strong> и <strong className="font-medium text-[var(--text)]">BHXH сотрудника</strong> -
          удержания с сотрудника. <strong className="font-medium text-[var(--text)]">Взносы работодателя</strong> - нагрузка компании (часто
          отражается отдельно в управленческом учёте). <strong className="font-medium text-[var(--text)]">На руки</strong> - факт к выплате
          сотруднику. <strong className="font-medium text-[var(--text)]">Дата расчёта</strong> - когда закрыли ведомость;{" "}
          <strong className="font-medium text-[var(--text)]">дата выплаты</strong> - когда ушли деньги.
        </p>
        {viewerCanEdit ? (
          <button
            type="button"
            className="mb-3 text-xs font-medium text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]"
            disabled={trackingBusy}
            onClick={() => void toggleTracking(false)}
          >
            Отключить учёт (строки не удаляются)
          </button>
        ) : null}

        {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        {viewerCanEdit ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-3 sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
              {editId ? "Изменить запись" : "Добавить или перезаписать месяц"}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Период (месяц)</span>
                <input
                  type="month"
                  value={periodYm}
                  onChange={(e) => setPeriodYm(e.target.value)}
                  disabled={busy || Boolean(editId)}
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Дата расчёта</span>
                <input
                  type="date"
                  value={calculationDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCalculationDate(v);
                    if (v && !editId) setPaidDate(nextMonthSameDayYmd(v));
                  }}
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Дата выплаты</span>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Начислено (валовая), ₫</span>
                <input
                  value={grossStr}
                  onChange={(e) => {
                    setGrossStr(formatVndInput(parseVndInput(e.target.value)));
                  }}
                  onBlur={() => applyAutoPayrollMath()}
                  inputMode="numeric"
                  placeholder="0"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">НДФЛ, % (по закону/политике)</span>
                <input
                  value={pitPctStr}
                  onChange={(e) => setPitPctStr(e.target.value)}
                  onBlur={() => applyAutoPayrollMath()}
                  inputMode="decimal"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">ВНХН сотрудника, %</span>
                <input
                  value={socEmpPctStr}
                  onChange={(e) => setSocEmpPctStr(e.target.value)}
                  onBlur={() => applyAutoPayrollMath()}
                  inputMode="decimal"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Взносы работодателя, %</span>
                <input
                  value={socEmplPctStr}
                  onChange={(e) => setSocEmplPctStr(e.target.value)}
                  onBlur={() => applyAutoPayrollMath()}
                  inputMode="decimal"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">НДФЛ (удержанный), ₫</span>
                <input
                  value={pitStr}
                  onChange={(e) => setPitStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">BHXH сотрудника, ₫</span>
                <input
                  value={socEmpStr}
                  onChange={(e) => setSocEmpStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">Взносы работодателя, ₫</span>
                <input
                  value={socEmplStr}
                  onChange={(e) => setSocEmplStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-[var(--muted2)]">На руки, ₫</span>
                <input
                  value={netStr}
                  onChange={(e) => setNetStr(formatVndInput(parseVndInput(e.target.value)))}
                  inputMode="numeric"
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-2 lg:col-span-3">
                <span className="font-medium text-[var(--muted2)]">Комментарий</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  disabled={busy}
                  className="field-surface rounded-xl px-3 py-2 text-sm"
                  placeholder="Номер ведомости, примечание"
                />
              </label>
            </div>
            {netHint != null ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Подсказка: валовая − НДФЛ − BHXH сотрудника ≈{" "}
                <button
                  type="button"
                  className="font-medium text-[var(--text)] underline underline-offset-2"
                  onClick={() => setNetStr(formatVndInput(netHint))}
                >
                  {formatVnd(netHint)}
                </button>
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[var(--muted)]">
              Авторасчёт по ставкам: НДФЛ {pitPct}% · ВНХН сотрудника {socEmpPct}% · взносы работодателя {socEmplPct}%.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={busy || gross <= 0}
                onClick={() => applyAutoPayrollMath()}
              >
                Пересчитать автоматически
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "Сохранение…" : editId ? "Сохранить изменения" : "Сохранить месяц"}
              </button>
              {editId ? (
                <button type="button" className="btn-secondary px-4 py-2 text-sm font-medium" disabled={busy} onClick={() => resetForm()}>
                  Отмена
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mb-3 text-xs text-[var(--muted)]">Редактирование могут директор, главный менеджер или бухгалтерия.</p>
        )}

        {employee.monthlyPayrollRecords.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Пока нет записей по месяцам.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">
                  <th className="py-2 pr-2">Период</th>
                  <th className="py-2 pr-2">Расчёт</th>
                  <th className="py-2 pr-2 text-right">Валовая</th>
                  <th className="py-2 pr-2 text-right">НДФЛ</th>
                  <th className="py-2 pr-2 text-right">BHXH сотр.</th>
                  <th className="py-2 pr-2 text-right">Взносы раб.</th>
                  <th className="py-2 pr-2 text-right">На руки</th>
                  <th className="py-2 pr-2">Выплата</th>
                  {viewerCanEdit ? <th className="py-2 pr-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {employee.monthlyPayrollRecords.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-2 font-medium">{periodYmLabelRu(r.periodYm)}</td>
                    <td className="py-2 pr-2 text-xs text-[var(--muted)]">
                      {r.calculationDate
                        ? new Date(r.calculationDate + "T12:00:00").toLocaleDateString("ru-RU")
                        : "-"}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatVnd(r.grossSalaryVnd)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatVnd(r.personalIncomeTaxVnd)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatVnd(r.socialInsuranceEmployeeVnd)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatVnd(r.socialInsuranceEmployerVnd)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums font-medium">{formatVnd(r.netSalaryVnd)}</td>
                    <td className="py-2 pr-2 text-xs text-[var(--muted)]">
                      {r.paidDate ? new Date(r.paidDate + "T12:00:00").toLocaleDateString("ru-RU") : "-"}
                    </td>
                    {viewerCanEdit ? (
                      <td className="py-2 pr-2 whitespace-nowrap text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--text)] underline underline-offset-2"
                          disabled={busy}
                          onClick={() => fillFromRow(r)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="ml-2 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                          disabled={busy}
                          onClick={() => void removeRow(r.id)}
                        >
                          Удалить
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {employee.monthlyPayrollRecords.some((r) => r.note) ? (
              <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                {employee.monthlyPayrollRecords
                  .filter((r) => r.note)
                  .map((r) => (
                    <li key={`n-${r.id}`}>
                      <span className="font-medium text-[var(--text)]">{periodYmLabelRu(r.periodYm)}:</span> {r.note}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}
