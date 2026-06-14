"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TourBusAssignment } from "@/lib/types";
import type { Role } from "@/lib/types";
import { CopyDriverButton } from "@/components/tour-actions";
import { GuideBusCard } from "@/components/guide-bus-card";

function canUseDriverActions(role: Role): boolean {
  return role === "dispatcher" || role === "booking_dispatcher" || role === "guide" || role === "chief_guide";
}

function extractDriverPhone(comment: string | null | undefined): string | null {
  const raw = String(comment || "").trim();
  if (!raw) return null;

  const phoneLine =
    raw
      .split("\n")
      .map((x) => x.trim())
      .find((line) => /^тел\b/i.test(line)) ?? raw;
  const hasPlus = phoneLine.includes("+");
  const digits = phoneLine.replace(/[^\d]/g, "");
  if (!digits) return null;

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 9) return `+84${digits.slice(1)}`;
  if (digits.startsWith("84")) return `+${digits}`;
  return `+${digits}`;
}

function phoneToZaloPath(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `84${digits.slice(1)}`;
  if (digits.startsWith("84")) return digits;
  return digits;
}

function extractMeetingLine(comment: string | null | undefined): string | null {
  const raw = String(comment || "").trim();
  if (!raw) return null;
  const line = raw
    .split("\n")
    .map((x) => x.trim())
    .find((x) => /^встреча:/i.test(x));
  return line ? line.replace(/^встреча:\s*/i, "").trim() : null;
}

function stripMeetingLine(comment: string | null | undefined): string {
  const raw = String(comment || "").trim();
  if (!raw) return "";
  return raw
    .split("\n")
    .filter((x) => !/^встреча:/i.test(x.trim()))
    .join("\n")
    .trim();
}

