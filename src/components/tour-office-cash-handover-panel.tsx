"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatUsd, formatVnd, formatVndInput } from "@/lib/format";
import type { OfficeCashHandoverChannelDef, TourOfficeCashHandoverRow } from "@/lib/types";

type ManagerOpt = { id: string; fullName: string };
type GuideOpt = { id: string; fullName: string };

export type HandoverBookingOption = {
  id: string;
  managerId: string;
  label: string;
  maxHandoverVnd: number;
};

function defaultHandoverChannelId(opts: OfficeCashHandoverChannelDef[]): string {
  return opts.find((c) => c.slug === "cash_vnd")?.id ?? opts[0]?.id ?? "";
}

function parseVnd(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function parseUsdInput(raw: string): number {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function TourOfficeCashHandoverPanel(props: {
  tourId: string;
  initialRows: TourOfficeCashHandoverRow[];
  managerOptions: ManagerOpt[];
  guideOptions: GuideOpt[];
  channelOptions: OfficeCashHandoverChannelDef[];
  preferredHolderRole?: "manager" | "guide";
  handoverBookingOptions?: HandoverBookingOption[];
}) {
  const { tourId, initialRows, managerOptions, guideOptions, channelOptions, preferredHolderRole, handoverBookingOptions } =
    props;
  const router = useRouter();
  const t = useTranslations("cashHandover");
  const tCash = useTranslations("cash");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [holderRole, setHolderRole] = useState<"manager" | "guide">(preferredHolderRole ?? "guide");
  const [employeeId, setEmployeeId] = useState("");
  const [channelId, setChannelId] = useState(() => defaultHandoverChannelId(channelOptions));
  const [amountText, setAmountText] = useState("");
  const [usdText, setUsdText] = useState("");
  const [note, setNote] = useState("");
  const [bookingIdForHandover, setBookingIdForHandover] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Свернутый по умолчанию блок «способ оплаты / комментарий» — большинству сдач хватает значения по умолчанию. */
  const [moreOpen, setMoreOpen] = useState(false);

  const selectedChannel = useMemo(
    () => channelOptions.find((c) => c.id === channelId),
    [channelOptions, channelId],
  );
  const needsUsd = selectedChannel?.expectsUsdAmount === true;

  const options = holderRole === "manager" ? managerOptions : guideOptions;

  const bookingChoices = useMemo(() => {
    const src = handoverBookingOptions ?? [];
    if (holderRole === "guide") return src;
    if (!employeeId) return [];
    return src.filter((b) => b.managerId === employeeId);
  }, [handoverBookingOptions, holderRole, employeeId]);

  const maxByBindingVnd = useMemo(() => {
    if (bookingIdForHandover) {
      return bookingChoices.find((b) => b.id === bookingIdForHandover)?.maxHandoverVnd ?? 0;
    }
    return bookingChoices.reduce((s, b) => s + Math.max(0, b.maxHandoverVnd), 0);
  }, [bookingChoices, bookingIdForHandover]);

  useEffect(() => {
    if (!preferredHolderRole) return;
    setHolderRole(preferredHolderRole);
    setEmployeeId("");
    setBookingIdForHandover("");
  }, [preferredHolderRole]);

  useEffect(() => {
    if (holderRole !== "guide" || employeeId) return;
    const first = guideOptions[0]?.id;
    if (first) setEmployeeId(first);
  }, [holderRole, guideOptions, employeeId]);

  useEffect(() => {
    setBookingIdForHandover("");
  }, [holderRole, employeeId]);

  useEffect(() => {
    if (maxByBindingVnd > 0) {
      setAmountText(formatVndInput(maxByBindingVnd));
    } else {
      setAmountText("");
    }
  }, [maxByBindingVnd]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountVnd = parseVnd(amountText);
    if (amountVnd <= 0) {
      alert(t("enterAmountInDong"));
      return;
    }
    if (!employeeId) {
      alert(t("selectEmployeeAlert"));
      return;
    }
    if (!channelId) {
      alert(t("noPaymentMethodsHint"));
      return;
    }
    const amountUsd = needsUsd ? parseUsdInput(usdText) : undefined;
    if (needsUsd && (!amountUsd || amountUsd <= 0)) {
      alert(t("enterUsdAmountAlert"));
      return;
    }
    if (maxByBindingVnd > 0 && amountVnd > maxByBindingVnd) {
      alert(t("maxForBindingExceeded", { amount: formatVnd(maxByBindingVnd) }));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/office-cash-handovers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holderRole,
          employeeId,
          amountVnd,
          channelId,
          amountUsd: needsUsd ? amountUsd : undefined,
          note: note.trim() || undefined,
          bookingId: bookingIdForHandover || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string | { formErrors?: string[] } };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : Array.isArray(j.error?.formErrors)
              ? j.error.formErrors.join(" ")
              : t("failedToSave");
        throw new Error(msg);
      }
      setAmountText("");
      setUsdText("");
      setNote("");
      setBookingIdForHandover("");
      setMoreOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">{t("acceptToCash")}</h2>

      {/* История сдач */}
      {initialRows.length > 0 ? (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
          >
            <span>
              {t("alreadyAccepted", {
                n: initialRows.length,
                word: t(initialRows.length === 1 ? "recordSingular" : "recordPlural"),
              })}{" "}
              <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                +{formatVnd(initialRows.reduce((s, r) => s + r.amountVnd, 0))}
              </span>
            </span>
            <svg
              className={`h-4 w-4 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {historyOpen ? (
            <ul className="mt-1.5 space-y-1 text-xs">
              {initialRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 ring-1 ring-[var(--border)]"
                >
                  <span className="text-[var(--text)]">
                    {new Date(r.receivedAt).toLocaleString("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · {r.channelLabel} · {r.holderRole === "manager" ? t("roleManagerAbbr") : t("roleGuide")} {r.employeeName}
                    {r.bookingGuestLabel ? ` · ${r.bookingGuestLabel}` : ""}
                    {r.amountUsd != null ? ` · ${formatUsd(r.amountUsd)}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                    +{formatVnd(r.amountVnd)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        {/* Row 1: Role tabs + Employee */}
        <div className="flex gap-2">
          {/* Role toggle (hidden when the flow already targets a specific role) */}
          {preferredHolderRole ? (
            <span className="flex shrink-0 items-center rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white">
              {preferredHolderRole === "guide" ? t("roleGuide") : t("roleManager")}
            </span>
          ) : (
            <div className="flex overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              <button
                type="button"
                onClick={() => { setHolderRole("guide"); setEmployeeId(""); }}
                disabled={busy}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  holderRole === "guide"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                {t("roleGuide")}
              </button>
              <button
                type="button"
                onClick={() => { setHolderRole("manager"); setEmployeeId(""); }}
                disabled={busy}
                className={`border-l border-[var(--border)] px-3 py-2 text-xs font-semibold transition-colors ${
                  holderRole === "manager"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                {t("roleManager")}
              </button>
            </div>
          )}

          {/* Employee select */}
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="field-surface min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
            disabled={busy || options.length === 0}
          >
            <option value="">{t("selectEmployeePlaceholder")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Booking picker (when available) */}
        {bookingChoices.length > 0 ? (
          <select
            value={bookingIdForHandover}
            onChange={(e) => setBookingIdForHandover(e.target.value)}
            className="field-surface w-full rounded-lg px-3 py-2 text-sm"
            disabled={busy}
          >
            <option value="">{t("noBookingBinding")}</option>
            {bookingChoices.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        ) : null}

        {/* Row 2: Amount (+ Channel when expanded) */}
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <input
              value={amountText}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (!v) { setAmountText(""); return; }
                let n = Number(v);
                if (maxByBindingVnd > 0) n = Math.min(n, maxByBindingVnd);
                setAmountText(
                  Number.isFinite(n)
                    ? Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                    : "",
                );
              }}
              inputMode="numeric"
              placeholder={t("amountVndPlaceholder")}
              className="field-surface rounded-lg px-3 py-2 text-sm tabular-nums"
              disabled={busy}
            />
            {maxByBindingVnd > 0 ? (
              <span className="text-[10px] text-[var(--muted2)]">
                {t("maxAmountLabel", { amount: formatVnd(maxByBindingVnd) })}
              </span>
            ) : null}
          </div>

          {moreOpen ? (
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="field-surface min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
              disabled={busy || channelOptions.length === 0}
            >
              {channelOptions.length === 0 ? <option value="">{t("noOptionsPlaceholder")}</option> : null}
              {channelOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {!moreOpen ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex w-full items-center justify-between rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--muted)] ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)]"
          >
            <span>
              {t("methodLabel")} <span className="font-medium text-[var(--text)]">{selectedChannel?.label ?? "-"}</span>
              {note.trim() ? <span className="text-[var(--muted2)]"> · {t("withComment")}</span> : null}
            </span>
            <span className="text-[var(--muted2)]">{t("changeOrComment")}</span>
          </button>
        ) : null}

        {/* USD field if needed */}
        {needsUsd ? (
          <input
            value={usdText}
            onChange={(e) => setUsdText(e.target.value)}
            inputMode="decimal"
            placeholder={tCash("usdAmountPlaceholder")}
            className="field-surface w-full rounded-lg px-3 py-2 text-sm tabular-nums"
            disabled={busy}
          />
        ) : null}

        {/* Note */}
        {moreOpen ? (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tCash("commentOptional")}
            className="field-surface w-full rounded-lg px-3 py-2 text-sm"
            disabled={busy}
          />
        ) : null}

        <button
          type="submit"
          disabled={busy || options.length === 0 || channelOptions.length === 0}
          className="min-h-[48px] w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white disabled:opacity-50 active:opacity-90"
        >
          {busy ? t("recordingEllipsis") : t("acceptToCash")}
        </button>
      </form>
    </section>
  );
}
