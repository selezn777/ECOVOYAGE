import type { TourBusAssignment } from "@/lib/types";

function extractDriverPhoneFromBusInfo(busInfo?: string): string | null {
  const s = String(busInfo || "");
  const m = s.match(/(?:тел|phone)\s*:\s*([+\d][\d\s().-]{6,})/i);
  if (!m) return null;
  const raw = m[1].trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.includes("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("84")) return `+${digits}`;
  return `+${digits}`;
}

function phoneToZaloPath(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `84${digits.slice(1)}`;
  if (digits.startsWith("84")) return digits;
  return digits;
}

function parseBusCommentForGuide(comment: string | null): {
  driver: string | null;
  meeting: string | null;
  extraLines: string[];
} {
  let driver: string | null = null;
  let meeting: string | null = null;
  const extra: string[] = [];
  for (const line of String(comment ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const vd = /^водитель\s*:\s*(.+)$/i.exec(line);
    if (vd) {
      driver = vd[1].trim();
      continue;
    }
    const mt = /^встреча\s*:\s*(.+)$/i.exec(line);
    if (mt) {
      meeting = mt[1].trim();
      continue;
    }
    if (/^тел\s*:/i.test(line)) continue;
    extra.push(line);
  }
  return { driver, meeting, extraLines: extra };
}

/** Спокойная карточка автобуса для гида (дашборд и страница тура). */
export function GuideBusCard({ bus, t }: { bus: TourBusAssignment; t: (key: string) => string }) {
  const { driver, meeting, extraLines } = parseBusCommentForGuide(bus.comment);
  const blockPhone = extractDriverPhoneFromBusInfo(String(bus.comment ?? ""));
  const phoneDigits = blockPhone?.replace(/[^\d]/g, "") ?? "";
  const zaloHref = blockPhone ? `https://zalo.me/${phoneToZaloPath(blockPhone)}` : null;

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted2)]">{t("busLabel2")}</div>
      <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-tight text-[var(--text)]">{bus.busNumber}</p>
      {bus.seats != null ? (
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {bus.seats} {bus.seats === 1 ? t("seatOne") : bus.seats < 5 ? t("seatFew") : t("seatMany")}
        </p>
      ) : null}
      <dl className="mt-3 space-y-2.5 text-sm">
        {driver ? (
          <div>
            <dt className="text-[11px] font-medium text-[var(--muted2)]">{t("driver")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--text)]">{driver}</dd>
          </div>
        ) : null}
        {phoneDigits ? (
          <div>
            <dt className="text-[11px] font-medium text-[var(--muted2)]">{t("phone")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--text)]">{blockPhone ?? phoneDigits}</dd>
          </div>
        ) : null}
        {meeting ? (
          <div>
            <dt className="text-[11px] font-medium text-[var(--muted2)]">{t("meetingLabel")}</dt>
            <dd className="mt-0.5 font-medium text-[var(--text)]">{meeting}</dd>
          </div>
        ) : null}
      </dl>
      {phoneDigits ? (
        <div className="pointer-events-auto relative z-[3] mt-3 flex flex-wrap gap-2">
          <a
            href={`tel:${phoneDigits}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold tracking-wide text-white ring-1 ring-emerald-500/60 shadow-sm transition-colors hover:bg-emerald-500 dark:bg-emerald-500 dark:ring-emerald-400/50 dark:hover:bg-emerald-400"
          >
            <span aria-hidden>📞</span>
            {t("callDriver")}
          </a>
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
        </div>
      ) : null}
      {extraLines.length > 0 ? (
        <p className="mt-3 border-t border-[var(--border)]/80 pt-2.5 text-[13px] leading-relaxed text-[var(--muted)] whitespace-pre-wrap">
          {extraLines.join("\n")}
        </p>
      ) : null}
      {bus.langNoteEn?.trim() || bus.langNoteVn?.trim() ? (
        <div className="mt-3 grid gap-2 border-t border-[var(--border)]/80 pt-2.5 text-[12px] sm:grid-cols-2">
          {bus.langNoteEn?.trim() ? (
            <div>
              <p className="text-[11px] font-medium text-[var(--muted2)]">{t("noteEN")}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--muted)]">{bus.langNoteEn.trim()}</p>
            </div>
          ) : null}
          {bus.langNoteVn?.trim() ? (
            <div>
              <p className="text-[11px] font-medium text-[var(--muted2)]">{t("noteVN")}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--muted)]">{bus.langNoteVn.trim()}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {bus.assignedByName ? (
        <p className="mt-2 text-[11px] text-[var(--muted2)]">
          {t("recordBy")} <span className="text-[var(--text)]">{bus.assignedByName}</span>
        </p>
      ) : null}
    </li>
  );
}