function telHrefFromLine(line: string): string | null {
  const m = line.match(/^тел\s*:\s*(.+)$/i);
  if (!m) return null;
  const raw = m[1].trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.includes("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("84")) return `+${digits}`;
  return `+${digits}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("button, input, textarea, select, a, label"));
}

/** Содержимое блока «автобус / водитель» (без своей карточки/заголовка) - переиспользуется в обычном и встроенном виде. */
function BusDriverContent({
  buses,
  tourId,
  viewerRole,
  canCopyBookingAddresses,
  t,
}: {
  buses: TourBusAssignment[];
  tourId: string;
  viewerRole: Role;
  canCopyBookingAddresses: boolean;
  t: (key: string) => string;
}) {
  const guideTransportView = viewerRole === "guide" || viewerRole === "chief_guide";

  if (!buses.length) {
    return <p className="text-sm text-[var(--muted)]">{t("notAssignedByDispatcher")}</p>;
  }

  return (
    <>
      {!guideTransportView ? (
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{t("assignedByDispatcher")}</p>
      ) : null}
      <ul className={guideTransportView ? "mt-2 space-y-2" : "mt-3 space-y-4"}>
        {buses.map((bus, i) =>
          guideTransportView ? (
            <GuideBusCard key={bus.id ?? `${bus.busNumber}-${i}`} bus={bus} t={t} />
          ) : (
            <li
              key={bus.id ?? `${bus.busNumber}-${i}`}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
            >
              {(() => {
                const driverPhone = extractDriverPhone(bus.comment);
                const meetingInfo = extractMeetingLine(bus.comment);
                const cleanedComment = stripMeetingLine(bus.comment);
                const zaloHref = driverPhone ? `https://zalo.me/${phoneToZaloPath(driverPhone)}` : null;
                const showActions = canUseDriverActions(viewerRole);
                return (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("busLabel2")}</span>
                      <span className="text-lg font-semibold tabular-nums text-[var(--text)]">{bus.busNumber}</span>
                      {bus.seats != null ? (
                        <span className="text-[var(--muted)]">
                          · {bus.seats} {bus.seats === 1 ? "место" : bus.seats < 5 ? "места" : "мест"}
                        </span>
                      ) : null}
                    </div>
                    {meetingInfo ? (
                      <div className="mt-2 rounded-xl border border-sky-200/80 bg-sky-50 px-3 py-2 text-[12px] text-sky-900 dark:border-sky-700/50 dark:bg-sky-900/25 dark:text-sky-100">
                        <span className="font-semibold">{t("meetingWithDriver")}</span> {meetingInfo}
                      </div>
                    ) : null}

                    {cleanedComment ? (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("driverContacts")}</p>
                        <div className="mt-0.5 whitespace-pre-wrap break-words text-[var(--text)]">
                          {cleanedComment.split("\n").map((line, idx) => {
                            const tel = telHrefFromLine(line);
                            if (!tel) return <p key={idx}>{line}</p>;
                            const shown = line.replace(/^тел\s*:\s*/i, "");
                            const digits = tel.replace(/[^\d]/g, "");
                            return (
                              <p key={idx}>
                                Тел:{" "}
                                <a href={`tel:${digits}`} className="underline decoration-dotted underline-offset-2">
                                  {shown}
                                </a>
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-[var(--muted2)]">{t("noDriverContacts")}</p>
                    )}
                    {showActions ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {zaloHref ? (
                          <a
                            href={zaloHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white ring-1 ring-sky-500/60 shadow-sm transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:ring-sky-400/50 dark:hover:bg-sky-400"
                          >
                            <span aria-hidden>💬</span>
                            {t("writeZaloShort")}
                          </a>
                        ) : null}
                        {canCopyBookingAddresses ? <CopyDriverButton tourId={tourId} /> : null}
                      </div>
                    ) : null}

                    {bus.langNoteEn?.trim() || bus.langNoteVn?.trim() ? (
                      <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                        {bus.langNoteEn?.trim() ? (
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("noteEN")}</p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--muted)]">{bus.langNoteEn.trim()}</p>
                          </div>
                        ) : null}
                        {bus.langNoteVn?.trim() ? (
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("noteVN")}</p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--muted)]">{bus.langNoteVn.trim()}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {bus.assignedByName ? (
                      <p className="mt-3 text-[11px] text-[var(--muted2)]">
                        {t("recordBy")} <span className="text-[var(--text)]">{bus.assignedByName}</span>
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </li>
          ),
        )}
      </ul>
      {guideTransportView && canUseDriverActions(viewerRole) && canCopyBookingAddresses ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyDriverButton tourId={tourId} />
        </div>
      ) : null}
    </>
  );
}

/** Блок «автобус / водитель» для всех на странице тура; данные назначает диспетчер. */
export function TourBusDriverBlock({
  buses,
  tourId,
  viewerRole,
  /** Ложь для гида, открывшего чужой тур: не копировать адреса отелей из API. */
  canCopyBookingAddresses = true,
  /** Без своей карточки/заголовка - встраивается в общий свёрнутый блок (для гида). */
  embedInGroup = false,
}: {
  buses: TourBusAssignment[];
  tourId: string;
  viewerRole: Role;
  canCopyBookingAddresses?: boolean;
  embedInGroup?: boolean;
}) {
  const t = useTranslations("tour");
  const [open, setOpen] = useState(false);

  if (embedInGroup) {
    return (
      <BusDriverContent
        buses={buses}
        tourId={tourId}
        viewerRole={viewerRole}
        canCopyBookingAddresses={canCopyBookingAddresses}
        t={t}
      />
    );
  }

  if (!buses.length) {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
        <div
          className="flex items-center justify-between gap-2"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={(e) => {
            if (isInteractiveTarget(e.target)) return;
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("busAndDriverTitle")}</p>
        </div>
        {open ? <p className="mt-2 text-sm text-[var(--muted)]">{t("notAssignedByDispatcher")}</p> : null}
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted2)]">{t("busAndDriverTitle")}</p>
      </div>
      {open ? (
        <BusDriverContent
          buses={buses}
          tourId={tourId}
          viewerRole={viewerRole}
          canCopyBookingAddresses={canCopyBookingAddresses}
          t={t}
        />
      ) : null}
    </div>
  );
}
