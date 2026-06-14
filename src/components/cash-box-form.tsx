"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatVndInput, parseVndInput } from "@/lib/format";

type EmployeeOption = { id: string; fullName: string };

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function CashBoxForm({
  employeeOptions,
  currentRate,
}: {
  employeeOptions: EmployeeOption[];
  currentRate: number;
}) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [empQuery, setEmpQuery] = useState("");
  const [empId, setEmpId] = useState("");
  const [empName, setEmpName] = useState("");
  const [showEmpList, setShowEmpList] = useState(false);
  const [currency, setCurrency] = useState<"VND" | "USD">("VND");
  const [payKind, setPayKind] = useState<"cash" | "bank_transfer">("cash");
  const [amountText, setAmountText] = useState("");
  const [bankRecipient, setBankRecipient] = useState("");
  const [bankName, setBankName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const empRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("cash");
  const tCommon = useTranslations("common");

  const rate = currentRate > 0 ? currentRate : 26000;

  const filteredEmps = empQuery.trim()
    ? employeeOptions.filter((e) =>
        e.fullName.toLowerCase().includes(empQuery.toLowerCase())
      )
    : employeeOptions;

  function selectEmp(e: EmployeeOption) {
    setEmpId(e.id);
    setEmpName(e.fullName);
    setEmpQuery(e.fullName);
    setShowEmpList(false);
  }

  function clearEmp() {
    setEmpId("");
    setEmpName("");
    setEmpQuery("");
  }

  const amountVndRaw = parseVndInput(amountText);
  const amountUsd = currency === "USD" ? (amountVndRaw > 0 ? amountVndRaw : 0) : 0;
  const amountVnd = currency === "USD" ? Math.round(amountUsd * rate) : amountVndRaw;

  function handleAmountChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    const n = digits ? Number(digits) : 0;
    setAmountText(n > 0 ? formatVndInput(n) : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (amountVnd <= 0) { setErr(t("enterAmount")); return; }
    const titleParts: string[] = [];
    if (empName.trim()) titleParts.push(empName.trim());
    titleParts.push(direction === "in" ? "поступление" : "выдача");
    const title = titleParts.join(" · ");

    let noteText = note.trim();
    if (payKind === "bank_transfer" && (bankRecipient.trim() || bankName.trim())) {
      const bankParts = [bankRecipient.trim(), bankName.trim()].filter(Boolean).join(", ");
      noteText = [bankParts, noteText].filter(Boolean).join(" · ");
    }

    const body: Record<string, unknown> = {
      direction,
      amountVnd,
      title,
      note: noteText || undefined,
      currencyCode: currency,
      paymentKind: payKind,
      employeeId: empId || undefined,
    };
    if (currency === "USD" && amountUsd > 0) {
      body.amountForeign = amountUsd;
      body.fxRateToVnd = rate;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/cash/manual-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setErr(j.error ?? t("errorStatus", { status: res.status })); return; }
      setAmountText("");
      setNote("");
      setBankRecipient("");
      setBankName("");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const dirBtn = "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors touch-manipulation";
  const dirBtnOn = "bg-[var(--accent)] text-white shadow-sm";
  const dirBtnOff = "bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)]";

  return (
    <form onSubmit={handleSubmit} className="card mb-3 space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text)]">{t("operationTitle")}</h2>

      {/* Направление */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setDirection("in")} className={cls(dirBtn, direction === "in" ? dirBtnOn : dirBtnOff)}>
          {t("incomeBtn")}
        </button>
        <button type="button" onClick={() => setDirection("out")} className={cls(dirBtn, direction === "out" ? "bg-red-600 text-white shadow-sm" : dirBtnOff)}>
          {t("expenseBtn")}
        </button>
      </div>

      {/* Сотрудник */}
      <div className="relative" ref={empRef}>
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("employee")}</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            placeholder={t("employeeOrDriverPlaceholder")}
            value={empQuery}
            onChange={(e) => {
              setEmpQuery(e.target.value);
              setEmpId("");
              setEmpName(e.target.value);
              setShowEmpList(true);
            }}
            onFocus={() => setShowEmpList(true)}
            onBlur={() => setTimeout(() => setShowEmpList(false), 150)}
          />
          {empQuery && (
            <button type="button" onClick={clearEmp} className="rounded-xl px-3 text-[var(--muted)] hover:text-[var(--text)]">✕</button>
          )}
        </div>
        {showEmpList && filteredEmps.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-lg">
            {filteredEmps.slice(0, 10).map((emp) => (
              <button
                key={emp.id}
                type="button"
                onMouseDown={() => selectEmp(emp)}
                className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-soft)]"
              >
                {emp.fullName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Сумма + валюта */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("amount")}</label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm tabular-nums"
            placeholder={currency === "USD" ? t("usdAmountPlaceholder") : "0"}
            value={amountText}
            onChange={(e) => handleAmountChange(e.target.value)}
          />
          <div className="flex rounded-xl overflow-hidden ring-1 ring-[var(--border)]">
            <button type="button" onClick={() => setCurrency("VND")}
              className={cls("px-3 py-2.5 text-xs font-semibold transition-colors", currency === "VND" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-[var(--muted)]")}>
              ₫
            </button>
            <button type="button" onClick={() => setCurrency("USD")}
              className={cls("px-3 py-2.5 text-xs font-semibold transition-colors", currency === "USD" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-[var(--muted)]")}>
              $
            </button>
          </div>
        </div>
        {currency === "USD" && amountVnd > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("approxRate", { amount: amountVnd.toLocaleString("ru-RU"), rate: rate.toLocaleString("ru-RU") })}
          </p>
        )}
      </div>

      {/* Способ */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{t("method")}</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPayKind("cash")}
            className={cls("flex-1 rounded-xl py-2 text-sm font-medium transition-colors", payKind === "cash" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)]")}>
            {t("cashMethod")}
          </button>
          <button type="button" onClick={() => setPayKind("bank_transfer")}
            className={cls("flex-1 rounded-xl py-2 text-sm font-medium transition-colors", payKind === "bank_transfer" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-[var(--muted)] ring-1 ring-[var(--border)]")}>
            {t("bank")}
          </button>
        </div>
      </div>

      {/* Банк: получатель и банк */}
      {payKind === "bank_transfer" && (
        <div className="space-y-2">
          <input
            type="text"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            placeholder={t("recipientPlaceholder")}
            value={bankRecipient}
            onChange={(e) => setBankRecipient(e.target.value)}
          />
          <input
            type="text"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            placeholder={t("bankCardPlaceholder")}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
      )}

      {/* Комментарий */}
      <input
        type="text"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
        placeholder={t("commentOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {err && <p className="text-xs text-red-500">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
      >
        {busy ? tCommon("saving") : direction === "in" ? t("recordIncome") : t("recordExpense")}
      </button>
    </form>
  );
}
