"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TourAccountingAckManifestButton({ tourId }: { tourId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function ack() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/manifest/ack-review`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || `Ошибка ${res.status}`);
        return;
      }
      router.refresh();
    } catch {
      alert("Нет соединения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void ack()}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-[11px] font-medium disabled:opacity-50"
    >
      {busy ? "…" : "Проверено (манифест)"}
    </button>
  );
}
