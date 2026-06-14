"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function MyReportMonthPicker({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const p = new URLSearchParams(sp.toString());
    p.set("m", e.target.value);
    router.push(`/my-report?${p.toString()}`);
  }

  return (
    <input
      type="month"
      value={current}
      onChange={onChange}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-medium text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    />
  );
}
