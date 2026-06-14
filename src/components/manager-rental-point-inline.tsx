"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RosterUser } from "@/lib/types";

type PointOpt = { id: string; name: string };

export function ManagerRentalPointInline({
  r,
  onSaved,
  disabledReason,
}: {
  r: RosterUser;
  onSaved?: () => void;
  disabledReason?: string | null;
}) {
  const [points, setPoints] = useState<PointOpt[] | null>(null);
  const [value, setValue] = useState<string>(r.rentalPointId ?? "");
  const [loadingPts, setLoadingPts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setValue(r.rentalPointId ?? "");
  }, [r.rentalPointId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPts(true);
      try {
        const res = await fetch("/api/rental-points");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setPoints([]);
          return;
        }
        const raw = (data.points as { id: string; name: string }[] | undefined) ?? [];
        if (!cancelled) setPoints(raw.map((p) => ({ id: p.id, name: p.name })));
      } finally {
        if (!cancelled) setLoadingPts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (disabledReason) return;
    setErr(null);
    const rentalPointId = value === "" ? null : value;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(r.id)}/rental-point`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalPointId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      router.refresh();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="text-xs sm:text-sm">
      <div className="text-[var(--muted)] mb-1.5 text-[11px] font-medium leading-snug sm:text-xs">Точка продаж</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        <select
          className="field-surface min-h-10 w-full max-w-full flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] touch-manipulation sm:max-w-[240px]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loadingPts || points === null || Boolean(disabledReason)}
          aria-label="Точка продаж для менеджера"
        >
          <option value="">Не закреплено</option>
          {(points ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving || loadingPts || Boolean(disabledReason)}
          onClick={save}
          className="inline-flex h-10 min-h-10 min-w-[7.5rem] shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-white shadow-sm ring-1 ring-black/15 transition-[transform,filter] hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? "…" : "Сохранить"}
        </button>
      </div>
      {disabledReason ? <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">{disabledReason}</p> : null}
      {err ? <p className="mt-1.5 text-[11px] text-red-600">{err}</p> : null}
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted2)] sm:text-[11px]">
        Видят только директор и главный менеджер. Сводка — в «Точки продаж».
      </p>
    </div>
  );
}
