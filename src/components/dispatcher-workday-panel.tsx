"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Tour, TourExpense } from "@/lib/types";
import { formatVnd, formatVndInput } from "@/lib/format";
import { DispatcherTicketSalesLive } from "@/components/dispatcher-ticket-sales-live";
import { ExpenseAttachmentOpener } from "@/components/expense-attachment-opener";

function parseVnd(raw: string): number {
  const d = raw.replace(/\D/g, "");
  return d ? Number(d) : 0;
}

async function compressPhoto(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function StatusChip({
  ok,
  label,
  okLabel,
}: {
  ok: boolean;
  label: string;
  okLabel?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        ok
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/40"
          : "bg-red-50 text-red-800 ring-1 ring-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-800/40"
      }`}
    >
      {ok ? "✓" : "✗"} {ok ? (okLabel ?? label) : label}
    </span>
  );
}

function ExpenseRow({ expense }: { expense: TourExpense }) {
  const reviewState = expense.accountantReviewState;
  const dotColor =
    reviewState === "approved"
      ? "bg-emerald-500"
      : reviewState === "recheck"
        ? "bg-amber-500"
        : expense.pendingAccountantReview
          ? "bg-sky-500"
          : "bg-[var(--muted2)]";

  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-xs">
      <div className="flex min-w-0 items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        <span className="min-w-0 break-words text-[var(--text)]">{expense.description || "—"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums font-medium text-[var(--text)]">{formatVnd(expense.amountVnd)}</span>
        {expense.attachmentUrl ? (
          <ExpenseAttachmentOpener url={expense.attachmentUrl} variant="text" text="📎" buttonClassName="text-sky-600 dark:text-sky-400 text-xs" />
        ) : null}
      </div>
    </div>
  );
}

function AddExpenseForm({
  tourId,
  onSaved,
}: {
  tourId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("dispatcherWorkday");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const vnd = parseVnd(amount);
    if (vnd <= 0) { alert(t("amountRequired")); return; }
    if (!desc.trim()) { alert(t("descRequired")); return; }
    setBusy(true);
    try {
      let attachmentDataUrl: string | undefined;
      if (photoFile) {
        attachmentDataUrl = (await compressPhoto(photoFile)) ?? undefined;
      }
      const res = await fetch(`/api/tours/${tourId}/guide-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountVnd: vnd, description: desc.trim(), attachmentDataUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        alert(j.error ?? t("saveError"));
        return;
      }
      setAmount("");
      setDesc("");
      setPhotoFile(null);
      setPhotoName("");
      onSaved();
    } catch {
      alert(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-2 space-y-2 rounded-xl bg-[var(--surface-soft)] p-3 ring-1 ring-[var(--border)]">
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setAmount(v ? formatVndInput(Number(v)) : "");
          }}
          inputMode="numeric"
          placeholder={t("amount")}
          className="field-surface w-28 shrink-0 rounded-lg px-2.5 py-2 text-sm tabular-nums"
          disabled={busy}
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t("description")}
          className="field-surface min-w-0 flex-1 rounded-lg px-2.5 py-2 text-sm"
          disabled={busy}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {photoName ? `📎 ${photoName.slice(0, 18)}` : `📷 ${t("photo")}`}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setPhotoFile(f);
            setPhotoName(f?.name ?? "");
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-auto rounded-xl bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

