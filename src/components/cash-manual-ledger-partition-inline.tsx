"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CashLedgerRow } from "@/lib/types";

/** Нейтральные подписи: без отсылок к внутренним «цветам» отчётов. */
export function CashManualLedgerPartitionInline({ row }: { row: CashLedgerRow }) {
  const router = useRouter();
  const isBankTransfer = row.manualLedgerPaymentKind === "bank_transfer";
  const [bucket, setBucket] = useState<"standard" | "instrumented">(
    row.manualLedgerBucket === "instrumented" ? "instrumented" : "standard",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = Boolean(row.manualLedgerBucketOkAt);
  const id = row.sourceId;

  useEffect(() => {
    setBucket(row.manualLedgerBucket === "instrumented" ? "instrumented" : "standard");
  }, [row.manualLedgerBucket, row.manualLedgerBucketOkAt, id]);

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/cash/manual-ledger/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgerBucket: bucket, confirm: true }),
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
  };

  if (!isBankTransfer) {
    return null;
  }

  return (
    <div className="mt-1.5 max-w-[17rem] rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1.5 text-[11px] leading-snug">
      <div className="font-medium text-[var(--muted2)]">Контур отражения</div>
      <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <select
          className="field-surface rounded-lg px-2 py-1 text-[11px]"
          value={bucket}
          disabled={busy}
          onChange={(e) => setBucket(e.target.value as "standard" | "instrumented")}
          aria-label="Контур отражения операции"
        >
          <option value="standard">Основной журнал</option>
          <option value="instrumented">С банковским следом</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[var(--surface)] px-2 py-1 text-[11px] font-medium ring-1 ring-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {busy ? "…" : ok ? "Сохранить" : "Зафиксировать"}
        </button>
      </div>
      {!ok ? (
        <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200/90">Нужна отметка классификации</p>
      ) : null}
      {err ? <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{err}</p> : null}
    </div>
  );
}