function TourCard({
  tour,
  expenses: initialExpenses,
}: {
  tour: Tour;
  expenses: TourExpense[];
}) {
  const t = useTranslations("dispatcherWorkday");
  const router = useRouter();
  const [expenses] = useState(initialExpenses);
  const [addOpen, setAddOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(initialExpenses.length > 0);

  const hasBus = (tour.busCount ?? 0) > 0 || (tour.buses?.length ?? 0) > 0;
  const hasGuide = Boolean(tour.guideName && tour.guideName !== t("noGuide"));
  const primaryGuide = tour.assignedGuides?.find((g) => g.isPrimary);
  const guideLabel = primaryGuide?.fullName ?? tour.guideName ?? "—";
  const expTotal = expenses.reduce((s, e) => s + e.amountVnd, 0);
  const busLabel = tour.buses?.[0]
    ? `${tour.buses[0].busNumber}${tour.buses[0].seats ? ` (${tour.buses[0].seats})` : ""}`
    : tour.busInfo ?? "";

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
      {/* Header */}
      <Link
        href={`/tours/${tour.id}`}
        className="block bg-[var(--surface)] px-3 py-3 hover:bg-[var(--surface-soft)]"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-semibold leading-snug text-[var(--text)]">{tour.name}</p>
          <span className="shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
            {tour.paxHeadcount ?? tour.booked} {t("pax")}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{tour.pickupWindow}</p>
      </Link>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
        <StatusChip ok={hasBus} label={t("noBus")} okLabel={busLabel || t("bus")} />
        <StatusChip ok={hasGuide} label={t("noGuide")} okLabel={guideLabel} />
        {tour.hasDispatcherBooking ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200/80 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800/40">
            ✓ {t("noteSet")}
          </span>
        ) : null}
      </div>

      {/* Expenses */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={() => setExpOpen((s) => !s)}
          className="flex w-full items-center justify-between text-xs font-semibold text-[var(--muted)]"
        >
          <span>
            {t("expenses")}{" "}
            {expenses.length > 0 ? (
              <span className="ml-1 tabular-nums text-[var(--text)]">
                {expenses.length} · {formatVnd(expTotal)}
              </span>
            ) : (
              <span className="font-normal text-[var(--muted2)]">{t("noExpenses")}</span>
            )}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 transition-transform ${expOpen ? "rotate-180" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {expOpen ? (
          <div className="mt-1.5">
            {expenses.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {expenses.map((e) => (
                  <ExpenseRow key={e.id} expense={e} />
                ))}
              </div>
            ) : null}

            {addOpen ? (
              <AddExpenseForm
                tourId={tour.id}
                onSaved={() => {
                  setAddOpen(false);
                  router.refresh();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] py-2 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                + {t("addExpense")}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DispatcherWorkdayPanel({
  tours,
  expensesByTour,
  todayYmd,
  tomorrowYmd,
  dayAfterYmd,
}: {
  tours: Tour[];
  expensesByTour: Record<string, TourExpense[]>;
  todayYmd: string;
  tomorrowYmd: string;
  dayAfterYmd: string;
}) {
  const t = useTranslations("dispatcherWorkday");
  const [activeDate, setActiveDate] = useState(todayYmd);

  const tabs = [
    { ymd: todayYmd, label: t("today") },
    { ymd: tomorrowYmd, label: t("tomorrow") },
    { ymd: dayAfterYmd, label: t("dayAfter") },
  ];

  const visibleTours = tours.filter((t) => t.date === activeDate);

  function formatTabDate(ymd: string): string {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    return `${m[3]}.${m[2]}`;
  }

  return (
    <div className="space-y-4">
      {/* Date tabs */}
      <div className="flex overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
        {tabs.map((tab) => {
          const count = tours.filter((t) => t.date === tab.ymd).length;
          return (
            <button
              key={tab.ymd}
              type="button"
              onClick={() => setActiveDate(tab.ymd)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-center transition-colors ${
                activeDate === tab.ymd
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
              }`}
            >
              <span className="text-[13px] font-semibold">{tab.label}</span>
              <span className={`text-[10px] tabular-nums ${activeDate === tab.ymd ? "text-white/80" : "text-[var(--muted2)]"}`}>
                {formatTabDate(tab.ymd)} · {count} {t("toursCount")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tour list */}
      {visibleTours.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-soft)] px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--border)]">
          {t("noTours")}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTours.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              expenses={expensesByTour[tour.id] ?? []}
            />
          ))}
        </div>
      )}

      {/* Tickets section */}
      <div className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text)]">
          {t("tickets")}
        </div>
        <div className="bg-[var(--surface)] p-3">
          <DispatcherTicketSalesLive />
        </div>
      </div>
    </div>
  );
}
